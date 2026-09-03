import { CONFIG } from '../config/GameConfig.js'

/**
 * Progression — nivel, XP y los multiplicadores que las mejoras modifican.
 *
 * Es también el único lugar donde vive el estado que las mejoras tocan. Antes de
 * esto, "más daño" habría significado modificar la tabla de armas en runtime, y
 * la tabla es DATOS: si una partida la muta, la siguiente arranca con los
 * números cambiados. Acá los multiplicadores son estado de partida y se
 * reinician con reset(); WEAPON_DEFS nunca se toca.
 */
export class Progression {
  constructor() {
    this.reset()
  }

  reset() {
    this.level = 1
    this.xp = 0
    this.xpToNext = this._curve(1)
    this.totalXp = 0
    /** Mejoras tomadas, por clave: clave -> cuántas veces. */
    this.taken = new Map()

    this.stats = {
      damageMult: 1,
      cooldownMult: 1,
      magnetRadius: CONFIG.PROGRESSION.MAGNET_RADIUS,
    }
  }

  _curve(level) {
    const { XP_BASE, XP_GROWTH } = CONFIG.PROGRESSION
    return Math.round(XP_BASE * Math.pow(XP_GROWTH, level - 1))
  }

  /**
   * @returns {number} cuántos niveles subió (puede ser más de uno si cayó una
   *   gema grande o explotó una bomba sobre media horda)
   */
  addXp(amount) {
    if (amount <= 0) return 0

    this.xp += amount
    this.totalXp += amount

    let levels = 0
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext
      this.level++
      this.xpToNext = this._curve(this.level)
      levels++
    }

    return levels
  }

  /** Cuántas veces se tomó una mejora. */
  stacks(key) {
    return this.taken.get(key) || 0
  }

  markTaken(key) {
    this.taken.set(key, this.stacks(key) + 1)
  }
}
