import * as THREE from 'three'
import { CONFIG } from '../config/GameConfig.js'
import { Time } from './Time.js'
import { InputManager } from './InputManager.js'
import { Player } from '../player/Player.js'
import { CameraController } from '../player/CameraController.js'
import { EnemyManager } from '../enemies/EnemyManager.js'
import { WaveManager } from '../enemies/WaveManager.js'
import { ProjectileManager } from '../combat/ProjectileManager.js'
import { WeaponSystem } from '../combat/WeaponSystem.js'
import { ContactDamage } from '../combat/ContactDamage.js'
import { HUD } from '../ui/HUD.js'
import { UpgradeMenu } from '../ui/UpgradeMenu.js'
import { Progression } from '../progression/Progression.js'
import { GemManager } from '../progression/GemManager.js'
import { SkillSystem } from '../skills/SkillSystem.js'
import { BossController } from '../enemies/BossController.js'
import { StartMenu } from '../ui/StartMenu.js'
import { PlayerProfile } from '../meta/PlayerProfile.js'
import { SoundManager } from '../audio/SoundManager.js'
import { GameAudio } from '../audio/GameAudio.js'
import { FrameEvents } from './FrameEvents.js'
import { ParticleSystem } from '../vfx/ParticleSystem.js'
import { GameVfx } from '../vfx/GameVfx.js'
import { PostFX } from '../vfx/PostFX.js'
import { SkillLab } from '../ui/SkillLab.js'
import { rollUpgrades } from '../config/UpgradeDefs.js'
import { PerformanceMonitor } from '../perf/PerformanceMonitor.js'

export const GAME_STATE = {
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  /** Subiste de nivel: la simulación se congela hasta que elijas una mejora. */
  LEVEL_UP: 'LEVEL_UP',
  GAME_OVER: 'GAME_OVER',
  VICTORY: 'VICTORY',
}

/**
 * GameManager — dueño del loop y de la escena.
 *
 * Es el único que llama a requestAnimationFrame y el único que decide el
 * orden en que se actualizan los sistemas. Ningún sistema arranca su propio
 * loop por su cuenta.
 */
export class GameManager {
  constructor(container) {
    this.container = container
    this.state = GAME_STATE.MENU

    this._initRenderer()
    this._initScene()

    this.time = new Time()
    this.input = new InputManager()
    this.player = new Player(this.scene)
    this.cameraController = new CameraController(this.camera, this.player)
    this.enemies = new EnemyManager(this.scene)
    this.waves = new WaveManager(this.enemies)
    this.projectiles = new ProjectileManager(this.scene, this.enemies)
    this.weapons = new WeaponSystem(this.player, this.enemies, this.projectiles)
    this.contact = new ContactDamage(this.player, this.enemies)
    this.progression = new Progression()
    this.gems = new GemManager(this.scene)
    this.skills = new SkillSystem(this.player, this.enemies, this.progression, this.scene)
    this.weapons.progression = this.progression // las mejoras de partida afectan daño y cadencia

    // Perfil: lo único que sobrevive a cerrar el navegador. El arma lo lee al
    // equipar para aplicar las mejoras compradas entre partidas.
    this.profile = new PlayerProfile()
    this.weapons.profile = this.profile

    /** Niveles ganados que todavía no eligieron mejora. */
    this._pendingLevels = 0
    /** Moneda que dejó la última partida. La muestra la pantalla de muerte. */
    this._lastReward = 0
    /** Draw calls del frame anterior; el panel corre antes de dibujar. */
    this._lastCalls = 0
    this.upgradeMenu = new UpgradeMenu((up) => this._applyUpgrade(up))

    this.boss = new BossController(this.enemies, this.waves, this.player, this.scene)
    this.startMenu = new StartMenu((key) => this.startRun(key), this.profile)

    // Audio. El contexto todavía NO existe: los navegadores lo bloquean hasta
    // que hay un gesto del usuario, así que se crea en el primer clic o tecla.
    this.sound = new SoundManager()
    this.sound.setMuted(this.profile.muted)
    this.startMenu.sound = this.sound

    // Los hechos del frame se deducen UNA vez y los leen los dos consumidores.
    // Si cada uno dedujera lo suyo, el chispazo y el sonido del mismo impacto
    // terminarían separándose.
    const sistemas = {
      player: this.player,
      enemies: this.enemies,
      weapons: this.weapons,
      boss: this.boss,
      projectiles: this.projectiles,
    }
    this.events = new FrameEvents(sistemas)
    this.audio = new GameAudio(this.sound)
    this.particles = new ParticleSystem(this.scene)
    this.vfx = new GameVfx(this.particles, sistemas)
    this.postfx = new PostFX(this.renderer, this.scene, this.camera)

    this.hud = new HUD(
      this.player,
      this.enemies,
      this.waves,
      this.weapons,
      this.progression,
      this.boss,
      this.skills,
    )
    this.monitor = new PerformanceMonitor()

    // Herramienta de diseño, no del juego: solo existe en desarrollo.
    this.skillLab = import.meta.env.DEV
      ? new SkillLab(this.skills, this.enemies, this.player, this.progression)
      : null

    this._onResize = this._onResize.bind(this)
    window.addEventListener('resize', this._onResize)

    this._onKey = this._onKey.bind(this)
    window.addEventListener('keydown', this._onKey)

    // Un solo enganche para desbloquear el audio: cualquier gesto sirve, y
    // unlock() es idempotente, así que no hace falta desengancharlo.
    this._unlockAudio = () => this.sound.unlock()
    window.addEventListener('pointerdown', this._unlockAudio)
    window.addEventListener('keydown', this._unlockAudio)

    this._tick = this._tick.bind(this)
  }

