import { SKILL_DEFS } from '../config/SkillDefs.js'

/**
 * HUD — lo que el jugador necesita saber mientras juega.
 *
 * Es DOM, no 3D, y es a propósito: texto y barras en HTML no cuestan draw calls
 * ni obligan a mantener sincronizada una cámara ortográfica encima de la escena.
 *
 * Separado del PerformanceMonitor, que es otra cosa: ese muestra FPS y memoria,
 * es para desarrollar y se apaga desde CONFIG.DEV. Este es parte del juego. En
 * la versión anterior las dos cosas estaban mezcladas en overlays superpuestos y
 * no se sabía cuál era información del juego y cuál era diagnóstico.
 *
 * Ritmo de actualización: las barras de enfriamiento se mueven todos los frames
 * (siete elementos, imperceptible) pero solo se escribe en el DOM cuando el
 * valor cambió lo suficiente como para verse. El texto va a 4 Hz: nadie lee un
 * contador que cambia 60 veces por segundo.
 */
export class HUD {
  constructor(player, enemies, waves, weapons, progression, boss, skills) {
    this.player = player
    this.enemies = enemies
    this.waves = waves
    this.weapons = weapons
    this.progression = progression
    this.boss = boss
    this.skills = skills

    this._textAccum = 0
    this._lastHp = -1
    this._lastXp = -1
    this._lastReadiness = -2
    this._lastBoss = -1

    this._build()
  }

  _build() {
    const root = document.createElement('div')
    root.id = 'hud'

    root.innerHTML = `
      <div id="hud-top">
        <div id="hud-hp">
          <div id="hud-hp-fill"></div>
          <span id="hud-hp-text">100 / 100</span>
        </div>
        <div id="hud-xp">
          <div id="hud-xp-fill"></div>
          <span id="hud-level">Nv 1</span>
        </div>
        <div id="hud-stats"></div>
      </div>
      <div id="hud-boss" hidden>
        <span id="hud-boss-name"></span>
        <div id="hud-boss-bar"><div id="hud-boss-fill"></div></div>
      </div>
      <div id="hud-weapons"></div>
    `
    document.body.appendChild(root)

    this.hpFill = root.querySelector('#hud-hp-fill')
    this.hpText = root.querySelector('#hud-hp-text')
    this.xpFill = root.querySelector('#hud-xp-fill')
    this.levelText = root.querySelector('#hud-level')
    this.stats = root.querySelector('#hud-stats')
    this.bossBox = root.querySelector('#hud-boss')
    this.bossName = root.querySelector('#hud-boss-name')
    this.bossFill = root.querySelector('#hud-boss-fill')

    this.slots = root.querySelector('#hud-weapons')
    this.root = root
    this._builtLoadout = -1
  }

  /**
   * La barra de abajo es TU BUILD: el arma elegida más las habilidades que
   * fuiste consiguiendo. Se reconstruye solo cuando cambia la composición —
   * no en cada frame — y las barras de enfriamiento se actualizan aparte.
   */
  _rebuildLoadout() {
    const wDef = this.weapons.def
    const owned = this.skills.owned
    // Los números del arma ya vienen con las mejoras permanentes aplicadas: si
    // comprás cadencia y reintentás, la tarjeta tiene que decir lo nuevo. Por eso
    // la firma incluye los modificadores y no solo la clave del arma.
    const perm = this.weapons.perm
    const dmg = Math.round(wDef.damage * perm.damageMult * 10) / 10
    const cd = Math.round(wDef.cooldown * perm.cooldownMult * 100) / 100
    const count = this.weapons.shotCount
    // Firma NUMÉRICA, no una cadena. Esto corre todos los frames y la versión
    // anterior armaba un texto y un array intermedio cada vez, para que en el
    // 99.9% de los frames el resultado fuera "no cambió nada".
    let firma = this.weapons.weaponIndex * 31 + count
    firma = firma * 31 + Math.round(dmg * 10)
    firma = firma * 31 + Math.round(cd * 100)
    for (let i = 0; i < owned.length; i++) {
      firma = firma * 31 + owned[i].defIndex * 8 + owned[i].level
    }
    if (firma === this._builtLoadout) return
    this._builtLoadout = firma

    const wColor = '#' + wDef.color.toString(16).padStart(6, '0')
    const perShot = count > 1 ? `${dmg}×${count}` : `${dmg}`

    let html = `
      <div class="wcard equipped weapon" style="--w-color:${wColor}">
        <span class="wtag">ARMA</span>
        <span class="wname">${wDef.name}</span>
        <span class="wstat">${perShot} daño · ${cd}s</span>
        <span class="wcool"><i></i></span>
      </div>
    `

    for (const o of owned) {
      const def = SKILL_DEFS[o.defIndex]
      const color = '#' + def.color.toString(16).padStart(6, '0')
      const pips = Array.from({ length: def.levels.length }, (_, n) =>
        n < o.level ? '<i class="on"></i>' : '<i></i>',
      ).join('')
      html += `
        <div class="wcard equipped skill" style="--w-color:${color}">
          <span class="wtag">HABILIDAD</span>
          <span class="wname">${def.name}</span>
          <span class="wpips">${pips}</span>
        </div>
      `
    }

    this.slots.innerHTML = html
    this.weaponFill = this.slots.querySelector('.weapon .wcool i')
  }

