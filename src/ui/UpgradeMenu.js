/**
 * UpgradeMenu — la pantalla de elección al subir de nivel.
 *
 * Congela la partida (el GameManager deja de simular) y espera una elección.
 * No hay opción de saltear: la decisión ES la progresión.
 *
 * Si se acumularon varios niveles de golpe — pasa con una bomba sobre media
 * horda — se encolan y se eligen de a uno.
 */
export class UpgradeMenu {
  /** @param {(upgrade:object)=>void} onPick */
  constructor(onPick) {
    this.onPick = onPick
    this.visible = false

    this.el = document.createElement('div')
    this.el.id = 'upgrade-menu'
    this.el.hidden = true
    document.body.appendChild(this.el)

    this._onKey = this._onKey.bind(this)
    window.addEventListener('keydown', this._onKey)
  }

  show(options, level, ctx) {
    this.options = options
    this.visible = true
    this.el.hidden = false

    const cards = options
      .map((up, i) => {
        const tag = up.tag || 'MEJORA'
        // El texto se arma ANTES de aplicar la mejora: después, "nivel 2 → 3"
        // ya mostraría el nivel nuevo y se leería como si no hubiera subido.
        const extra = up.label ? up.label(ctx) : ''
        const color = up.color ? '#' + up.color.toString(16).padStart(6, '0') : '#39d0ff'
        return `
          <button class="ucard" data-i="${i}" style="--u-color:${color}">
            <span class="utag">${tag}${extra ? ' · ' + extra : ''}</span>
            <span class="uname"><b>${i + 1}</b> ${up.name}</span>
            <span class="udesc">${up.desc}</span>
          </button>
        `
      })
      .join('')

    this.el.innerHTML = `
      <div class="umenu">
        <h2>NIVEL ${level}</h2>
        <p class="usub">Elegí una mejora — número o clic</p>
        <div class="ucards">${cards}</div>
      </div>
    `

    for (const btn of this.el.querySelectorAll('.ucard')) {
      btn.addEventListener('click', () => this._pick(Number(btn.dataset.i)))
    }
  }

  hide() {
    this.visible = false
    this.el.hidden = true
    this.el.innerHTML = ''
  }

  _onKey(e) {
    if (!this.visible || !e.code.startsWith('Digit')) return
    const n = Number(e.code.slice(5)) - 1
    if (n >= 0 && n < this.options.length) this._pick(n)
  }

  _pick(i) {
    const up = this.options[i]
    this.hide()
    this.onPick(up)
  }
}
