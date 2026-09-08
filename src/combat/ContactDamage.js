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
 */
export class ContactDamage {
  /**
   * @param {Array} cuerpos vos primero, después los compañeros vivos. Es la
   *   MISMA lista que usa la horda para chocar (la mantiene Squad, mutada en
   *   el lugar): si fueran dos listas, tarde o temprano una tendría a alguien
   *   que la otra no, y habría un compañero sólido pero inmune, o al revés.
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
    for (let i = 0; i < this.cuerpos.length; i++) this._golpear(this.cuerpos[i], delta)
  }

  /** El golpe más fuerte que esté tocando a `c` este frame. */
  _golpear(c, delta) {
    if (c.isDead) return

    if (c.invulnTimer > 0) {
      c.invulnTimer -= delta
      return
    }

    const e = this.enemies
    const px = c.position.x
    const pz = c.position.z
    const pr = c.radius

    // Solo cuenta el golpe más fuerte del frame: si te rodean un drone y un
    // tanque, duele el tanque. Sumar el daño de todos los que te tocan escala
    // de forma explosiva con el tamaño de la horda.
    let worst = 0

    for (let i = 0; i < e.count; i++) {
      const dx = e.posX[i] - px
      const dz = e.posZ[i] - pz
      const r = pr + e.radius[i] + CONFIG.COMBAT.CONTACT_MARGIN

      if (dx * dx + dz * dz > r * r) continue

      const dmg = ENEMY_DEFS[e.type[i]].damage
      if (dmg > worst) worst = dmg
    }

    if (worst === 0) return

    c.takeDamage(worst)
    this.hits++
  }
}
