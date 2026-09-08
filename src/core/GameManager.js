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
import { createWeaponMods } from '../combat/WeaponMods.js'
import { ContactDamage } from '../combat/ContactDamage.js'
import { HUD } from '../ui/HUD.js'
import { UpgradeMenu } from '../ui/UpgradeMenu.js'
import { Progression } from '../progression/Progression.js'
import { PickupManager } from '../progression/PickupManager.js'
import { SkillSystem } from '../skills/SkillSystem.js'
import { BossController } from '../enemies/BossController.js'
import { StartMenu } from '../ui/StartMenu.js'
import { Squad } from '../player/Squad.js'
import { PlayerProfile } from '../meta/PlayerProfile.js'
import { SoundManager } from '../audio/SoundManager.js'
import { GameAudio } from '../audio/GameAudio.js'
import { FrameEvents } from './FrameEvents.js'
import { ParticleSystem } from '../vfx/ParticleSystem.js'
import { GameVfx } from '../vfx/GameVfx.js'
import { PostFX } from '../vfx/PostFX.js'
import { PauseMenu } from '../ui/PauseMenu.js'
import { OptionsMenu } from '../ui/OptionsMenu.js'
import { FloatingText } from '../ui/FloatingText.js'
import { SkillLab } from '../ui/SkillLab.js'
import { rollUpgrades } from '../config/UpgradeDefs.js'
import { PerformanceMonitor } from '../perf/PerformanceMonitor.js'
import { RunRecorder } from '../dev/RunRecorder.js'

