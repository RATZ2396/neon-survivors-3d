import * as THREE from 'three'
import { CONFIG } from '../config/GameConfig.js'
import { WEAPON_DEFS, WEAPON } from '../config/WeaponDefs.js'
import { SoldierModel } from './SoldierModel.js'
import { WeaponSystem } from '../combat/WeaponSystem.js'
import { createWeaponMods } from '../combat/WeaponMods.js'

/** Color al que tiende el anillo de un compañero herido. El mismo rojo del HUD. */
const HERIDO = new THREE.Color(0xff4d6d)

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
 * ESTÁN TODOS EN LA MISMA. Tienen cuerpo: la horda no los atraviesa y el
 * contacto les duele, igual que a vos. Durante un tiempo fueron fantasmas —los
 * enemigos les pasaban por adentro y no recibían nada— y eso rompía lo único
 * que un escuadrón tiene que comunicar. También comparten tu apuntado: si pasás
 * a manual, apuntan todos.
 *
 * DOS DECISIONES QUE CONVIENE CONOCER:
 *
 * 1. NO HEREDAN TUS HABILIDADES. Las de personaje están atadas a tu arma
 *    (`weapon` en SkillDefs), así que darle Rebote —de pistola— a un compañero
 *    con escopeta sería aplicar un modificador que nadie diseñó para eso. Sí
 *    heredan lo que no depende del arma: las mejoras del taller de SU arma y
 *    las estadísticas que ganás en la partida.
 *
 * 2. SE CONSTRUYEN AL ARRANCAR, no al conseguirlos. Armar un soldado no es
 *    gratis, y hacerlo en el instante en que elegís la mejora metería un tirón
 *    justo cuando te están correteando. Arrancan invisibles y esperan.
 */
class Companion {
  /**
   * @param {object} deps enemies, projectiles, progression, profile
   * @param {object} atlas el del jugador. Compartirlo evita generar de nuevo el
   *                       canvas de la textura, que es lo caro del soldado.
   */
  constructor(scene, deps, atlas, offset, ownerId) {
    this.offset = offset

    this.position = new THREE.Vector3()
    /** Hacia dónde mira, en radianes. Misma convención que Player. */
    this.facing = 0
    this.currentSpeed = 0
    this.isMoving = false

    this.active = false
    this.weaponKey = null

    /**
     * Cuerpo y vida, con la misma forma que los del jugador: `position`,
     * `radius`, `invulnTimer`, `isDead` y `takeDamage()`. Es lo que le permite
     * a la horda chocarlo y a ContactDamage pegarle sin saber qué clase es.
     */
    this.radius = CONFIG.PLAYER.RADIUS
    this.maxHp = CONFIG.SQUAD.MAX_HP
    this.hp = this.maxHp
    this.invulnTimer = 0
    this.sinceDamage = 0
    this.isDead = false

    this.mesh = new THREE.Group()
    this.model = new SoldierModel({ height: CONFIG.PLAYER.HEIGHT, atlas })
    this.mesh.add(this.model.object3D)
    this.mesh.visible = false
    scene.add(this.mesh)

    // Anillo de color en el piso: es lo único que dice de un vistazo QUÉ
    // personaje es cada uno. Con la cámara cenital, mirarle el arma al muñeco
    // no es una opción realista. Además vira al rojo cuando está herido, que es
    // toda la barra de vida que necesita algo que no controlás.
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

    this._colorBase = new THREE.Color(0xffffff)
    /** Última fracción de vida pintada, para no tocar el material cada frame. */
    this._pintado = -1

    /**
     * Su propia arma, con sus propios modificadores EN CERO.
     *
     * El objeto de mods es nuevo y no el compartido del jugador: ese lo escribe
     * SkillSystem con las habilidades de TU arma (ver la decisión 1 de arriba).
     * WeaponSystem solo le pide a su dueño `position`, `isMoving`,
     * `faceTowards()` y `recoil()` — todo lo que esta clase implementa.
     */
    this.weapons = new WeaponSystem(this, deps.enemies, deps.projectiles, createWeaponMods())
    this.weapons.progression = deps.progression
    this.weapons.profile = deps.profile
    this.weapons.damageScale = CONFIG.SQUAD.DAMAGE_MULT
    this.weapons.ownerId = ownerId
    this.ownerId = ownerId
    this.proyectiles = deps.projectiles
  }

