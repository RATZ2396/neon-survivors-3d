import { CONFIG } from '../config/GameConfig.js'
import { ENEMY_DEFS } from '../config/EnemyDefs.js'

/**
 * ContactDamage — el daño de la horda al jugador.
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
  constructor(player, enemies) {
    this.player = player
    this.enemies = enemies
    /** Cuántas veces recibió daño en la partida; útil para depurar balance. */
    this.hits = 0
  }

  reset() {
    this.hits = 0
  }

  update(delta) {
    const p = this.player
    if (p.isDead) return

    if (p.invulnTimer > 0) {
      p.invulnTimer -= delta
      return
    }

    const e = this.enemies
    const px = p.position.x
    const pz = p.position.z
    const pr = CONFIG.PLAYER.RADIUS

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

    p.takeDamage(worst)
    this.hits++
  }
}
