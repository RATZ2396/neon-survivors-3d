import { CONFIG } from '../config/GameConfig.js'
import { ENEMY_DEFS } from '../config/EnemyDefs.js'
import { WEAPON_DEFS, WEAPON } from '../config/WeaponDefs.js'
import { createWeaponMods } from './WeaponMods.js'

/** Sin perfil cargado, el arma funciona con sus números de tabla. */
const SIN_MEJORAS = { damageMult: 1, cooldownMult: 1, rangeAdd: 0, countAdd: 0 }

/**
 * WeaponSystem — el arma base del jugador.
 *
 * UNA sola arma por partida, elegida antes de empezar. No se cambia ni se
 * acumula durante el run: eso es lo que distingue al arma (identidad del perfil)
 * de las habilidades (elección dentro de la partida, ver SkillSystem).
 *
 * Auto-disparo: el jugador no apunta ni gatilla. Es el contrato del género —
 * vos elegís dónde pararte, el arma resuelve el resto. Por eso el input de la
 * Parte A es solo movimiento.
 *
 * TRES CAPAS DE MEJORA, y ninguna toca WEAPON_DEFS:
 *   permanentes  compradas entre partidas, vienen del perfil, se congelan al
 *                equipar (no cambian a mitad de run)
 *   de partida   elegidas al subir de nivel, viven en Progression.stats y
 *                cambian mientras jugás
 *   de personaje las habilidades propias del arma (Rebote, Doble cañón,
 *                Calentamiento…). Viven en el objeto de WeaponMods.js y no
 *                cambian números sueltos: cambian QUÉ BALAS SALEN.
 * Las dos primeras se multiplican entre sí en los getters de abajo; la
 * tercera se lee en _fire() y en el pool de proyectiles.
 */
export class WeaponSystem {
  /**
   * @param {object} mods modificadores de las habilidades de personaje. Se
   *                      lee, nunca se escribe: lo llena SkillSystem.
   */
  constructor(player, enemies, projectiles, mods = createWeaponMods()) {
    this.player = player
    this.enemies = enemies
    this.projectiles = projectiles
    this.mods = mods

    /** Índice en WEAPON_DEFS del arma equipada. */
    this.weaponIndex = WEAPON.PISTOL
    this.cooldown = 0
    this.shotsFired = 0

    /**
     * APUNTADO MANUAL. GameManager escribe acá el punto del mundo bajo el
     * mouse cuando el jugador activa el modo con ESPACIO. El sistema de armas
     * no sabe qué es una cámara: recibe dos números y dispara hacia ahí.
     */
    this.aimActive = false
    this.aimX = 0
    this.aimZ = 0

    /** Diagnóstico: cuántos disparos apuntaron a un enemigo prioritario. */
    this.shotsAtPriority = 0

    /**
     * ESTADO DE LAS HABILIDADES DE PERSONAJE.
     *
     * Vive acá y no en SkillSystem porque son cosas del acto de disparar —
     * cuánto hace que no tirás, cuántas andanadas quedan de la ráfaga — y
     * el que dispara es este.
     */
    /** 0..1 — qué tan caliente está el arma (Calentamiento). */
    this._heat = 0
    /** Segundos desde el último disparo. Arranca alto: el arma está fría. */
    this._sinceShot = 99
    /** Andanadas que faltan de la ráfaga en curso (Doble cañón). */
    this._burstLeft = 0
    this._burstTimer = 0
    this._burstAngle = 0
    /** Contador para la bala explosiva cada N (Bala explosiva). */
    this._shotIndex = 0

    /**
     * Los inyecta el GameManager. `progression` guarda los multiplicadores de la
     * partida; `profile` los del perfil guardado.
     *
     * NUNCA se modifica WEAPON_DEFS: esa tabla son datos compartidos, y si una
     * partida la mutara, la siguiente arrancaría con los números cambiados.
     */
    this.progression = null
    this.profile = null

    /** Modificadores permanentes del arma equipada, ya resueltos. */
    this.perm = SIN_MEJORAS
  }

  get def() {
    return WEAPON_DEFS[this.weaponIndex]
  }

  /** @param {string} key clave de WEAPON_DEFS */
  equip(key) {
    const idx = WEAPON[key]
    if (idx === undefined) return false
    this.weaponIndex = idx
    this.cooldown = 0
    // Se resuelven UNA vez, al equipar: recorrer el árbol cada disparo sería
    // trabajo repetido para un resultado que no puede cambiar durante la partida.
    this.perm = this.profile ? this.profile.modifiersFor(key) : SIN_MEJORAS
    return true
  }

  /** Vuelve al estado inicial conservando el arma elegida para la partida. */
  reset() {
    this.cooldown = 0
    this.shotsFired = 0
    this.shotsAtPriority = 0
    this.aimActive = false
    this._heat = 0
    this._sinceShot = 99
    this._burstLeft = 0
    this._burstTimer = 0
    this._shotIndex = 0
  }

