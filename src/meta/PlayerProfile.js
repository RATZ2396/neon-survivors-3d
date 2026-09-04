import { CONFIG } from '../config/GameConfig.js'
import { WEAPON_DEFS } from '../config/WeaponDefs.js'
import { META_TREES, costOfLevel, modifiersFor } from '../config/MetaDefs.js'

/** Cambiar esta clave descarta perfiles viejos en vez de leerlos mal. */
const STORAGE_KEY = 'neon-survivors.profile.v1'

/**
 * PlayerProfile — lo único del juego que sobrevive a cerrar el navegador.
 *
 * Guarda tres cosas: el arma preferida, la moneda acumulada y qué niveles del
 * árbol de cada arma están comprados. Nada más: ni la partida en curso ni las
 * habilidades, que son estado de run y arrancan de cero siempre.
 *
 * Sobre leer de localStorage: lo que vuelve es texto que escribió una versión
 * anterior del juego, o un usuario con la consola abierta. Se trata como dato
 * sucio — se valida forma y rango, y ante cualquier duda se arranca un perfil
 * nuevo. Un perfil corrupto no puede tumbar el juego al abrirlo.
 */
export class PlayerProfile {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage
    this.load()
  }

  /** Perfil recién estrenado: sin moneda y sin nada comprado. */
  _fresh() {
    this.currency = 0
    this.weapon = WEAPON_DEFS[0].key
    /** arma -> { rama: nivel }. Se crea una entrada por arma conocida. */
    this.upgrades = {}
    for (const def of WEAPON_DEFS) this.upgrades[def.key] = {}
    this.runs = 0
    this.bestSeconds = 0
    /** Silencio. Es preferencia del jugador, así que vive con el perfil. */
    this.muted = false
  }

  load() {
    this._fresh()
    if (!this.storage) return

    let raw
    try {
      raw = this.storage.getItem(STORAGE_KEY)
    } catch {
      return // modo privado o almacenamiento bloqueado: se juega sin perfil
    }
    if (!raw) return

    let data
    try {
      data = JSON.parse(raw)
    } catch {
      return
    }
    if (!data || typeof data !== 'object') return

    this.currency = this._num(data.currency, 0)
    this.runs = this._num(data.runs, 0)
    this.bestSeconds = this._num(data.bestSeconds, 0)
    if (typeof data.weapon === 'string' && META_TREES[data.weapon]) this.weapon = data.weapon
    if (typeof data.muted === 'boolean') this.muted = data.muted

    // Solo se aceptan ramas que existen hoy y niveles dentro del máximo actual.
    // Así, bajar el máximo de una rama en la tabla no deja perfiles imposibles.
    const saved = data.upgrades && typeof data.upgrades === 'object' ? data.upgrades : {}
    for (const def of WEAPON_DEFS) {
      const from = saved[def.key]
      if (!from || typeof from !== 'object') continue
      for (const t of META_TREES[def.key] || []) {
        const n = this._num(from[t.key], 0)
        if (n > 0) this.upgrades[def.key][t.key] = Math.min(Math.floor(n), t.max)
      }
    }
  }

  _num(v, fallback) {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback
  }

  save() {
    if (!this.storage) return
    try {
      this.storage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          currency: this.currency,
          weapon: this.weapon,
          upgrades: this.upgrades,
          runs: this.runs,
          bestSeconds: this.bestSeconds,
          muted: this.muted,
        }),
      )
    } catch {
      // Cuota llena o almacenamiento bloqueado. Se pierde el progreso al cerrar,
      // pero la partida en curso no se interrumpe por eso.
    }
  }

  /** Borra todo. Lo usa el botón de reinicio del taller. */
  wipe() {
    this._fresh()
    try {
      this.storage?.removeItem(STORAGE_KEY)
    } catch {
      /* nada que hacer */
    }
  }

  levelOf(weaponKey, trackKey) {
    return this.upgrades[weaponKey]?.[trackKey] || 0
  }

  /** Costo del siguiente nivel, o -1 si la rama ya está al máximo. */
  costOf(weaponKey, track) {
    const n = this.levelOf(weaponKey, track.key)
    return n >= track.max ? -1 : costOfLevel(track, n)
  }

  canBuy(weaponKey, track) {
    const cost = this.costOf(weaponKey, track)
    return cost >= 0 && this.currency >= cost
  }

  /** @returns {boolean} si la compra se concretó */
  buy(weaponKey, track) {
    if (!this.canBuy(weaponKey, track)) return false
    this.currency -= this.costOf(weaponKey, track)
    const levels = this.upgrades[weaponKey]
    levels[track.key] = (levels[track.key] || 0) + 1
    this.save()
    return true
  }

  /** Modificadores del arma, listos para que los lea el WeaponSystem. */
  modifiersFor(weaponKey) {
    return modifiersFor(weaponKey, this.upgrades[weaponKey] || {})
  }

  /**
   * Números del arma YA con las mejoras aplicadas. Es lo que muestra la pantalla
   * de selección: si comprar cadencia no cambia el número que ves antes de
   * jugar, la compra no se siente.
   */
  effectiveStats(def) {
    const m = this.modifiersFor(def.key)
    const damage = def.damage * m.damageMult
    const cooldown = def.cooldown * m.cooldownMult
    const count = def.count + m.countAdd
    return {
      damage,
      cooldown,
      count,
      range: def.range + m.rangeAdd,
      dps: (damage * count) / cooldown,
      upgraded: m.damageMult !== 1 || m.cooldownMult !== 1 || m.rangeAdd !== 0 || m.countAdd !== 0,
    }
  }

  /**
   * Recompensa de una partida.
   *
   * `coins` es lo que el jugador JUNTÓ del piso, no lo que soltaron los
   * enemigos: lo que quedó tirado no se paga. Antes esto contaba bajas y
   * bosses, y era plata que llegaba sola por matar; ahora matar deja una
   * moneda en el piso y hay que ir. Lo único que sigue pagándose sin
   * juntarlo es el tiempo sobrevivido.
   *
   * No guarda: el que decide cuándo cerrar la partida es el GameManager.
   */
  static rewardFor(seconds, coins) {
    const { REWARD_PER_SECOND, REWARD_MIN } = CONFIG.META
    return Math.max(REWARD_MIN, Math.round(seconds * REWARD_PER_SECOND + coins))
  }

  /** Cierra la partida: acredita la recompensa y persiste. */
  finishRun(seconds, coins) {
    const reward = PlayerProfile.rewardFor(seconds, coins)
    this.currency += reward
    this.runs++
    if (seconds > this.bestSeconds) this.bestSeconds = seconds
    this.save()
    return reward
  }
}