  _onKey(e) {
    // Silencio: funciona en cualquier estado, como en cualquier otro juego.
    if (e.code === 'KeyM') {
      this.profile.muted = this.sound.toggleMute()
      this.profile.save()
      this.startMenu.refreshSound()
      return
    }

    // B compara con y sin bloom. Es de desarrollo, pero no molesta que exista.
    if (e.code === 'KeyB') {
      this.postfx.toggle()
      return
    }

    if (this.state !== GAME_STATE.GAME_OVER) return

    // R reintenta con la misma arma; T vuelve al taller.
    if (e.code === 'KeyR') this.startRun(this.startMenu.selected)
    else if (e.code === 'KeyT') this.toMenu()
  }

  _upgradeContext() {
    return {
      player: this.player,
      weapons: this.weapons,
      skills: this.skills,
      progression: this.progression,
    }
  }

  _openUpgradeMenu() {
    const ctx = this._upgradeContext()
    const options = rollUpgrades(ctx, CONFIG.PROGRESSION.UPGRADE_CHOICES)

    // Puede no quedar nada por tomar (todo al máximo). En ese caso el nivel se
    // consume igual y la partida sigue, en vez de trabarse con un menú vacío.
    if (options.length === 0) {
      this._pendingLevels--
      return
    }

    this.state = GAME_STATE.LEVEL_UP
    this.upgradeMenu.show(options, this.progression.level, ctx)
  }

  _applyUpgrade(up) {
    this.sound.play('UPGRADE_PICK')
    up.apply(this._upgradeContext())
    this.progression.markTaken(up.key)
    this._pendingLevels--

    // Si subiste varios niveles de una, se elige uno por vez.
    if (this._pendingLevels > 0) this._openUpgradeMenu()
    else this.state = GAME_STATE.PLAYING
  }

  /**
   * Cierra la partida y cobra la recompensa.
   *
   * Se llama UNA vez, en la transición: la rama de GAME_OVER del loop corre
   * todos los frames, y acreditar ahí multiplicaría la moneda por los frames
   * que tarde el jugador en apretar una tecla.
   */
  _endRun() {
    this.state = GAME_STATE.GAME_OVER
    this._lastReward = this.profile.finishRun(
      this.waves.elapsed,
      this.enemies.killCount,
      this.boss.defeated,
    )
  }

  /** Vuelve a la pantalla de elección de arma. */
  toMenu() {
    this._clearRun()
    this.hud.hideGameOver()
    this.state = GAME_STATE.MENU
    this.startMenu.show()
  }

  /**
   * Empieza una partida con el arma elegida.
   *
   * El arma es lo ÚNICO que sobrevive de una decisión previa: todo lo demás
   * (nivel, habilidades, estadísticas) arranca de cero.
   */
  startRun(weaponKey) {
    this._clearRun()
    this.weapons.equip(weaponKey)
    // El arma de la partida en curso se registra ACÁ y no solo al elegirla en el
    // menú: así "R para reintentar" repite lo que estabas jugando, venga la
    // partida de donde venga.
    this.startMenu.selected = weaponKey
    this.profile.weapon = weaponKey
    this.profile.save()
    this.startMenu.hide()
    this.hud.hideGameOver()
    this.state = GAME_STATE.PLAYING
    this.events.reset()
  }

  /** Deja todos los sistemas en su estado inicial, sin recrear nada. */
  _clearRun() {
    this.player.reset()
    this.cameraController.snap()
    this.enemies.clear()
    this.projectiles.clear()
    this.gems.clear()
    this.particles.clear()
    this.waves.reset()
    this.weapons.reset()
    this.skills.reset()
    this.boss.reset()
    this.contact.reset()
    this.progression.reset()
    this._pendingLevels = 0
    this.upgradeMenu.hide()
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    // Techo de DPR: en pantallas 3x el coste de fill rate se dispara sin
    // ganancia visual real para este estilo.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    // El contador de draw calls se reinicia solo en cada render(), y el
    // post-procesado hace varios por frame: sin esto el panel de diagnóstico
    // mostraría solo el último pase y diría "1" con la escena entera dibujada.
    this.renderer.info.autoReset = false
    this.container.appendChild(this.renderer.domElement)
  }

  _initScene() {
    const { ARENA_SIZE, GROUND_COLOR, GRID_COLOR, FOG_COLOR, FOG_NEAR, FOG_FAR } = CONFIG.WORLD

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(FOG_COLOR)
    this.scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR)

    this.camera = new THREE.PerspectiveCamera(
      CONFIG.CAMERA.FOV,
      window.innerWidth / window.innerHeight,
      0.1,
      300,
    )