  /** Daño: permanente × mejoras de la partida. */
  get damageMult() {
    const run = this.progression ? this.progression.stats.damageMult : 1
    return this.perm.damageMult * run
  }

  /**
   * Recarga; menor = dispara más seguido.
   *
   * Las dos habilidades que tocan el ritmo entran acá y tiran para lados
   * opuestos a propósito: `ramp` lo baja mientras sostenés el fuego,
   * `burstCooldown` lo sube porque la ráfaga ya te dio las balas por
   * adelantado. Sin ese costo, Doble cañón sería cadencia gratis.
   */
  get cooldownMult() {
    const run = this.progression ? this.progression.stats.cooldownMult : 1
    const m = this.mods
    return this.perm.cooldownMult * run * (1 - m.ramp * this._heat) * m.burstCooldown
  }

  /** Alcance efectivo del auto-apuntado. */
  get range() {
    return this.def.range + this.perm.rangeAdd
  }

  /** Proyectiles por disparo. */
  get shotCount() {
    return this.def.count + this.perm.countAdd
  }

  /** 0 = recién disparó, 1 = lista. Lo consume el HUD. */
  get readiness() {
    if (this.cooldown <= 0) return 1
    return 1 - this.cooldown / (this.def.cooldown * this.cooldownMult)
  }

  update(delta) {
    this._sinceShot += delta
    this._updateHeat(delta)

    // La ráfaga sale aunque el arma esté recargando: ese es el punto.
    if (this._burstLeft > 0) {
      this._burstTimer -= delta
      if (this._burstTimer <= 0) {
        this._burstLeft--
        this._burstTimer = this.mods.burstDelay
        this._shoot(this._burstAngle)
      }
    }

    this.cooldown -= delta
    if (this.cooldown > 0) return

    // Si no había blanco, la recarga NO se reinicia: el arma queda cargada
    // y dispara en cuanto algo entre en rango.
    if (this._fire()) this.cooldown = this.def.cooldown * this.cooldownMult
  }

  /**
   * Calentamiento: sube mientras dispares seguido, baja al parar.
   *
   * "Seguido" se mide contra la recarga BASE del arma, no contra la ya
   * modificada: si se midiera contra la modificada, calentarse acortaría la
   * ventana que define estar caliente y el arma se realimentaría sola.
   */
  _updateHeat(delta) {
    const ramp = this.mods.ramp
    if (ramp <= 0) {
      this._heat = 0
      return
    }

    const t = this.mods.rampTime
    if (this._sinceShot < this.def.cooldown * 1.5 + 0.1) {
      this._heat += delta / t
      if (this._heat > 1) this._heat = 1
    } else {
      // Se enfría al doble de rápido: recuperar el ritmo tiene que costar.
      this._heat -= (delta / t) * 2
      if (this._heat < 0) this._heat = 0
    }
  }

  /**
   * Enemigo vivo más cercano dentro del rango.
   *
   * Se compara distancia AL CUADRADO: la raíz cuadrada no cambia cuál es el
   * mínimo y es la operación más cara del bucle.
   */
  /**
   * Elige a quién dispararle.
   *
   * ANTES elegía siempre al más cercano, y eso hacía imposible pelear contra
   * el boss: con basura alrededor el boss nunca es el más cercano. Medido en
   * el juego antes de este cambio: 0 de 172 disparos le apuntaron, y le llegó
   * el 0.2% del daño.
   *
   * Ahora hay dos ligas. Si algún enemigo PRIORITARIO (el boss, y más adelante
   * los elites) está a tiro, se elige el más cercano de esos; si no hay
   * ninguno, el más cercano de todos.
   *
   * PERO la prioridad no es absoluta, y esa condición se ganó en una partida
   * real: con prioridad absoluta el ritmo de matar se caía a un tercio en
   * cuanto aparecía el boss —de 1.37 a 0.46 bajas por segundo— mientras la
   * horda trepaba de 1 a 28. Le pegabas al boss y te mataba lo que no estabas
   * mirando. Así que si hay algo común DENTRO DEL RADIO DE AMENAZA, eso va
   * primero: al boss se le pega cuando tenés aire, no cuando te están comiendo.
   */
  _findTarget(range) {
    const e = this.enemies
    const px = this.player.position.x
    const pz = this.player.position.z
    const rangeSq = range * range

    let best = -1
    let bestSq = rangeSq
    let priority = -1
    let prioritySq = rangeSq

    for (let i = 0; i < e.count; i++) {
      const dx = e.posX[i] - px
      const dz = e.posZ[i] - pz
      const dSq = dx * dx + dz * dz
      if (dSq >= rangeSq) continue

      if (ENEMY_DEFS[e.type[i]].priorityTarget) {
        if (dSq < prioritySq) {
          prioritySq = dSq
          priority = i
        }
      } else if (dSq < bestSq) {
        bestSq = dSq
        best = i
      }
    }

    // Lo que ya te tiene encima manda sobre cualquier prioridad.
    const guard = CONFIG.COMBAT.PRIORITY_GUARD_RADIUS
    if (best !== -1 && bestSq <= guard * guard) return best

    return priority !== -1 ? priority : best
  }

