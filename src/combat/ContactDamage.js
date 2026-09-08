import { CONFIG } from '../config/GameConfig.js'
import { ENEMY_DEFS } from '../config/EnemyDefs.js'

/**
 * ContactDamage — el daño de la horda al ESCUADRÓN.
 *
 * Vive separado de EnemyManager a propósito: la simulación de la horda decide
 * dónde está cada uno, el combate decide qué duele. Mezclarlos fue lo que en la
 * versión anterior terminó con reglas de daño escritas en tres lugares distintos.
 *
 * Modelo (heredado del GDD v1, que funcionaba): al recibir un golpe el jugador
 * queda invulnerable un instante. Sin esas invulnerabilidades, veinte enemigos
 * tocándote al mismo tiempo te matan en un frame y el juego es injugable.
 *
 * UNA SOLA BARRA PARA LOS TRES. El escuadrón tiene un hitbox repartido en tres
 * cuerpos y una sola vida: la tuya. Tocar a un compañero es tocarte a vos.
 *
 * Durante un rato cada compañero tuvo vida propia y podía morirse solo, y era
 * un modelo peor por dos razones. La de diseño: no podés esquivar por ellos —
 * te siguen a un puesto fijo—, así que darles una barra que no controlás es
 * cobrarte por algo que no podés jugar. Y la de sensación: si se puede morir
 * uno solo, no son un escuadrón, son tres unidades que viajan juntas.
 *
 * La invulnerabilidad también es UNA. Si cada cuerpo tuviera la suya, con tres
 * cuerpos tocando enemigos cobrarías hasta el triple por segundo y el hitbox
 * más grande se volvería una condena en vez de un detalle.
 */
export class ContactDamage {
  /**
   * @param {Array} cuerpos vos primero, después los compañeros. Es la MISMA
   *   lista que usa la horda para chocar (la mantiene Squad, mutada en el
   *   lugar): si fueran dos listas, tarde o temprano una tendría a alguien que
   *   la otra no, y habría un compañero sólido pero intangible, o al revés.
   *   El primero es el jugador, y su vida es la del escuadrón entero.
   */
  constructor(cuerpos, enemies) {
    this.cuerpos = cuerpos
    this.enemies = enemies
    /** Cuántas veces recibió daño el escuadrón; útil para depurar balance. */
    this.hits = 0
  }

  reset() {
    this.hits = 0
  }

  update(delta) {
    // El jugador ES la barra de vida del escuadrón.
    const p = this.cuerpos[0]
    if (p.isDead) return

    if (p.invulnTimer > 0) {
      p.invulnTimer -= delta
      return
    }

    // El peor golpe que esté tocando A CUALQUIERA de los tres. No se suman
    // entre cuerpos por la misma razón por la que no se suman entre enemigos:
    // sumar escala de forma explosiva con el tamaño de la horda, y acá además
    // multiplicaría por el tamaño del escuadrón.
    let worst = 0
    for (let i = 0; i < this.cuerpos.length; i++) {
      const d = this._peorSobre(this.cuerpos[i])
      if (d > worst) worst = d
    }

    if (worst === 0) return

    p.takeDamage(worst)
    this.hits++
  }

  /** El golpe más fuerte que esté tocando a `c` este frame, o 0. */
  _peorSobre(c) {
    const e = this.enemies
    const px = c.position.x
    const pz = c.position.z
    const pr = c.radius

    // Si te rodean un drone y un tanque, duele el tanque.
    let worst = 0

    for (let i = 0; i < e.count; i++) {
      const dx = e.posX[i] - px
      const dz = e.posZ[i] - pz
      const r = pr + e.radius[i] + CONFIG.COMBAT.CONTACT_MARGIN

      if (dx * dx + dz * dz > r * r) continue

      const dmg = ENEMY_DEFS[e.type[i]].damage
      if (dmg > worst) worst = dmg
    }

    return worst
  }
}
