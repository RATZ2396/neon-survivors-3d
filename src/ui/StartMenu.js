import { WEAPON_DEFS } from '../config/WeaponDefs.js'
import { META_TREES } from '../config/MetaDefs.js'

/**
 * StartMenu — perfil, taller y elección del arma antes de empezar.
 *
 * Acá pasan las tres cosas que viven FUERA de la partida:
 *   1. elegir el arma base, que define cómo se juega todo el run
 *   2. gastar la moneda ganada en mejoras permanentes de esa arma
 *   3. ver qué números vas a llevar puestos
 *
 * Los números salen de WEAPON_DEFS pasados por el perfil, nunca escritos a mano:
 * si alguien rebalancea la escopeta o comprás cadencia, esta pantalla dice la
 * verdad sin que nadie se acuerde de actualizarla.
 *
 * Elegir y empezar están separados a propósito: con el taller adentro, un clic
 * en la tarjeta que arrancara la partida haría imposible mirar el árbol del arma
 * antes de decidir.
 */
export class StartMenu {
  /**
   * @param {(weaponKey:string)=>void} onStart
   * @param {import('../meta/PlayerProfile.js').PlayerProfile} profile
   */
  constructor(onStart, profile) {
    this.onStart = onStart
    this.profile = profile
    this.visible = false
    /** Arma marcada. Arranca en la que dejaste la última vez. */
    this.selected = profile.weapon
    /** Lo inyecta el GameManager. El menú no crea audio, solo lo usa. */
    this.sound = null

    this.el = document.createElement('div')
    this.el.id = 'start-menu'
    this.el.hidden = true
    document.body.appendChild(this.el)
    this._buildShell()

    this._onKey = this._onKey.bind(this)
    window.addEventListener('keydown', this._onKey)
  }

  /** El armazón se construye una vez; adentro solo cambia lo que cambia. */
  _buildShell() {
    this.el.innerHTML = `
      <div class="smenu">
        <div class="shead">
          <h1 class="logo">RTZ<b>BLOOD</b></h1>
          <span class="scoin"><i></i><b data-coin>0</b></span>
          <button class="ssound" data-act="mute" title="Silencio (M)"></button>
        </div>
        <p class="ssub">Elegí tu arma — define toda la partida. Las habilidades se eligen adentro, al subir de nivel.</p>
        <div class="scards" data-cards></div>
        <div class="sshop" data-shop></div>
        <div class="sfoot">
          <button class="splay" data-act="play">JUGAR</button>
          <p class="shint shint-pc">1-3 para elegir · Enter para empezar · WASD para moverte · M para silencio · el arma dispara sola</p>
          <p class="shint shint-touch">Tocá un arma para elegirla · movete con el joystick · el arma dispara sola</p>
        </div>
      </div>
    `

    this.coin = this.el.querySelector('[data-coin]')
    this.soundBtn = this.el.querySelector('[data-act="mute"]')
    this.cards = this.el.querySelector('[data-cards]')
    this.shop = this.el.querySelector('[data-shop]')

    // Un solo listener delegado en la raíz: el contenido se reescribe entero
    // cada vez que comprás, y volver a enganchar listeners en cada tarjeta sería
    // una fuga esperando a pasar.
    this.el.addEventListener('click', (ev) => {
      const el = ev.target.closest('[data-act]')
      if (!el) return
      const act = el.dataset.act
      if (act === 'play') this._start()
      else if (act === 'pick') this._select(el.dataset.key)
      else if (act === 'buy') this._buy(el.dataset.track)
      else if (act === 'wipe') this._wipe()
      else if (act === 'mute') this._toggleMute()
    })
  }

  show() {
    this.visible = true
    this.el.hidden = false
    this._render()
  }

  hide() {
    this.visible = false
    this.el.hidden = true
  }

  _select(key) {
    this.selected = key
    this.profile.weapon = key
    this.profile.save()
    this._render()
  }

  _start() {
    this.hide()
    this.onStart(this.selected)
  }

