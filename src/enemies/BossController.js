import * as THREE from 'three'
import { CONFIG } from '../config/GameConfig.js'
import { ENEMY_DEFS } from '../config/EnemyDefs.js'
import { BOSS_DEFS, BOSS, ELITE_TIER, eliteAt } from '../config/BossDefs.js'

/**
 * BossController — cuándo aparece cada élite y qué hace mientras está viva.
 *
 * "Élite" son las dos cosas: los minijefes, que salen adentro de la horda, y
 * los jefes, que salen casi solos. Comparten todo salvo dos líneas (ver
 * `_spawn`), así que comparten controlador. Escribir un MinibossController
 * aparte habría duplicado la embestida, el golpe de área, el seguimiento por
 * id y el reseteo, para terminar cambiando dos condicionales.
 *
 * No es dueño de ninguna entidad: la élite vive dentro del EnemyManager como
 * cualquier otro enemigo (ver el comentario de los arquetipos en EnemyDefs).
 * Este archivo solo agrega lo que no se puede escribir como un número: el
 * calendario de apariciones, la embestida y el golpe de área.
 *
 * Guarda el `id` de la élite, nunca su índice: el swap-remove del EnemyManager
 * mueve los índices en cuanto muere cualquier otro enemigo.
 *
 * UNA SOLA ÉLITE A LA VEZ. `_next` se adelanta al aparecer, no al morir, y
 * `update` solo mira el reloj cuando no hay nadie vivo: si la de turno se
 * demora, la siguiente espera su muerte y sale enseguida. Es lo que sostiene
 * la promesa de "el jefe pelea solo" — sin esta regla un jugador lento podría
 * juntar un jefe encima de un minijefe.
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
    // Anillo de aviso del golpe de área: se agranda mientras la élite carga el
    // golpe, así se ve exactamente dónde y cuándo va a caer. El color lo pone
    // cada élite al aparecer — es de las pocas cosas que las distingue de un
    // vistazo mientras están cargando.
    const geo = new THREE.RingGeometry(0.86, 1, 48)
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
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
    /** Id de la élite viva, o 0 si no hay ninguna. */
    this.bossId = 0
    /** Fila de BOSS_DEFS que está peleando, o -1. */
    this.defIndex = -1
    /** '' | 'MINI' | 'BOSS'. Lo lee el HUD para saber qué barra dibujar. */
    this.tier = ''
    /** Cuántas élites aparecieron en la partida. Es el índice del calendario. */
    this.spawned = 0
    this.defeated = 0

    this.hp = 0
    this.maxHp = 0
    this.name = ''
    /**
     * Última posición conocida de la élite. Al morir, es dónde cayó.
     *
     * Se anota cada frame en vez de buscarla en la lista de muertes del
     * EnemyManager: esa lista no garantiza orden (las muertes se resuelven
     * recorriendo hacia atrás), así que "la última entrada" no siempre sería
     * la correcta. Copiar dos flotantes por frame es más barato que buscar.
     */
    this.lastX = 0
    this.lastZ = 0

    this._chargeTimer = 0
    this._slamTimer = 0
    /** '' | 'TELEGRAPH' | 'CHARGING' */
    this._chargeState = ''
    this._chargeLeft = 0
    this._slamWindup = 0

    /** La próxima entrada del calendario: { at, key, loop }. */
    this._next = eliteAt(0)

    this.slamRing.visible = false
    this.waves.spawnMultiplier = 1
  }

  get active() {
    return this.bossId !== 0
  }

  /** ¿Lo que está peleando es un jefe de verdad, o un minijefe? */
  get isBoss() {
    return this.tier === ELITE_TIER.BOSS
  }

  /**
   * Fase de la embestida: '' | 'TELEGRAPH' | 'CHARGING'.
   *
   * Es de solo lectura y existe para que otros sistemas (el audio, y mañana los
   * efectos) puedan reaccionar al aviso sin espiar el estado interno ni pedirle
   * a la élite que les avise. La élite no sabe quién la mira.
   */
  get chargePhase() {
    return this._chargeState
  }

  /** Si el anillo de aviso del golpe de área está en el piso. Solo lectura. */
  get slamWarning() {
    return this.slamRing.visible
  }

  /** Momento en que aparece la próxima élite. */
  get nextAt() {
    return this._next.at
  }

  /** Nombre de la próxima, para poder anunciarla. */
  get nextName() {
    return ENEMY_DEFS[BOSS_DEFS[BOSS[this._next.key]].enemyType].name
  }

  update(delta) {
    if (this.active) this._updateFight(delta)
    else if (this.waves.elapsed >= this._next.at) this._spawn()
  }

  _spawn() {
    const def = BOSS_DEFS[BOSS[this._next.key]]
    const enemyDef = ENEMY_DEFS[def.enemyType]
    const esJefe = def.tier === ELITE_TIER.BOSS

    /**
     * LAS DOS ÚNICAS LÍNEAS QUE SEPARAN UN JEFE DE UN MINIJEFE.
     *
     * El jefe "limpia la arena" (GDD_v2 §4 Parte F): la basura muere, pero
     * suelta sus gemas, así que el duelo empieza limpio y el jugador cobra lo
     * que ya se había ganado en vez de vérselo evaporar. El minijefe no limpia
     * nada: aparece ENTRE la horda, que es todo su sentido.
     */
    if (esJefe) this.enemies.queueWipe()

    // El jefe aparece lejos, para que se lo vea venir y el duelo tenga entrada.
    // El minijefe aparece cerca, porque tiene que llegarte mezclado con la
    // oleada y no anunciado desde el horizonte.
    const dist = esJefe ? CONFIG.BOSS.SPAWN_DISTANCE : CONFIG.BOSS.MINI_SPAWN_DISTANCE
    const angle = Math.random() * Math.PI * 2
    const limit = CONFIG.WORLD.ARENA_SIZE / 2 - enemyDef.radius - 1
    let x = this.player.position.x + Math.cos(angle) * dist
    let z = this.player.position.z + Math.sin(angle) * dist
    if (x > limit) x = limit
    else if (x < -limit) x = -limit
    if (z > limit) z = limit
    else if (z < -limit) z = -limit

    /**
     * La vida NO escala dentro de la primera vuelta del calendario.
     *
     * Los números de ENEMY_DEFS son una curva que alguien diseñó —el Bruto a
     * los 40 s, el Coloso a los 385— y multiplicarlos por "cuántos ya
     * salieron" la borraría: el cuarto minijefe pegaría más que el primer
     * jefe. Solo escalan las vueltas siguientes, que ya no son contenido
     * escrito sino tiempo extra.
     */
    const hpMult = 1 + this._next.loop * CONFIG.BOSS.HP_SCALE_PER_LOOP
    const i = this.enemies.spawn(def.enemyType, x, z, hpMult)
    if (i === -1) return // horda llena: se reintenta el frame siguiente

    this.bossId = this.enemies.id[i]
    this.defIndex = BOSS[this._next.key]
    this.tier = def.tier
    this.maxHp = this.enemies.maxHp[i]
    this.hp = this.maxHp
    this.name = enemyDef.name
    this.lastX = x
    this.lastZ = z

    this._chargeTimer = def.charge ? def.charge.every : 0
    this._slamTimer = def.slam ? def.slam.every : 0
    this._chargeState = ''
    this._slamWindup = 0
    if (def.slam) this.slamRing.material.color.setHex(def.slam.color)

    // Mientras dura el duelo el spawner afloja: pelear al jefe adentro de una
    // oleada completa no es difícil, es ruido. Con el minijefe pasa lo
    // contrario y por eso no se toca — sale entre la horda a propósito.
    if (esJefe) this.waves.spawnMultiplier = CONFIG.BOSS.SPAWN_SLOWDOWN

    // El calendario se adelanta ACÁ y no al morir: así `nextAt` ya apunta a la
    // siguiente durante toda la pelea, y si esta se demora, la que viene sale
    // apenas cae. Ver el comentario de la clase.
    this.spawned++
    this._next = eliteAt(this.spawned)
  }

  _updateFight(delta) {
    const i = this.enemies.indexOfId(this.bossId)

    if (i === -1) {
      this._endFight()
      return
    }

    this.hp = this.enemies.hp[i]
    this.lastX = this.enemies.posX[i]
    this.lastZ = this.enemies.posZ[i]

    const def = BOSS_DEFS[this.defIndex]
    // Las dos habilidades son OPCIONALES: una fila sin `charge` o sin `slam`
    // simplemente no la usa. Quitarle un ataque a un jefe es borrar una clave,
    // no tocar este archivo.
    if (def.charge) this._updateCharge(delta, i, def)
    if (def.slam) this._updateSlam(delta, i, def)
  }

  /**
   * Murió: lo mató el sistema de daño normal, como a cualquier enemigo.
   *
   * Se limpia TODO el estado de pelea, no solo el id. Un golpe de área a medio
   * cargar que sobreviviera a la muerte se resolvería sobre la élite siguiente,
   * en el lugar donde había marcado el anillo la anterior.
   */
  _endFight() {
    this.bossId = 0
    this.defIndex = -1
    this.tier = ''
    this.defeated++
    this._chargeState = ''
    this._slamWindup = 0
    this.slamRing.visible = false
    this.waves.spawnMultiplier = 1
  }

  /**
   * Embestida.
   *
   * No mueve a la élite a mano: le sube la velocidad y deja que la persecución
   * del EnemyManager haga el resto. Así la embestida respeta los límites de la
   * arena y la colisión con el jugador sin duplicar nada de eso.
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
   * se fija al empezar, no al golpear: si siguiera a la élite, esquivarlo sería
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
