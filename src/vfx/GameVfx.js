import * as THREE from 'three'
import { CONFIG } from '../config/GameConfig.js'

/** Scratch para la boca del cañón. No se crea nada dentro del bucle. */
const _muzzle = new THREE.Vector3()

/**
 * GameVfx — traduce los hechos del frame a partículas.
 *
 * Hermano de GameAudio: los dos leen el mismo `FrameEvents` y ninguno de los
 * dos es conocido por la simulación. Que compartan la fuente de hechos es lo
 * que garantiza que el chispazo y el sonido del impacto ocurran en el mismo
 * frame — si cada uno dedujera lo suyo por su cuenta, tarde o temprano uno
 * empezaría a adelantarse.
 */
export class GameVfx {
  constructor(particles, { player, enemies, weapons, boss, projectiles }) {
    this.particles = particles
    this.player = player
    this.enemies = enemies
    this.weapons = weapons
    this.boss = boss
    this.projectiles = projectiles
  }

  /** @param {import('../core/FrameEvents.js').FrameEvents} ev */
  update(ev) {
    const p = this.particles
    const px = this.player.position.x
    const pz = this.player.position.z

    // ── Fogonazo ─────────────────────────────────────────────────────────
    // Sale de la boca real del fusil que sostiene el soldado, no del centro
    // del jugador: con el modelo puesto, la diferencia se nota.
    if (ev.shot) {
      this.player.model.getMuzzlePosition(_muzzle)
      p.emit('MUZZLE', _muzzle.x, _muzzle.y, _muzzle.z, this.weapons.def.color)
    }

    // ── Impacto ──────────────────────────────────────────────────────────
    if (ev.hit && ev.deaths === 0) {
      p.emit(
        'HIT',
        this.projectiles.hitX,
        CONFIG.COMBAT.PROJECTILE_HEIGHT,
        this.projectiles.hitZ,
        this.weapons.def.color,
      )
    }

    // ── Muertes ──────────────────────────────────────────────────────────
    // Una explosión por muerto, cada una en su lugar y de su color. Con 400
    // enemigos esto puede pedir más partículas de las que hay: el pool las
    // descarta y no pasa nada — son decoración, no simulación.
    const e = this.enemies
    for (let d = 0; d < ev.deaths; d++) {
      p.emit('DEATH', e.deathX[d], 0.5, e.deathZ[d], e.deathColor[d])
    }

    // ── Jugador ──────────────────────────────────────────────────────────
    if (ev.playerHit) p.emit('PLAYER_HIT', px, 1, pz)
    if (ev.playerDied) p.emit('BOSS_DEATH', px, 1, pz, 0xff2244)

    if (ev.levels > 0) p.emit('LEVEL_UP', px, 0.4, pz)

    // ── Boss ─────────────────────────────────────────────────────────────
    if (ev.bossSlam) {
      const r = this.boss.slamRing.position
      p.emit('BOSS_SLAM', r.x, 0.3, r.z)
    }
    if (ev.bossDied) p.emit('BOSS_DEATH', this.boss.lastX, 1.5, this.boss.lastZ)
  }
}