  _buy(trackKey) {
    const track = META_TREES[this.selected].find((t) => t.key === trackKey)
    // El sonido solo suena si la compra se concretó: confirmar algo que no pasó
    // es peor que no sonar.
    if (track && this.profile.buy(this.selected, track)) this.sound?.play('BUY')
    this._render()
  }

  _toggleMute() {
    if (!this.sound) return
    this.profile.muted = this.sound.toggleMute()
    this.profile.save()
    this.refreshSound()
  }

  /** Refresca el botón. Lo llama también el GameManager cuando se aprieta M. */
  refreshSound() {
    if (!this.soundBtn) return
    const off = this.profile.muted
    this.soundBtn.textContent = off ? 'SONIDO OFF' : 'SONIDO ON'
    this.soundBtn.classList.toggle('off', off)
  }

  _wipe() {
    if (!confirm('¿Borrar el perfil? Se pierden la moneda y todas las mejoras compradas.')) return
    this.profile.wipe()
    this.selected = this.profile.weapon
    this._render()
  }

  _onKey(e) {
    if (!this.visible) return

    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault()
      this._start()
      return
    }
    if (!e.code.startsWith('Digit')) return
    const n = Number(e.code.slice(5)) - 1
    if (n >= 0 && n < WEAPON_DEFS.length) this._select(WEAPON_DEFS[n].key)
  }

  _render() {
    this.coin.textContent = Math.floor(this.profile.currency)
    this.refreshSound()
    this.cards.innerHTML = WEAPON_DEFS.map((def, i) => this._card(def, i)).join('')
    this.shop.innerHTML = this._shop()
  }

  _card(def, i) {
    const color = '#' + def.color.toString(16).padStart(6, '0')
    const s = this.profile.effectiveStats(def)
    const perShot = s.count > 1 ? `${this._n(s.damage)} × ${s.count}` : this._n(s.damage)
    const on = def.key === this.selected ? ' selected' : ''
    const up = s.upgraded ? ' up' : ''

    return `
      <button class="scard${on}${up}" data-act="pick" data-key="${def.key}" style="--s-color:${color}">
        <span class="srole">${def.role}${s.upgraded ? ' · mejorada' : ''}</span>
        <span class="sname"><b>${i + 1}</b> ${def.name}</span>
        <span class="sdesc">${def.desc}</span>
        <span class="sstats">
          <i>${perShot}</i> daño
          <i>${this._n(s.cooldown)}s</i> cadencia
          <i>${this._n(s.range)} u</i> alcance
          <i>${Math.round(s.dps)}</i> dps
        </span>
      </button>
    `
  }

  /** Taller del arma marcada: su árbol, sus costos y su estado. */
  _shop() {
    const def = WEAPON_DEFS.find((d) => d.key === this.selected)
    const tree = META_TREES[this.selected] || []

    const rows = tree
      .map((t) => {
        const nivel = this.profile.levelOf(this.selected, t.key)
        const cost = this.profile.costOf(this.selected, t)
        const pips = Array.from({ length: t.max }, (_, n) =>
          n < nivel ? '<i class="on"></i>' : '<i></i>',
        ).join('')

        const btn =
          cost < 0
            ? '<span class="tmax">al máximo</span>'
            : `<button class="tbuy" data-act="buy" data-track="${t.key}"${this.profile.canBuy(this.selected, t) ? '' : ' disabled'}>${cost}</button>`

        return `
          <div class="trow${nivel > 0 ? ' owned' : ''}">
            <span class="tname">${t.name}</span>
            <span class="tdesc">${t.desc}</span>
            <span class="tpips">${pips}</span>
            ${btn}
          </div>
        `
      })
      .join('')

    return `
      <div class="stitle">
        <b>Taller · ${def.name}</b>
        <span>Las mejoras son permanentes y solo valen para esta arma</span>
      </div>
      ${rows}
      <div class="sprofile">
        <span>${this.profile.runs} partidas · mejor ${this._tiempo(this.profile.bestSeconds)}</span>
        <button class="twipe" data-act="wipe">Borrar perfil</button>
      </div>
    `
  }

  /** Un decimal, pero sin ".0" colgando cuando el número es redondo. */
  _n(v) {
    return String(Math.round(v * 10) / 10)
  }

  _tiempo(s) {
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }
}
