/**
 * MainMenu — la primera pantalla, antes de elegir personaje.
 *
 * POR QUÉ EXISTE. El juego abría directo en el taller: la elección de
 * personaje, el árbol de mejoras y los precios, todo de golpe y antes de que
 * nadie hubiera visto una bala. Para el que ya juega eso es un atajo; para el
 * que llega de un portal es una pantalla de configuración que aparece sin
 * haberla pedido, y la primera decisión del juego termina siendo "¿qué es todo
 * esto?".
 *
 * Ahora hay un paso antes: el nombre, tres botones y nada más. Jugar te lleva
 * al taller, y los ajustes y los controles están acá arriba, donde se los busca
 * cuando algo molesta — no escondidos adentro de la pantalla de compras.
 *
 * No decide nada del juego: recibe tres funciones y las llama. Quién cambia de
 * estado sigue siendo el GameManager, igual que con el resto de los menús.
 */
export class MainMenu {
  /**
   * @param {{onPlay:Function, onOptions:Function, onControls:Function}} acciones
   * @param {import('../meta/PlayerProfile.js').PlayerProfile} profile
   */
  constructor(acciones, profile) {
    this.acciones = acciones
    this.profile = profile
    this.visible = false

    this.el = document.createElement('div')
    this.el.id = 'main-menu'
    this.el.hidden = true
    this.el.innerHTML = `
      <div class="mmenu">
        <h1 class="logo">RTZ<b>BLOOD</b></h1>
        <p class="msub">El arma dispara sola. Lo único que controlás es dónde estás parado.</p>
        <div class="mbtns">
          <button class="splay" data-act="play">JUGAR</button>
          <button class="mbtn" data-act="options">Ajustes</button>
          <button class="mbtn" data-act="controls">Controles</button>
        </div>
        <p class="mprofile" data-profile></p>
      </div>
    `
    document.body.appendChild(this.el)

    this.profileLine = this.el.querySelector('[data-profile]')

    this.el.addEventListener('click', (ev) => {
      const act = ev.target.closest('[data-act]')?.dataset.act
      if (act === 'play') this.acciones.onPlay()
      else if (act === 'options') this.acciones.onOptions()
      else if (act === 'controls') this.acciones.onControls()
    })

    this._onKey = this._onKey.bind(this)
    window.addEventListener('keydown', this._onKey)
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

  /**
   * El renglón de abajo es lo único que cambia, y cambia poco: se rearma al
   * mostrar y no cada frame.
   *
   * Al que nunca jugó no se le muestran ceros. Un "0 monedas · 0 partidas ·
   * mejor 0:00" no informa nada y le dice al recién llegado que ya está
   * atrasado.
   */
  _render() {
    const p = this.profile
    if (p.runs === 0) {
      this.profileLine.textContent = 'Primera partida'
      return
    }

    const mm = Math.floor(p.bestSeconds / 60)
    const ss = String(Math.floor(p.bestSeconds % 60)).padStart(2, '0')
    const partidas = p.runs === 1 ? '1 partida' : p.runs + ' partidas'
    this.profileLine.innerHTML =
      `<i>◈</i> ${Math.floor(p.currency)} · ${partidas} · mejor ${mm}:${ss}`
  }

  _onKey(e) {
    if (!this.visible) return
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault()
      this.acciones.onPlay()
    }
  }
}