const GAME_STATE = {
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
    /**
     * Lo que las habilidades de personaje le cambian al arma. Se crea acá
     * porque lo comparten tres sistemas que no se conocen entre sí: lo
     * escribe SkillSystem, lo leen WeaponSystem y ProjectileManager. Es una
     * sola referencia, mutada en el lugar (ver WeaponMods.js).
     */
    this.weaponMods = createWeaponMods()

    this.projectiles = new ProjectileManager(this.scene, this.enemies, this.weaponMods)
    this.weapons = new WeaponSystem(this.player, this.enemies, this.projectiles, this.weaponMods)
    this.contact = new ContactDamage(this.player, this.enemies)
    this.progression = new Progression()
    this.pickups = new PickupManager(this.scene)
    this.skills = new SkillSystem(this.player, this.enemies, this.progression, this.scene, this.weaponMods)
    this.weapons.progression = this.progression // las mejoras de partida afectan daño y cadencia

    // Perfil: lo único que sobrevive a cerrar el navegador. El arma lo lee al
    // equipar para aplicar las mejoras compradas entre partidas.
    this.profile = new PlayerProfile()
    this.weapons.profile = this.profile

    /**
     * El escuadrón: hasta dos compañeros que se suman AL SUBIR DE NIVEL.
     *
     * Se crea después del perfil porque cada compañero necesita las mejoras
     * de taller de SU arma, y comparte la textura del soldado del jugador:
     * generar de nuevo ese canvas por cada muñeco sería pagar tres veces lo
     * más caro de construir un soldado.
     */
    this.squad = new Squad(
      this.scene,
      {
        enemies: this.enemies,
        projectiles: this.projectiles,
        progression: this.progression,
        profile: this.profile,
      },
      this.player.model.atlas,
    )

    /** Niveles ganados que todavía no eligieron mejora. */
    this._pendingLevels = 0
    /** Moneda que dejó la última partida. La muestra la pantalla de muerte. */
    this._lastReward = 0
    /**
     * ¿Hay una partida sin cobrar? La ponen `startRun` y la baja `_settleRun`.
     * Es lo que hace que cobrar sea idempotente: se puede llamar de más, nunca
     * paga de más.
     */
    this._runOpen = false
    /** Draw calls del frame anterior; el panel corre antes de dibujar. */
    this._lastCalls = 0
    /**
     * Estadísticas para el panel de diagnóstico. Se reserva UNA vez y se
     * rellena en el lugar: antes se armaba un objeto literal por frame, que a
     * 60 Hz son 3600 objetos por minuto de basura para algo que ni siquiera
     * está encendido en producción.
     */
    this._stats = {
      x: 0,
      z: 0,
      speed: 0,
      moving: false,
      inputX: 0,
      inputZ: 0,
      enemies: 0,
      projectiles: 0,
      renderCalls: 0,
    }
    this.upgradeMenu = new UpgradeMenu((up) => this._applyUpgrade(up))

    this.boss = new BossController(this.enemies, this.waves, this.player, this.scene)
    this.startMenu = new StartMenu((key) => this.startRun(key), this.profile)

    // Audio. El contexto todavía NO existe: los navegadores lo bloquean hasta
    // que hay un gesto del usuario, así que se crea en el primer clic o tecla.
    this.sound = new SoundManager()
    this.startMenu.sound = this.sound
    // El volumen y el silencio guardados se aplican más abajo, junto con el
    // resto de los ajustes: un solo camino de ida (ver _applySettings).

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
    this.floaters = new FloatingText()

    /**
     * Ajustes y controles.
     *
     * El panel no sabe aplicar nada: lee del perfil y avisa qué se tocó.
     * Acá abajo está el ÚNICO camino por el que un ajuste llega a un
     * sistema, y por eso el panel no puede desincronizarse del juego.
     */
    this.options = new OptionsMenu({
      leer: () => ({
        volume: this.profile.volume,
        muted: this.profile.muted,
        bloom: this.profile.bloom,
        quality: this.profile.quality,
        aimManual: this.profile.aimManual,
      }),
      cambiar: (clave, valor) => this._cambiarAjuste(clave, valor),
      onWipe: () => this._wipeProfile(),
      onClose: () => this._closeOptions(),
    })

    /**
     * ¿La pausa la puso el panel, o el jugador?
     *
     * Consultar los controles con H en mitad de una partida tiene que
     * devolverte a la partida, no al menú de pausa: pediste mirar algo, no
     * frenar. Pero la simulación TIENE que congelarse mientras mirás, o la
     * horda te come mientras leés qué tecla es la pausa.
     */
    this._pausedByOptions = false

    this.pauseMenu = new PauseMenu({
      onResume: () => this.resume(),
      onQuit: () => this.toMenu(),
      onToggleSound: () => this._toggleSound(),
      onOptions: () => this.options.show(),
    })

    // Los dos únicos lugares desde donde se abre: antes de jugar y en pausa.
    // Es la misma pantalla a propósito — un ajuste que solo existe en un
    // sitio es un ajuste que la mitad de los jugadores no encuentra.
    this.startMenu.onOptions = () => this.options.show()

    // Espacio alterna el apuntado sin pasar por el panel. Si el perfil no se
    // enterara, el ajuste se olvidaría al recargar y el menú mostraría lo
    // contrario de lo que hace el arma.
    this.input.onAimChange = (manual) => {
      this.profile.aimManual = manual
      this.profile.save()
      this.options.render()
    }

    // Lo guardado se aplica ANTES del primer frame: si no, el que dejó el
    // juego en calidad baja lo vuelve a abrir en alta y se come el tirón.
    this._applySettings()

    this.hud = new HUD(
      this.player,
      this.enemies,
      this.waves,
      this.weapons,
      this.progression,
      this.boss,
      this.skills,
      this.squad,
    )
    // Los botones de la pantalla de muerte hacen lo mismo que R y T. Sin
    // esto, en un teléfono morirse no tiene salida.
    this.hud.onRetry = () => this.startRun(this.startMenu.selected)
    this.hud.onShop = () => this.toMenu()
    this.hud.onHelp = () => this._openControls()

    this.monitor = new PerformanceMonitor()

    /**
     * Caja negra de la partida. Igual que el laboratorio de habilidades: es
     * una herramienta para diseñar, no parte del juego, así que en producción
     * no existe. Todas las llamadas usan `?.` por eso.
     */
    this.recorder = import.meta.env.DEV ? new RunRecorder() : null

    // Herramienta de diseño, no del juego: solo existe en desarrollo.
    this.skillLab = import.meta.env.DEV
      ? new SkillLab(this.skills, this.enemies, this.player, this.progression)
      : null

    this._onResize = this._onResize.bind(this)
    window.addEventListener('resize', this._onResize)

    this._onKey = this._onKey.bind(this)
    window.addEventListener('keydown', this._onKey)

    /**
     * PERDER EL FOCO PAUSA LA PARTIDA.
     *
     * En un portal el juego vive dentro de un iframe y no controla lo que
     * pasa alrededor: el jugador cambia de pestaña, entra una publicidad,
     * suena una llamada. Sin esto la horda le sigue pegando a alguien que
     * no está mirando, y el audio sigue sonando desde una pestaña que
     * parece apagada — la queja número uno de cualquier juego web.
     *
     * Vuelve pausado A PROPÓSITO: retomar solo tiraría al jugador de vuelta
     * a una pelea que dejó a medias sin darle un segundo para ubicarse.
     *
     * Acá es donde van a engancharse después los avisos del SDK del portal
     * (empieza el aviso -> pausar y callar, termina -> devolver el sonido):
     * el trabajo ya está hecho, solo cambia quién lo dispara.
     */
    this._onVisibility = this._onVisibility.bind(this)
    document.addEventListener('visibilitychange', this._onVisibility)

    // Pausa para dedos. En un teléfono no hay Escape.
    this._touchPause = document.getElementById('touch-pause')
    this._touchPause?.addEventListener('click', () => this.pause())

    // Y el "?" al lado. En un teléfono no hay tecla H, así que sin este
    // botón la única forma de ver los controles sería pausar y entrar a los
    // ajustes: tres toques para leer con qué se juega.
    document.getElementById('touch-help')?.addEventListener('click', () => this._openControls())

    // Un solo enganche para desbloquear el audio: cualquier gesto sirve, y
    // unlock() es idempotente, así que no hace falta desengancharlo.
    this._unlockAudio = () => this.sound.unlock()
    window.addEventListener('pointerdown', this._unlockAudio)
    window.addEventListener('keydown', this._unlockAudio)

    this._tick = this._tick.bind(this)

    /**
     * APUNTADO MANUAL: del mouse al mundo.
     *
     * InputManager sabe dónde está el puntero en coordenadas de pantalla, pero
     * no puede convertirlo a una posición del mundo sin la cámara — y no la
     * tiene a propósito. Esa traducción vive acá, y lo único que cruza hacia
     * la simulación son dos números (aimX, aimZ). El sistema de armas sigue
     * sin saber que existe una cámara.
     *
     * Los tres objetos se crean una vez: esto corre en cada frame.
     */
    this._raycaster = new THREE.Raycaster()
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    this._aimPoint = new THREE.Vector3()
  }

  /** Deja en `weapons` el punto del suelo bajo el mouse, si el modo es manual. */
  _updateAim() {
    const input = this.input
    const w = this.weapons
    w.aimActive = input.aimManual && input.pointerSeen
    if (!w.aimActive) return

    this._raycaster.setFromCamera(input.pointer, this.camera)
    // Si la cámara mirara al horizonte el rayo no cortaría el suelo. Con la
    // cámara cenital de este juego no pasa, pero devolver null es gratis y
    // evita escribir NaN en la posición de apuntado.
    if (!this._raycaster.ray.intersectPlane(this._groundPlane, this._aimPoint)) {
      w.aimActive = false
      return
    }
    w.aimX = this._aimPoint.x
    w.aimZ = this._aimPoint.z
  }

  _onKey(e) {
    // Con los ajustes abiertos mandan los ajustes: Escape cierra el panel en
    // lugar de pausar o despausar, que cambiaría el estado de la partida sin
    // que nadie lo haya pedido.
    if (this.options.visible) {
      if (e.code === 'Escape' || e.code === 'KeyH') this._closeOptions()
      else if (e.code === 'KeyM') this._toggleSound()
      return
    }

    // Silencio: funciona en cualquier estado, como en cualquier otro juego.
    if (e.code === 'KeyM') {
      this._toggleSound()
      return
    }

    // Pausa. Solo tiene sentido jugando o ya pausado: en el taller, en el menú
    // de nivel o muerto no hay nada que congelar.
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (this.state === GAME_STATE.PLAYING) this.pause()
      else if (this.state === GAME_STATE.PAUSED) this.resume()
      return
    }

    // Los controles, sin pasar por los ajustes. En un juego de portal el
    // jugador no viene de leer un manual: la tecla tiene que estar donde
    // se la busca.
    if (e.code === 'KeyH') {
      this._openControls()
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

  _onVisibility() {
    if (document.hidden) {
      this.pause()
      // Suspender el contexto es más honesto que silenciarlo: silenciar
      // pisaría la preferencia del jugador y habría que acordarse de
      // restaurarla. Suspendido no suena y no gasta nada.
      this.sound.suspend()
      return
    }

    // Al volver NO se reanuda la partida, solo el audio: el jugador decide
      // cuándo seguir, desde el menú de pausa que quedó abierto.
    this.sound.unlock()
  }

  _toggleSound() {
    this.profile.muted = this.sound.toggleMute()
    this.profile.save()
    this.startMenu.refreshSound()
    this.pauseMenu.refreshSound(this.profile.muted)
    // El panel de ajustes muestra el mismo dato: si está abierto, mentiría.
    this.options.render()
  }

  /**
   * Vuelca al juego TODO lo que dice el perfil. Se llama al arrancar y
   * después de borrar el perfil.
   *
   * Usa `setEnabled` y no `setEnabledByUser` para el resplandor: acá nadie
   * pidió nada a mano, así que si el post-procesado se apagó solo por falta
   * de rendimiento tiene que quedarse apagado. Encenderlo de nuevo desde el
   * ajuste guardado sería deshacer la única protección automática que tiene
   * el juego contra una máquina que no da.
   */
  _applySettings() {
    const p = this.profile
    this.sound.setVolume(p.volume)
    this.sound.setMuted(p.muted)
    this.postfx.setEnabled(p.bloom)
    this.input.aimManual = p.aimManual
    this._applyQuality(p.quality)
  }

  /** Calidad = techo de densidad de píxeles. Ver CONFIG.VFX.DPR_HIGH. */
  _applyQuality(quality) {
    const cap = quality === 'low' ? CONFIG.VFX.DPR_LOW : CONFIG.VFX.DPR_HIGH
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap))
    // El composer tiene sus propios buffers del tamaño de la pantalla: sin
    // esto seguiría dibujando el resplandor a la resolución vieja.
    this.postfx.setSize(window.innerWidth, window.innerHeight)
  }

  /**
   * Un ajuste cambió. Se aplica SOLO el que cambió, no todos.
   *
   * Volver a aplicarlos todos sería más corto y estaría mal: subir el volumen
   * volvería a encender un resplandor que el juego había apagado por su
   * cuenta. Cada rama toca un sistema y nada más.
   */
  _cambiarAjuste(clave, valor) {
    const p = this.profile

    if (clave === 'volume') {
      p.volume = valor
      this.sound.setVolume(valor)
    } else if (clave === 'muted') {
      p.muted = valor
      this.sound.setMuted(valor)
      this.startMenu.refreshSound()
      this.pauseMenu.refreshSound(valor)
    } else if (clave === 'bloom') {
      p.bloom = valor
      // A mano SÍ puede revivirlo: si lo pedís vos, es tu decisión.
      this.postfx.setEnabledByUser(valor)
    } else if (clave === 'quality') {
      p.quality = valor
      this._applyQuality(valor)
    } else if (clave === 'aimManual') {
      p.aimManual = valor
      this.input.aimManual = valor
    } else {
      return // clave desconocida: no se guarda nada
    }

    p.save()
    this.options.render()
  }

  /**
   * Borrar el perfil. Vive acá y no en el menú porque toca tres cosas que el
   * panel de ajustes no conoce: el arma marcada, los sistemas que llevan los
   * ajustes puestos y la pantalla del taller.
   */
  _wipeProfile() {
    const aviso =
      '¿Borrar el perfil? Se pierden la moneda, las mejoras compradas, el mejor tiempo y los ajustes.'
    if (!confirm(aviso)) return

    this.profile.wipe()
    this.startMenu.selected = this.profile.weapon
    this._applySettings()
    this.startMenu.refresh()
    this.options.render()
  }

  /**
   * Pausa de verdad: el loop deja de entrar en la rama de PLAYING.
   *
   * Ningún sistema tiene que saber que la pausa existe, igual que con el menú
   * de subir de nivel. Y el salto de tiempo no importa: Time recorta el delta,
   * así que volver después de diez minutos entrega un frame normal.
   */
  pause() {
    if (this.state !== GAME_STATE.PLAYING) return
    this.state = GAME_STATE.PAUSED
    this.pauseMenu.show(
      {
        tiempo: this.waves.elapsed,
        bajas: this.enemies.killCount,
        nivel: this.progression.level,
        arma: this.weapons.def.name,
      },
      this.profile.muted,
    )
  }

  resume() {
    if (this.state !== GAME_STATE.PAUSED) return
    this.pauseMenu.hide()
    this.state = GAME_STATE.PLAYING
  }

  /** Abre la lista de controles desde donde sea, congelando la partida. */
  _openControls() {
    if (this.options.visible) return
    if (this.state === GAME_STATE.PLAYING) {
      this.pause()
      this._pausedByOptions = true
    }
    this.options.show('controles')
  }

  /**
   * Cierra el panel. Si la pausa la había puesto él, devuelve la partida.
   *
   * Es la diferencia entre "pausé para mirar algo" y "pausé": dejar al
   * jugador en el menú de pausa después de una consulta de dos segundos lo
   * obliga a un clic más para volver a lo que estaba haciendo.
   */
  _closeOptions() {
    this.options.hide()
    if (!this._pausedByOptions) return
    this._pausedByOptions = false
    this.resume()
  }

  _upgradeContext() {
    return {
      player: this.player,
      weapons: this.weapons,
      skills: this.skills,
      progression: this.progression,
      squad: this.squad,
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
    this.recorder?.anotarEleccion(this.progression.level, up.name || up.key)
    this._pendingLevels--

    // Si subiste varios niveles de una, se elige uno por vez.
    if (this._pendingLevels > 0) this._openUpgradeMenu()
    else this.state = GAME_STATE.PLAYING
  }

  /**
   * Cobra la partida en curso. UNA sola vez, la llamen las veces que la llamen.
   *
   * Hay dos maneras de terminar una partida —morirse y abandonar— y las dos
   * pagan lo mismo, porque el tiempo y las bajas ya ocurrieron igual. Antes
   * solo pagaba la muerte, y eso creaba un incentivo absurdo: para cobrar una
   * buena partida había que dejarse matar a propósito.
   *
   * La idempotencia no es un lujo. La rama de GAME_OVER del loop corre todos
   * los frames, así que un cobro sin bandera multiplicaría la moneda por los
   * frames que el jugador tarde en apretar una tecla; y desde GAME_OVER se
   * puede salir al taller, que vuelve a pasar por acá.
   *
   * Va SIEMPRE antes de `_clearRun()`, que es quien borra el tiempo, las bajas
   * y los bosses con los que se calcula el pago.
   *
   * @returns {number} lo cobrado, o 0 si no había nada que cobrar.
   */
  _settleRun() {
    if (!this._runOpen) return 0
    this._runOpen = false
    // Se paga por lo que JUNTASTE, no por lo que mataste: lo que quedó
    // tirado en el piso no cuenta. Ver PlayerProfile.rewardFor.
    const pago = this.profile.finishRun(this.waves.elapsed, this.progression.coins)
    // _lastReward se escribe antes de grabar para que el informe lo incluya:
    // en el camino de "abandonar" nadie más lo asigna.
    this._lastReward = pago
    this.recorder?.terminar(this, this._motivoFin || 'abandono')
    this._motivoFin = null
    return pago
  }

  /** Cierra la partida por muerte del jugador. */
  _endRun() {
    this.state = GAME_STATE.GAME_OVER
    this._motivoFin = 'muerte'
    // Los números dejan de actualizarse al salir de PLAYING: si no se limpian,
    // quedan congelados debajo de la pantalla de muerte.
    this.floaters.clear()
    this._lastReward = this._settleRun()
  }

  /** Vuelve a la pantalla de elección de arma, cobrando lo que se haya jugado. */
  toMenu() {
    // Abandonar paga lo trabajado. Si se viene del GAME_OVER esto no hace nada,
    // porque morir ya cobró. Antes de _clearRun, que borra los números del pago.
    this._settleRun()
    this.pauseMenu.hide()
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
    this._runOpen = true
    this.weapons.equip(weaponKey)
    // El arma de la partida en curso se registra ACÁ y no solo al elegirla en el
    // menú: así "R para reintentar" repite lo que estabas jugando, venga la
    // partida de donde venga.
    this.startMenu.selected = weaponKey
    this.profile.weapon = weaponKey
    this.profile.save()
    this.startMenu.hide()
    this.hud.hideGameOver()
    this.hud.showHints()
    this.state = GAME_STATE.PLAYING
    this.events.reset()
    this.recorder?.iniciar(this)
  }

  /**
   * Números flotantes. Solo tres cosas: lo que le hacés al boss, lo que te
   * hacen a vos y subir de nivel.
   *
   * Un número por cada impacto sobre 400 enemigos no sería información, sería
   * una cortina — y taparía justo lo que hay que ver. El daño a la horda ya se
   * comunica solo: el enemigo desaparece.
   */
  _spawnFloaters() {
    const ev = this.events
    const p = this.player.position

    if (ev.bossDamage > 0) {
      this.floaters.spawn(String(Math.round(ev.bossDamage)), this.boss.lastX, 3.4, this.boss.lastZ, 'dano')
    }
    if (ev.playerDamage > 0) {
      this.floaters.spawn('-' + Math.round(ev.playerDamage), p.x, 2.1, p.z, 'recibido')
    }
    if (ev.levels > 0) {
      this.floaters.spawn('NIVEL ' + this.progression.level, p.x, 2.6, p.z, 'nivel')
    }
  }

  /** Deja todos los sistemas en su estado inicial, sin recrear nada. */
  _clearRun() {
    this.player.reset()
    this.cameraController.snap()
    this.enemies.clear()
    this.projectiles.clear()
    this.pickups.clear()
    this.particles.clear()
    this.floaters.clear()
    this.waves.reset()
    this.weapons.reset()
    this.squad.reset()
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
    // ganancia visual real para este estilo. Lo vuelve a fijar
    // _applyQuality() en cuanto el perfil está leído.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.VFX.DPR_HIGH))
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
      //   4. las armas apuntan y disparan sobre la horda ya ubicada — la
      //      tuya y la de cada compañero, que primero camina a su puesto
      //      para no disparar desde donde estaba el frame pasado
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
      this._updateAim()
      this.weapons.update(delta)
      this.squad.update(delta, this.player.position)
      this.skills.update(delta, this.time.elapsed)
      this.projectiles.update(delta)
      this.enemies.resolveDamage()
      this.contact.update(delta)
      this.cameraController.update(delta)

      // La XP no se cobra al matar: cae como gema y hay que ir a buscarla.
      // Ni la XP ni la moneda se cobran al matar: caen al piso y hay que ir a
      // buscarlas. Lo que no entró en el pool (`sobra`) se acredita igual: el
      // techo del pool es un límite de memoria, no una regla del juego.
      const sobra = this.pickups.spawnFromDeaths(this.enemies)
      this.pickups.update(delta, this.player.position, this.progression.stats.magnetRadius)

      const xp = this.pickups.gotXp + sobra.xp
      this.progression.coins += this.pickups.gotCoins + sobra.coins
      if (this.pickups.gotHeal > 0) this.player.heal(this.pickups.gotHeal)

      const subidos = this.progression.addXp(xp)
      this._pendingLevels += subidos

      // Audio y partículas van DESPUÉS de la simulación: leen el frame ya
      // resuelto y deducen qué pasó. Ningún sistema les avisa nada.
      //
      // El orden de estas cuatro líneas importa igual que el resto del frame:
      // primero se deducen los hechos, después el VFX emite las partículas
      // nuevas, y recién ahí se integran y se dibujan. Emitir después de
      // sincronizar haría que cada explosión apareciera un frame tarde.
      this.events.update(xp, subidos, this.pickups.gotHeal > 0 || this.pickups.gotMagnets > 0)
      this.audio.update(this.events)
      this.vfx.update(this.events)
      this._spawnFloaters()
      this.particles.update(delta)

      this.enemies.sync(this.time.elapsed, this.player.position)
      this.projectiles.sync()
      this.pickups.sync(this.time.elapsed)
      this.particles.sync()

      if (this.player.isDead) this._endRun()
      else if (this._pendingLevels > 0) this._openUpgradeMenu()

      this.floaters.update(delta, this.camera)
      this.hud.update(delta)
      this.recorder?.muestrear(this, delta)
      // Ni se rellena si el panel está apagado: en producción esto es cero
      // trabajo, no "trabajo barato".
      if (this.monitor.enabled) {
        const st = this._stats
        st.x = this.player.position.x
        st.z = this.player.position.z
        st.speed = this.player.currentSpeed
        st.moving = this.player.isMoving
        st.inputX = move.x
        st.inputZ = move.z
        st.enemies = this.enemies.count
        st.projectiles = this.projectiles.count
        st.renderCalls = this._lastCalls
        this.monitor.update(delta, st)
      }
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