  _fire() {
    const def = this.def
    const e = this.enemies
    const px = this.player.position.x
    const pz = this.player.position.z

    let dx
    let dz
    let target = -1

    if (this.aimActive) {
      // Manual: se dispara hacia el mouse, haya o no algo ahí. Poder tirarle a
      // la nada es parte del trato — el jugador tomó el control.
      dx = this.aimX - px
      dz = this.aimZ - pz
    } else {
      target = this._findTarget(this.range)
      if (target === -1) return false
      dx = e.posX[target] - px
      dz = e.posZ[target] - pz
      if (ENEMY_DEFS[e.type[target]].priorityTarget) this.shotsAtPriority++
    }

    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist < 0.0001) return false

    const baseAngle = Math.atan2(dx / dist, dz / dist)
    this._shoot(baseAngle)
    this._sinceShot = 0

    // Doble cañón: el resto de la ráfaga queda agendado y sale en update(),
    // hacia el mismo lado. Que no vuelva a apuntar es deliberado — la ráfaga
    // va a donde tiraste, no a donde el enemigo se movió mientras tanto.
    if (this.mods.burst > 0) {
      this._burstLeft = this.mods.burst
      this._burstTimer = this.mods.burstDelay
      this._burstAngle = baseAngle
    }

    // El jugador mira hacia lo que dispara si está quieto: si no, se ve como si
    // le pegara de espaldas.
    if (!this.player.isMoving) this.player.faceTowards(baseAngle)

    // Patada del arma. Es la señal de que estás disparando: sin ella el soldado
    // se ve inmóvil aunque salgan balas.
    this.player.recoil(1)

    return true
  }

  /** Una andanada hacia `angle`, más la de la espalda si la tenés. */
  _shoot(angle) {
    this._volley(angle, 1)
    if (this.mods.backfire > 0) this._volley(angle + Math.PI, this.mods.backfireDamage)
  }

  /**
   * El abanico del arma disparado hacia `angle`.
   *
   * `damageScale` es para la andanada trasera, que sale más floja en los
   * primeros niveles: cubrirte la espalda gratis desde el nivel 1 haría que
   * la habilidad no tuviera nada que mejorar.
   */
  _volley(angle, damageScale) {
    const def = this.def
    const px = this.player.position.x
    const pz = this.player.position.z
    const count = this.shotCount

    // Un arma recta a la que una mejora le sumó balas necesita algo de abanico
    // o las dispara superpuestas y la mejora no se ve.
    const deg = def.spreadDeg > 0 ? def.spreadDeg : count > def.count ? CONFIG.COMBAT.IMPLIED_SPREAD_DEG : 0
    const spread = (deg * Math.PI) / 180
    // Con una sola bala el abanico no tiene sentido; con varias se reparten
    // parejas de borde a borde en vez de al azar, que se lee mucho mejor.
    const step = count > 1 ? spread / (count - 1) : 0
    const start = count > 1 ? -spread / 2 : 0

    const dmg = this.damageMult * damageScale
    const m = this.mods

    for (let k = 0; k < count; k++) {
      const a = angle + start + step * k
      const dirX = Math.sin(a)
      const dirZ = Math.cos(a)
      this._one(px, pz, dirX, dirZ, dmg)

      // Doble línea: al COSTADO y en paralelo, no abiertas en abanico. Esa
      // es toda la diferencia — un abanico más ancho ya lo da el arma.
      for (let p = 1; p <= m.parallel; p++) {
        const lado = p % 2 === 1 ? 1 : -1
        const off = lado * Math.ceil(p / 2) * m.parallelGap
        this._one(px + dirZ * off, pz - dirX * off, dirX, dirZ, dmg * m.parallelDamage)
      }
    }
  }

  /**
   * Una bala. Acá vive el contador de la bala explosiva: cuenta BALAS, no
   * disparos, así que con la escopeta llega seis veces más rápido — que es
   * justo por qué esa habilidad es de la metralleta.
   */
  _one(x, z, dirX, dirZ, damage) {
    const m = this.mods
    let boomR = 0
    let boomD = 0

    if (m.boomEvery > 0) {
      this._shotIndex++
      if (this._shotIndex >= m.boomEvery) {
        this._shotIndex = 0
        boomR = m.boomRadius
        boomD = m.boomDamage
      }
    }

    this.projectiles.fire(x, z, dirX, dirZ, this.def, damage, boomR, boomD)
    this.shotsFired++
  }
}