  update(delta) {
    this._updateWeapons()
    this._updateHp()
    this._updateXp()
    this._updateBoss()

    this._textAccum += delta
    if (this._textAccum < 0.25) return
    this._textAccum = 0

    const t = this.waves.elapsed
    const mm = String(Math.floor(t / 60)).padStart(2, '0')
    const ss = String(Math.floor(t % 60)).padStart(2, '0')

    this.stats.textContent =
      `${mm}:${ss}   oleada ${this.waves.stageIndex + 1}   ` +
      `enemigos ${this.enemies.count}   bajas ${this.enemies.killCount}`
  }

  /**
   * Barra del boss. Se muestra sola cuando hay uno vivo: no hace falta que
   * nadie le avise al HUD que empezó el duelo.
   */
  _updateBoss() {
    const active = this.boss.active
    if (this.bossBox.hidden !== !active) {
      this.bossBox.hidden = !active
      if (active) this.bossName.textContent = this.boss.name
    }
    if (!active) return

    // Como en las otras barras: solo se escribe en el DOM si el cambio se ve.
    // Escribir un estilo por frame fuerza recálculo de layout para nada.
    const ratio = Math.max(0, this.boss.hp / this.boss.maxHp)
    if (Math.abs(ratio - this._lastBoss) < 0.002) return
    this._lastBoss = ratio
    this.bossFill.style.width = (ratio * 100).toFixed(1) + '%'
  }

  _updateXp() {
    const p = this.progression
    if (p.totalXp === this._lastXp) return
    this._lastXp = p.totalXp

    this.xpFill.style.width = ((p.xp / p.xpToNext) * 100).toFixed(1) + '%'
    this.levelText.textContent = `Nv ${p.level}`
  }

  _updateHp() {
    const hp = this.player.hp
    if (hp === this._lastHp) return
    this._lastHp = hp

    const ratio = hp / this.player.maxHp
    this.hpFill.style.width = (ratio * 100).toFixed(1) + '%'
    // El color de la barra es la señal más rápida de "estás por morir".
    this.hpFill.style.background = ratio > 0.5 ? '#39d0ff' : ratio > 0.25 ? '#ffd166' : '#ff4d6d'
    this.hpText.textContent = `${Math.ceil(hp)} / ${this.player.maxHp}`
  }

  _updateWeapons() {
    this._rebuildLoadout()

    const r = this.weapons.readiness
    // Solo se escribe en el DOM si el cambio se nota: escribir estilos 60 veces
    // por segundo fuerza recálculos de layout para nada.
    if (Math.abs(r - this._lastReadiness) < 0.02) return
    this._lastReadiness = r
    if (this.weaponFill) this.weaponFill.style.width = (r * 100).toFixed(0) + '%'
  }

  /**
   * Pantalla de muerte. Muestra la recompensa porque es el único momento en que
   * la partida se conecta con lo que queda después: sin ese número, morir se
   * siente como haber perdido el rato entero.
   */
  showGameOver(kills, seconds, reward = 0, currency = 0) {
    if (this._gameOverEl) return

    const el = document.createElement('div')
    el.id = 'game-over'
    el.innerHTML = `
      <div>
        <h1>MORISTE</h1>
        <p>${kills} bajas · ${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')} sobrevividos</p>
        <p class="reward">+${reward} <i>de recompensa</i> · ${Math.floor(currency)} en total</p>
        <p class="hint">R para reintentar con la misma arma · T para el taller</p>
      </div>
    `
    document.body.appendChild(el)
    this._gameOverEl = el
  }

  hideGameOver() {
    if (!this._gameOverEl) return
    this._gameOverEl.remove()
    this._gameOverEl = null
  }
}
