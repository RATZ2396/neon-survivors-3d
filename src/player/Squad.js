import * as THREE from 'three'
import { CONFIG } from '../config/GameConfig.js'
import { WEAPON_DEFS, WEAPON } from '../config/WeaponDefs.js'
import { SoldierModel } from './SoldierModel.js'
import { WeaponSystem } from '../combat/WeaponSystem.js'
import { createWeaponMods } from '../combat/WeaponMods.js'

/**
 * Squad — el escuadrón: vos y hasta dos compañeros.
 *
 * POR QUÉ EXISTE. El arma tenía una habilidad, `Cañón trasero`, que disparaba
 * la misma andanada 180° hacia atrás: un tipo tirando por la espalda sin darse
 * vuelta. Cubría el problema real —que la horda te rodea— pero se veía falso,
 * porque lo era. Un compañero parado atrás tuyo disparando hacia atrás resuelve
 * lo mismo y es lo que el jugador ya creía estar viendo. Las dos habilidades
 * traseras (pistola y escopeta) se borraron de SkillDefs junto con este cambio.
 *
 * UN COMPAÑERO ES UN PERSONAJE, NO UN ACOMPAÑANTE. Usa uno de los personajes
 * del juego, con su arma y su apuntado propio. Por eso el roster sale de
 * WEAPON_DEFS y no de una tabla nueva: hoy un personaje ES un arma (ver el
 * comentario de WeaponDefs), así que agregar un personaje sigue siendo agregar
 * una fila ahí, y aparece solo como opción al subir de nivel.
 *
 * TRES DECISIONES QUE CONVIENE CONOCER:
 *
 * 1. NO SE MUEREN Y NO CHOCAN. Un compañero cuesta una subida de nivel; una
 *    mejora que se te puede evaporar no es una mejora, es una apuesta. Y no
 *    frenan a la horda: si fueran obstáculos, pararse detrás de ellos sería la
 *    estrategia dominante y el juego pasaría a ser esconderse.
 *
 * 2. NO HEREDAN TUS HABILIDADES. Las de personaje están atadas a tu arma
 *    (`weapon` en SkillDefs), así que darle Rebote —de pistola— a un compañero
 *    con escopeta sería aplicar un modificador que nadie diseñó para eso. Sí
 *    heredan lo que no depende del arma: las mejoras del taller de SU arma y
 *    las estadísticas que ganás en la partida.
 *
 * 3. SE CONSTRUYEN AL ARRANCAR, no al conseguirlos. Armar un soldado no es
 *    gratis, y hacerlo en el instante en que elegís la mejora metería un tirón
 *    justo cuando te están correteando. Arrancan invisibles y esperan.
 */
class Companion {
  /**
   * @param {object} deps enemies, projectiles, progression, profile
   * @param {object} atlas el del jugador. Compartirlo evita generar de nuevo el
   *                       canvas de la textura, que es lo caro del soldado.
   */
  constructor(scene, deps, atlas, offset) {
    this.offset = offset

    this.position = new THREE.Vector3()
    /** Hacia dónde mira, en radianes. Misma convención que Player. */
    this.facing = 0
    this.currentSpeed = 0
    this.isMoving = false

    this.active = false
    this.weaponKey = null

    this.mesh = new THREE.Group()
    this.model = new SoldierModel({ height: CONFIG.PLAYER.HEIGHT, atlas })
    this.mesh.add(this.model.object3D)
    this.mesh.visible = false
    scene.add(this.mesh)

    // Anillo de color en el piso: es lo único que dice de un vistazo QUÉ
    // personaje es cada uno. Con la cámara cenital, mirarle el arma al muñeco
    // no es una opción realista.
    const geo = new THREE.RingGeometry(
      CONFIG.SQUAD.RING_RADIUS - 0.07,
      CONFIG.SQUAD.RING_RADIUS,
      32,
    )
    this.ring = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    )
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.02
    this.ring.visible = false
    scene.add(this.ring)