  equip(key, playerPos) {
    this.weaponKey = key
    this.active = true
    this.weapons.equip(key)
    this.weapons.reset()
    // Un puesto se puede reusar cuando el anterior cae. El arma reinicia sus
    // disparos, así que el daño acumulado tiene que reiniciarse con ella: si
    // no, el informe le atribuiría al recién llegado lo que hizo el que murió.
    this.proyectiles.damageByOwner[this.ownerId] = 0

    this.hp = this.maxHp
    this.invulnTimer = 0
    this.sinceDamage = 0
    this.isDead = false

    // Aparece ya en su lugar, no viajando desde el origen del mundo.
    this.position.set(playerPos.x + this.offset.x, 0, playerPos.z + this.offset.z)
    this.mesh.position.copy(this.position)
    this.mesh.visible = true

    const def = WEAPON_DEFS[WEAPON[key]]
    this._colorBase.setHex(def.color)
    this._pintado = -1
    this.ring.visible = true
    this.model.reset()
    this.model.setHit(false)
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

  /**
   * Misma firma y mismas reglas que las del jugador: un golpe, y después un
   * instante de invulnerabilidad. Sin esa ventana, cinco enemigos tocándolo en
   * el mismo frame lo matan de una y no dura ni un encontronazo.
   */
  takeDamage(amount) {
    if (this.isDead || !this.active || this.invulnTimer > 0) return

    this.hp -= amount
    this.invulnTimer = CONFIG.PLAYER.INVULN_TIME
    this.sinceDamage = 0

    if (this.hp <= 0) {
      this.hp = 0
      this.isDead = true
    }
  }

  update(delta, playerPos) {
    if (!this.active) return

    this._regenerate(delta)

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
    this.model.setHit(this.invulnTimer > 0)
    this._pintarVida()
  }

  /** Se cura solo con la misma regla que el jugador: mientras no lo toquen. */
  _regenerate(delta) {
    this.sinceDamage += delta
    if (this.sinceDamage < CONFIG.PLAYER.REGEN_DELAY) return
    if (this.hp >= this.maxHp) return
    this.hp = Math.min(this.maxHp, this.hp + CONFIG.PLAYER.REGEN_PER_SECOND * delta)
  }

  /** El anillo vira al rojo a medida que lo lastiman. */
  _pintarVida() {
    const vida = this.hp / this.maxHp
    // Se redondea para no reescribir el material sesenta veces por segundo por
    // un cambio que nadie puede ver.
    const paso = Math.round(vida * 20) / 20
    if (paso === this._pintado) return
    this._pintado = paso
    this.ring.material.color.copy(this._colorBase).lerp(HERIDO, 1 - paso)
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

/**
 * El puesto número i del círculo, en coordenadas del mundo relativas al
 * jugador.
 *
 * La formación se guarda en polares (radio + ángulos) porque así se lee de un
 * vistazo que es UN CÍRCULO alrededor tuyo; acá se pasa a x/z una sola vez, al
 * crear cada puesto. 0° es adelante (-Z) y crece hacia la derecha.
 */
export function puestoDe(i) {
  const a = (CONFIG.SQUAD.ANGLES[i] * Math.PI) / 180
  const r = CONFIG.SQUAD.RADIUS
  return { x: Math.sin(a) * r, z: -Math.cos(a) * r }
}

export class Squad {
  /**
   * @param {object} deps { player, enemies, projectiles, progression, profile }
   * @param {object} atlas la textura del soldado del jugador, para compartirla
   */
  constructor(scene, deps, atlas) {
    this.player = deps.player

    /**
     * Un puesto por lugar libre del escuadrón. MAX cuenta al principal, así
     * que los compañeros son uno menos.
     */
    this.members = CONFIG.SQUAD.ANGLES.slice(0, CONFIG.SQUAD.MAX - 1).map(
      // El id 0 es el jugador, así que los compañeros arrancan en 1.
      (_, i) => new Companion(scene, deps, atlas, puestoDe(i), i + 1),
    )

    /**
     * Aviso de que alguien entró o cayó: (evento, clave, puesto). Lo engancha
     * el GameManager para el grabador de partidas. El escuadrón no sabe que
     * existe un grabador.
     */
    this.onCambio = null

    /**
     * LOS CUERPOS DEL ESCUADRÓN: vos primero, después los compañeros vivos.
     *
     * Una sola lista para dos cosas que tienen que coincidir siempre: contra
     * quién choca la horda y a quién le pega. Con dos listas separadas, tarde o
     * temprano una tendría a alguien que la otra no, y habría un compañero
     * sólido pero inmune —o al revés, invisible y recibiendo golpes.
     *
     * Se muta EN EL LUGAR y nunca se reemplaza: EnemyManager y ContactDamage
     * guardan esta misma referencia desde el arranque.
     */
    this.bodies = [this.player]
  }

  _rebuildBodies() {
    this.bodies.length = 1
    for (const m of this.members) if (m.active) this.bodies.push(m)
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
    for (let i = 0; i < this.members.length; i++) {
      const m = this.members[i]
      if (m.active) continue
      m.equip(key, playerPos)
      this._rebuildBodies()
      this.onCambio?.('suma', key, i)
      return true
    }
    return false
  }

  /** Vuelve al escuadrón de una persona. Los muñecos se reusan, no se recrean. */
  reset() {
    for (const m of this.members) m.clear()
    this._rebuildBodies()
  }

  /**
   * Los mueve a su puesto. Va ANTES de que la horda se actualice: si fuera
   * después, la horda chocaría contra donde estaban el frame pasado, y en
   * diagonal se los vería resbalar por adentro de los enemigos.
   *
   * Acá también caen. El que se queda sin vida sale del escuadrón y LIBERA SU
   * LUGAR: perder un compañero duele, pero no te cierra la puerta a reclutar
   * otro, que sería castigar dos veces la misma mala pasada.
   */
  moveTo(delta, playerPos) {
    let cayo = false
    for (let i = 0; i < this.members.length; i++) {
      const m = this.members[i]
      if (!m.active) continue
      m.update(delta, playerPos)
      if (m.isDead) {
        // El aviso va ANTES de clear(), que le borra la clave del arma.
        this.onCambio?.('cae', m.weaponKey, i)
        m.clear()
        cayo = true
      }
    }
    if (cayo) this._rebuildBodies()
  }

  /**
   * Sus armas disparan. Va DESPUÉS de que la horda se movió, igual que la
   * tuya: apuntarle a posiciones de hace un frame se nota en diagonal.
   */
  fire(delta) {
    for (const m of this.members) if (m.active) m.weapons.update(delta)
  }

  /**
   * Todos apuntan como vos.
   *
   * Si pasás a manual y ellos siguen en automático, el escuadrón deja de ser un
   * escuadrón y pasan a ser tres tipos con opiniones distintas sobre a quién
   * hay que dispararle.
   */
  setAim(active, x, z) {
    for (const m of this.members) {
      if (!m.active) continue
      m.weapons.aimActive = active
      m.weapons.aimX = x
      m.weapons.aimZ = z
    }
  }
}
