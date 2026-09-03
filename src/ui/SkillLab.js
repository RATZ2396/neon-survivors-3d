import { SKILL_DEFS, SKILL_KIND } from '../config/SkillDefs.js'

/**
 * SkillLab — panel de desarrollo para mirar las habilidades y decidir.
 *
 * NO es parte del juego: es una herramienta de diseño. Sirve para ver cada
 * habilidad funcionando, subirle y bajarle el nivel en vivo, traer enemigos de
 * prueba y comparar el daño real que hace cada una — sin jugar veinte minutos
 * ni tocar código.
 *
 * A propósito NO pausa la partida: la mitad de lo que hay que evaluar de una
 * habilidad es cómo se ve y cómo se siente mientras el juego corre.
 *
 * Se abre y cierra con la tecla L, y solo existe en desarrollo.
 */
export class SkillLab {
  constructor(skills, enemies, player, progression) {
    this.skills = skills
    this.enemies = enemies
    this.player = player
    this.progression = progression

    this.visible = false
    /** Daño acumulado por habilidad desde el último reinicio del medidor. */
    this._dealt = new Float64Array(SKILL_DEFS.length)
    this._window = 0

    this.el = document.createElement('div')
    this.el.id = 'skill-lab'
    this.el.hidden = true
    document.body.appendChild(this.el)

    this._build()

    this._onKey = this._onKey.bind(this)
    window.addEventListener('keydown', this._onKey)
  }

  _onKey(e) {
    if (e.code === 'KeyL') this.toggle()
  }

  toggle() {
    this.visible = !this.visible
    this.el.hidden = !this.visible
    if (this.visible) this._refresh()
  }

  _build() {
    const rows = SKILL_DEFS.map((def, i) => {
      const color = '#' + def.color.toString(16).padStart(6, '0')
      return `
        <div class="lrow" data-i="${i}" style="--l-color:${color}">
          <div class="lhead">
            <span class="lname">${def.name}</span>
            <span class="lkind">${this._kindLabel(def.kind)}</span>
          </div>
          <p class="ldesc">${def.desc}</p>
          <div class="lctl">
            <button data-act="down" data-i="${i}">−</button>
            <span class="llevel" data-level="${i}">nv 0</span>
            <button data-act="up" data-i="${i}">+</button>
            <span class="lstats" data-stats="${i}"></span>
          </div>
          <table class="ltable" data-table="${i}"></table>
        </div>
      `
    }).join('')

    this.el.innerHTML = `
      <div class="lpanel">
        <div class="ltitle">
          <b>Laboratorio de habilidades</b>
          <span>L para cerrar</span>
        </div>
        <div class="lactions">
          <button data-act="horde">Traer 40 enemigos</button>
          <button data-act="clear">Limpiar arena</button>
          <button data-act="none">Quitar todas</button>
          <button data-act="all">Todas al máximo</button>
        </div>
        ${rows}
        <p class="lfoot">Los números salen de <code>src/config/SkillDefs.js</code>. Editar esa tabla cambia lo que ves acá.</p>
      </div>
    `

    this.el.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button')
      if (!btn) return
      this._action(btn.dataset.act, Number(btn.dataset.i))
    })
  }

  _kindLabel(kind) {
    if (kind === SKILL_KIND.ORBIT) return 'orbita · daño por contacto'
    if (kind === SKILL_KIND.AURA) return 'área fija · daño continuo'
    return 'golpe puntual · cada N segundos'
  }

  _action(act, i) {
    if (act === 'up') this._setLevel(i, this.skills.levelOf(i) + 1)
    else if (act === 'down') this._setLevel(i, this.skills.levelOf(i) - 1)
    else if (act === 'none') this.skills.reset()
    else if (act === 'all') {
      this.skills.reset()
      for (let s = 0; s < SKILL_DEFS.length; s++) this._setLevel(s, SKILL_DEFS[s].levels.length)
    } else if (act === 'clear') this.enemies.clear()
    else if (act === 'horde') this._spawnTestHorde()

    this._refresh()
  }

  /**
   * Fija el nivel exacto. SkillSystem solo sabe subir de a uno (así se juega),
   * así que bajar se hace reconstruyendo: es una herramienta, no el camino
   * caliente, y evita agregarle al sistema una operación que el juego no usa.
   */
  _setLevel(i, level) {
    const max = SKILL_DEFS[i].levels.length
    const target = Math.max(0, Math.min(max, level))

    const others = this.skills.owned
      .filter((o) => o.defIndex !== i)
      .map((o) => ({ key: SKILL_DEFS[o.defIndex].key, level: o.level }))

    this.skills.reset()
    for (const o of others) {
      for (let n = 0; n < o.level; n++) this.skills.grant(o.key)
    }
    for (let n = 0; n < target; n++) this.skills.grant(SKILL_DEFS[i].key)
  }

  /** Blancos resistentes alrededor del jugador, para ver el daño sin que mueran. */
  _spawnTestHorde() {
    const e = this.enemies
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2
      const d = 1.6 + (k % 5) * 0.7
      e.spawn(k % 3, this.player.position.x + Math.cos(a) * d, this.player.position.z + Math.sin(a) * d, 400)
    }
  }

  _refresh() {
    for (let i = 0; i < SKILL_DEFS.length; i++) {
      const def = SKILL_DEFS[i]
      const lvl = this.skills.levelOf(i)

      this.el.querySelector(`[data-level="${i}"]`).textContent = `nv ${lvl}`
      this.el.querySelector(`.lrow[data-i="${i}"]`).classList.toggle('active', lvl > 0)

      const stats = this.el.querySelector(`[data-stats="${i}"]`)
      stats.textContent = lvl > 0 ? this._describe(def, def.levels[lvl - 1]) : 'sin equipar'

      const table = this.el.querySelector(`[data-table="${i}"]`)
      table.innerHTML = def.levels
        .map(
          (l, n) =>
            `<tr class="${n + 1 === lvl ? 'now' : ''}"><td>nv ${n + 1}</td><td>${this._describe(def, l)}</td></tr>`,
        )
        .join('')
    }
  }

  /** Traduce los números crudos de la tabla a algo comparable entre habilidades. */
  _describe(def, l) {
    if (def.kind === SKILL_KIND.ORBIT) {
      return `${l.count} orbes · ${l.dps} dps c/u · radio ${l.radius}`
    }
    if (def.kind === SKILL_KIND.AURA) {
      return `${l.dps} dps · radio ${l.radius}`
    }
    return `${l.damage} de golpe cada ${l.interval}s · radio ${l.radius} (${Math.round(l.damage / l.interval)} dps)`
  }
}