    /**
     * Su propia arma, con sus propios modificadores EN CERO.
     *
     * El objeto de mods es nuevo y no el compartido del jugador: ese lo escribe
     * SkillSystem con las habilidades de TU arma (ver la decisión 2 de arriba).
     * WeaponSystem solo le pide a su dueño `position`, `isMoving`,
     * `faceTowards()` y `recoil()` — todo lo que esta clase implementa.
     */
    this.weapons = new WeaponSystem(this, deps.enemies, deps.projectiles, createWeaponMods())
    this.weapons.progression = deps.progression
    this.weapons.profile = deps.profile
    this.weapons.damageScale = CONFIG.SQUAD.DAMAGE_MULT
  }

  equip(key, playerPos) {
    this.weaponKey = key
    this.active = true
    this.weapons.equip(key)
    this.weapons.reset()

    // Aparece ya en su lugar, no viajando desde el origen del mundo.
    this.position.set(playerPos.x + this.offset.x, 0, playerPos.z + this.offset.z)
    this.mesh.position.copy(this.position)
    this.mesh.visible = true

    const def = WEAPON_DEFS[WEAPON[key]]
    this.ring.material.color.setHex(def.color)
    this.ring.visible = true
    this.model.reset()
  }

  clear() {
    this.active = false
    this.weaponKey = null
    this.mesh.visible = false
    this.ring.visible = false
    this.currentSpeed = 0
    this.isMoving = false
  }

  /** Orienta el mesh de golpe. La llama su arma al disparar estando quieto. */
  faceTowards(angle) {
    this.facing = angle
    this.mesh.rotation.y = angle
  }

  recoil(strength = 1) {
    this.model.recoil(strength)
  }

  update(delta, playerPos) {
    if (!this.active) return

    const tx = playerPos.x + this.offset.x
    const tz = playerPos.z + this.offset.z

    // Persecución suavizada e independiente del framerate: el compañero NO se
    // teletransporta a su puesto, lo alcanza. Ese rezago es lo que hace que se
    // lea como alguien que te sigue y no como un accesorio pegado al jugador.
    const t = 1 - Math.exp(-CONFIG.SQUAD.FOLLOW * delta)
    const dx = (tx - this.position.x) * t
    const dz = (tz - this.position.z) * t

    this.position.x += dx
    this.position.z += dz

    // La velocidad sale de lo que SE MOVIÓ, no de una constante: así la
    // caminata del modelo va al ritmo real y no patina.
    const dist = Math.sqrt(dx * dx + dz * dz)
    this.currentSpeed = delta > 0 ? dist / delta : 0
    this.isMoving = this.currentSpeed > 0.35

    this.mesh.position.copy(this.position)
    this.ring.position.x = this.position.x
    this.ring.position.z = this.position.z

    if (this.isMoving) this._turnTowards(Math.atan2(-dx, -dz), delta)
    this.model.update(delta, this.currentSpeed, this.isMoving)
  }

  /** Giro suavizado por el camino más corto. Igual que el del jugador. */
  _turnTowards(target, delta) {
    const t = 1 - Math.exp(-CONFIG.PLAYER.TURN_SMOOTHING * delta)
    let diff = target - this.facing
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    this.facing += diff * t
    this.mesh.rotation.y = this.facing
  }
}

export class Squad {
  /**
   * @param {object} deps { enemies, projectiles, progression, profile }
   * @param {object} atlas la textura del soldado del jugador, para compartirla
   */
  constructor(scene, deps, atlas) {
    /**
     * Un puesto por lugar libre del escuadrón. MAX cuenta al principal, así
     * que los compañeros son uno menos.
     */
    this.members = CONFIG.SQUAD.OFFSETS.slice(0, CONFIG.SQUAD.MAX - 1).map(
      (offset) => new Companion(scene, deps, atlas, offset),
    )
  }

  /** Cuántos personajes hay en total, contándote a vos. */
  get size() {
    let n = 1
    for (const m of this.members) if (m.active) n++
    return n
  }

  get full() {
    return this.size >= CONFIG.SQUAD.MAX
  }

  /** Claves de arma de los compañeros vivos, en orden. Lo lee el HUD. */
  get keys() {
    const out = []
    for (const m of this.members) if (m.active) out.push(m.weaponKey)
    return out
  }

  has(key) {
    for (const m of this.members) if (m.active && m.weaponKey === key) return true
    return false
  }

  /**
   * Suma un personaje al escuadrón.
   *
   * @returns {boolean} si entró. Devuelve false si ya estaba o no hay lugar:
   *          quien lo llama no tiene que revisar antes, y la mejora del menú
   *          de nivel no puede duplicar a nadie por una condición mal escrita.
   */
  add(key, playerPos) {
    if (WEAPON[key] === undefined || this.full || this.has(key)) return false
    for (const m of this.members) {
      if (m.active) continue
      m.equip(key, playerPos)
      return true
    }
    return false
  }

  /** Vuelve al escuadrón de una persona. Los muñecos se reusan, no se recrean. */
  reset() {
    for (const m of this.members) m.clear()
  }

  update(delta, playerPos) {
    for (const m of this.members) {
      if (!m.active) continue
      m.update(delta, playerPos)
      m.weapons.update(delta)
    }
  }
}