    // Luz: hemisférica para relleno + direccional como key. Sin shadow maps
    // por ahora (coste alto, decisión a revisar en la Parte I con presupuesto medido).
    this.scene.add(new THREE.HemisphereLight(0x9fd4ff, 0x20262f, 0.9))
    const key = new THREE.DirectionalLight(0xffffff, 1.4)
    key.position.set(12, 20, 8)
    this.scene.add(key)

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE),
      new THREE.MeshStandardMaterial({ color: GROUND_COLOR, roughness: 0.95 }),
    )
    ground.rotation.x = -Math.PI / 2
    this.scene.add(ground)

    // La grilla da referencia de escala y de velocidad; sin ella, moverse
    // sobre un plano liso se siente como no moverse.
    const grid = new THREE.GridHelper(ARENA_SIZE, ARENA_SIZE / 2, GRID_COLOR, GRID_COLOR)
    grid.position.y = 0.01
    grid.material.transparent = true
    grid.material.opacity = 0.35
    this.scene.add(grid)
  }

  /**
   * Arranca en el menú, no en la partida: el arma se elige antes de jugar y esa
   * elección define todo el run.
   */
  start() {
    this.state = GAME_STATE.MENU
    this.startMenu.show()
    requestAnimationFrame(this._tick)
  }

  _tick() {
    requestAnimationFrame(this._tick)

    this.renderer.info.reset()
    this.time.update()
    const delta = this.time.delta

    if (this.state === GAME_STATE.PLAYING) {
      const move = this.input.getMovementVector()

      // ORDEN EXPLÍCITO DEL FRAME. No es arbitrario, cada paso depende del
      // anterior y cambiarlo de lugar produce bugs sutiles:
      //
      //   1. el jugador se mueve
      //   2. las oleadas deciden qué aparece, alrededor de su posición nueva
      //   3. la horda persigue esa misma posición y construye la rejilla
      //      espacial del frame (si fuera antes que 1, la perseguiría con un
      //      frame de retraso y en diagonal se vería como que "resbala")
      //   4. las armas apuntan y disparan sobre la horda ya ubicada
      //   5. los proyectiles se mueven y colisionan usando esa misma rejilla
      //   6. recién ACÁ se aplican las muertes: mientras 4 y 5 recorrían la
      //      horda, los índices tenían que quedarse quietos
      //   7. la horda cobra: contacto con el jugador
      //   8. la cámara sigue al jugador
      //   9. lo que quedó vivo se vuelca a la GPU
      this.player.update(delta, move)
      this.waves.update(delta, this.player.position)
      this.boss.update(delta)
      this.enemies.update(delta, this.player.position)
      this.weapons.update(delta)
      this.skills.update(delta, this.time.elapsed)
      this.projectiles.update(delta)
      this.enemies.resolveDamage()
      this.contact.update(delta)
      this.cameraController.update(delta)

      // La XP no se cobra al matar: cae como gema y hay que ir a buscarla.
      const overflow = this.gems.spawnFromDeaths(this.enemies)
      const picked = this.gems.update(delta, this.player.position, this.progression.stats.magnetRadius)
      const subidos = this.progression.addXp(picked + overflow)
      this._pendingLevels += subidos

      // Audio y partículas van DESPUÉS de la simulación: leen el frame ya
      // resuelto y deducen qué pasó. Ningún sistema les avisa nada.
      //
      // El orden de estas cuatro líneas importa igual que el resto del frame:
      // primero se deducen los hechos, después el VFX emite las partículas
      // nuevas, y recién ahí se integran y se dibujan. Emitir después de
      // sincronizar haría que cada explosión apareciera un frame tarde.
      this.events.update(picked + overflow, subidos)
      this.audio.update(this.events)
      this.vfx.update(this.events)
      this.particles.update(delta)

      this.enemies.sync(this.time.elapsed, this.player.position)
      this.projectiles.sync()
      this.gems.sync(this.time.elapsed)
      this.particles.sync()

      if (this.player.isDead) this._endRun()
      else if (this._pendingLevels > 0) this._openUpgradeMenu()

      this.hud.update(delta)
      this.monitor.update(delta, {
        x: this.player.position.x,
        z: this.player.position.z,
        speed: this.player.currentSpeed,
        moving: this.player.isMoving,
        inputX: move.x,
        inputZ: move.z,
        enemies: this.enemies.count,
        projectiles: this.projectiles.count,
        renderCalls: this._lastCalls,
      })
    } else if (this.state === GAME_STATE.GAME_OVER) {
      this.hud.showGameOver(
        this.enemies.killCount,
        this.waves.elapsed,
        this._lastReward,
        this.profile.currency,
      )
    }

    // El post-procesado hace cumplir su propio presupuesto: si no rinde, se
    // apaga solo y esto pasa a ser un render directo (ver PostFX).
    this.postfx.render(this.monitor.fps, delta)
    // Se guarda para el frame siguiente: el panel corre antes de dibujar.
    this._lastCalls = this.renderer.info.render.calls
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.postfx.setSize(window.innerWidth, window.innerHeight)
  }
}
