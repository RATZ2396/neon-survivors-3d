import * as THREE from 'three'
import { CONFIG } from '../config/GameConfig.js'
import { ENEMY_DEFS } from '../config/EnemyDefs.js'
import { BOSS_DEFS } from '../config/BossDefs.js'

/**
 * BossController — cuándo aparece el boss y qué hace mientras está vivo.
 *
 * No es dueño de una entidad propia: el boss vive dentro del EnemyManager como
 * cualquier otro enemigo (ver el comentario del arquetipo BOSS en EnemyDefs).
 * Este archivo solo agrega el comportamiento que no se puede escribir como un
 * número: la aparición programada, la embestida y el golpe de área.
 *
 * Guarda el `id` del boss, nunca su índice: el swap-remove del EnemyManager
 * mueve los índices en cuanto muere cualquier otro enemigo.
 */
export class BossController {
  constructor(enemies, waves, player, scene) {
    this.enemies = enemies
    this.waves = waves
    this.player = player

    this._initMeshes(scene)
    this.reset()
  }

  _initMeshes(scene) {
    // Anillo de aviso del golpe de área: se agranda mientras el boss carga el
    // golpe, así se ve exactamente dónde y cuándo va a caer.
    const geo = new THREE.RingGeometry(0.86, 1, 48)
    const mat = new THREE.MeshBasicMaterial({
      color: BOSS_DEFS[0].slam.color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.slamRing = new THREE.Mesh(geo, mat)
    this.slamRing.rotation.x = -Math.PI / 2
    this.slamRing.position.y = 0.08
    this.slamRing.visible = false
    scene.add(this.slamRing)
  }

  reset() {
    /** Id del boss vivo, o 0 si no hay ninguno. */
    this.bossId = 0
    /** Cuántos bosses aparecieron en la partida. Escala al siguiente. */
    this.spawned = 0
    this.defeated = 0

    this.hp = 0
    this.maxHp = 0
    this.name = ''
    /**
     * Última posición conocida del boss. Al morir, es dónde cayó.
     *
     * Se anota cada frame en vez de buscarla en la lista de muertes del
     * EnemyManager: esa lista no garantiza orden (las muertes se resuelven
     * recorriendo hacia atrás), así que "la última entrada" no siempre sería
     * el boss. Copiar dos flotantes por frame es más barato que buscar.
     */
    this.lastX = 0
    this.lastZ = 0

    this._chargeTimer = 0
    this._slamTimer = 0
    /** '' | 'TELEGRAPH' | 'CHARGING' */
    this._chargeState = ''
    this._chargeLeft = 0
    this._slamWindup = 0

    this.slamRing.visible = false
    this.waves.spawnMultiplier = 1
  }

  get active() {
    return this.bossId !== 0
  }

  /**
   * Fase de la embestida: '' | 'TELEGRAPH' | 'CHARGING'.
   *
   * Es de solo lectura y existe para que otros sistemas (el audio, y mañana los
   * efectos) puedan reaccionar al aviso sin espiar el estado interno ni pedirle
   * al boss que les avise. El boss no sabe quién lo mira.
   */
  get chargePhase() {
    return this._chargeState
  }

  /** Si el anillo de aviso del golpe de área está en el piso. Solo lectura. */
  get slamWarning() {
    return this.slamRing.visible
  }

  /** Momento en que aparece el próximo boss. */
  get nextAt() {
    return CONFIG.BOSS.FIRST_AT + this.spawned * CONFIG.BOSS.REPEAT_EVERY
  }

  update(delta) {
    if (this.active) this._updateFight(delta)
    else if (this.waves.elapsed >= this.nextAt) this._spawn()
  }

  _spawn() {
    const def = BOSS_DEFS[0]
    const enemyDef = ENEMY_DEFS[def.enemyType]

    // "Limpia la arena" (GDD_v2 §4 Parte F): la basura muere, pero suelta sus
    // gemas. El duelo empieza limpio y el jugador cobra lo que ya se había
    // ganado, en vez de que se le evapore en pantalla.
    for (let i = 0; i < this.enemies.count; i++) this.enemies.queueDamage(i, 1e9)

    // Aparece lejos, para que se lo vea venir.
    const angle = Math.random() * Math.PI * 2
    const dist = CONFIG.BOSS.SPAWN_DISTANCE
    const limit = CONFIG.WORLD.ARENA_SIZE / 2 - enemyDef.radius - 1
    let x = this.player.position.x + Math.cos(angle) * dist
    let z = this.player.position.z + Math.sin(angle) * dist
    if (x > limit) x = limit
    else if (x < -limit) x = -limit
    if (z > limit) z = limit
    else if (z < -limit) z = -limit

    const hpMult = 1 + this.spawned * CONFIG.BOSS.HP_SCALE_PER_BOSS
    const i = this.enemies.spawn(def.enemyType, x, z, hpMult)
    if (i === -1) return // horda llena: se reintenta el frame siguiente

    this.bossId = this.enemies.id[i]
    this.spawned++
    this.maxHp = this.enemies.maxHp[i]
    this.hp = this.maxHp
    this.name = enemyDef.name

    this._chargeTimer = def.charge ? def.charge.every : 0
    this._slamTimer = def.slam.every
    this._chargeState = ''

    // Mientras dura el duelo el spawner afloja: pelear al boss adentro de una
    // oleada completa no es difícil, es ruido.
    this.waves.spawnMultiplier = CONFIG.BOSS.SPAWN_SLOWDOWN
  }

  _updateFight(delta) {
    const i = this.enemies.indexOfId(this.bossId)

    if (i === -1) {
      // Murió: lo mató el sistema de daño normal, como a cualquier enemigo.
      this.bossId = 0
      this.defeated++
      this.slamRing.visible = false
      this.waves.spawnMultiplier = 1
      return
    }

    this.hp = this.enemies.hp[i]
    this.lastX = this.enemies.posX[i]
    this.lastZ = this.enemies.posZ[i]

    const def = BOSS_DEFS[0]
    // Las dos habilidades son OPCIONALES: un boss sin `charge` o sin `slam` en
    // la tabla simplemente no la usa. Quitarle un ataque a un boss es borrar
    // una clave, no tocar este archivo.
    if (def.charge) this._updateCharge(delta, i, def)
    if (def.slam) this._updateSlam(delta, i, def)
  }

  /**
   * Embestida.
   *
   * No mueve al boss a mano: le sube la velocidad y deja que la persecución del
   * EnemyManager haga el resto. Así la embestida respeta los límites de la arena
   * y la colisión con el jugador sin duplicar nada de eso.
   */
  _updateCharge(delta, i, def) {
    const c = def.charge
    const baseSpeed = ENEMY_DEFS[def.enemyType].speed

    if (this._chargeState === 'TELEGRAPH') {
      this._chargeLeft -= delta
      this.enemies.speed[i] = 0 // se frena antes de arrancar: es el aviso
      if (this._chargeLeft <= 0) {
        this._chargeState = 'CHARGING'
        this._chargeLeft = c.duration
        this.enemies.speed[i] = c.speed
      }
      return
    }

    if (this._chargeState === 'CHARGING') {
      this._chargeLeft -= delta
      if (this._chargeLeft <= 0) {
        this._chargeState = ''
        this.enemies.speed[i] = baseSpeed
        this.enemies.setColor(i, ENEMY_DEFS[def.enemyType].color)
      }
      return
    }

    this._chargeTimer -= delta
    if (this._chargeTimer > 0) return

    this._chargeTimer = c.every
    this._chargeState = 'TELEGRAPH'
    this._chargeLeft = c.telegraph
    this.enemies.setColor(i, c.warnColor)
  }

  /**
   * Golpe de área: castiga quedarse pegado disparando.
   *
   * El anillo crece durante la carga y el daño cae cuando termina. La posición
   * se fija al empezar, no al golpear: si siguiera al boss, esquivarlo sería
   * imposible.
   */
  _updateSlam(delta, i, def) {
    const s = def.slam

    if (this._slamWindup > 0) {
      this._slamWindup -= delta

      const t = 1 - this._slamWindup / s.windup
      this.slamRing.scale.setScalar(s.radius * (0.25 + 0.75 * t))
      this.slamRing.material.opacity = 0.25 + 0.5 * t

      if (this._slamWindup <= 0) {
        this.slamRing.visible = false
        this._resolveSlam(s)
      }
      return
    }

    this._slamTimer -= delta
    if (this._slamTimer > 0) return

    const dx = this.player.position.x - this.enemies.posX[i]
    const dz = this.player.position.z - this.enemies.posZ[i]
    if (dx * dx + dz * dz > s.range * s.range) return // lejos: no vale la pena

    this._slamTimer = s.every
    this._slamWindup = s.windup

    this.slamRing.position.set(this.enemies.posX[i], 0.08, this.enemies.posZ[i])
    this.slamRing.visible = true
  }

  _resolveSlam(s) {
    const dx = this.player.position.x - this.slamRing.position.x
    const dz = this.player.position.z - this.slamRing.position.z

    // El golpe atraviesa la invulnerabilidad por contacto solo si estás adentro
    // del círculo, que estuvo marcado en el piso más de medio segundo.
    if (dx * dx + dz * dz <= s.radius * s.radius) this.player.takeDamage(s.damage)
  }
}
