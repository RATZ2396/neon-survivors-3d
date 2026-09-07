/**
 * PauseMenu — pausa de verdad, no una capa encima.
 *
 * Pausar es dejar de llamar a la simulación, no ponerle un `if` adentro a cada
 * sistema. El GameManager simplemente no entra en la rama de PLAYING, así que
 * ningún sistema tiene que saber que la pausa existe. Es la misma razón por la
 * que el menú de subir de nivel ya funcionaba sin que nadie lo tocara.
 *
 * El salto de tiempo no es problema: `Time` recorta el delta con MAX_DELTA, así
 * que volver después de diez minutos entrega un frame normal y no teletransporta
 * a la horda hasta el jugador.
 */
export class PauseMenu {
  /**
   * @param {{onResume:Function, onQuit:Function, onToggleSound:Function,
   *          onOptions:Function}} acciones
   */
  constructor(acciones) {
    this.acciones = acciones
    this.visible = false

    this.el = document.createElement('div')
    this.el.id = 'pause-menu'
    this.el.hidden = true
    this.el.innerHTML = `
      <div class="pmenu">
        <h2>PAUSA</h2>
        <div class="pstats" data-stats></div>
        <div class="pbtns">
          <button data-act="resume">Continuar</button>
          <button data-act="sound" data-sound>Sonido</button>
          <button data-act="options">Ajustes y controles</button>
          <button data-act="quit">Abandonar y volver al taller</button>
        </div>
        <p class="phint">Esc o P para seguir jugando</p>
      </div>
    `
    document.body.appendChild(this.el)

    this.stats = this.el.querySelector('[data-stats]')
    this.soundBtn = this.el.querySelector('[data-sound]')

    this.el.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-act]')
      if (!btn) return
      if (btn.dataset.act === 'resume') this.acciones.onResume()
      else if (btn.dataset.act === 'quit') this.acciones.onQuit()
      else if (btn.dataset.act === 'sound') this.acciones.onToggleSound()
      else if (btn.dataset.act === 'options') this.acciones.onOptions()
    })
  }

  /**
   * @param {{tiempo:number, bajas:number, nivel:number, arma:string}} resumen
   * @param {boolean} silenciado
   */
  show(resumen, silenciado) {
    this.visible = true
    this.el.hidden = false

    const mm = String(Math.floor(resumen.tiempo / 60)).padStart(2, '0')
    const ss = String(Math.floor(resumen.tiempo % 60)).padStart(2, '0')
    this.stats.innerHTML = `
      <span>${resumen.arma}</span>
      <span>Nivel ${resumen.nivel}</span>
      <span>${resumen.bajas} bajas</span>
      <span>${mm}:${ss}</span>
    `
    this.refreshSound(silenciado)
  }

  refreshSound(silenciado) {
    this.soundBtn.textContent = silenciado ? 'Sonido: apagado' : 'Sonido: encendido'
    this.soundBtn.classList.toggle('off', silenciado)
  }

  hide() {
    this.visible = false
    this.el.hidden = true
  }
}
