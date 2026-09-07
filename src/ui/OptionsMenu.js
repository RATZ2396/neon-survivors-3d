/**
 * OptionsMenu — los ajustes y los controles, en un solo lugar.
 *
 * POR QUÉ EXISTE. Hasta ahora cada opción vivía donde había quedado: el
 * silencio en un botón del menú y en la tecla M, el resplandor en la tecla B
 * (que no estaba escrita en ningún lado), el apuntado manual en la barra
 * espaciadora, y borrar el perfil escondido abajo del taller. En un teclado
 * eso es una lista de secretos; en un teléfono directamente no existe, porque
 * no hay teclas. Tres de esas cuatro opciones eran inalcanzables jugando con
 * el dedo.
 *
 * Lo mismo pasaba con los controles: estaban resumidos en una línea de ayuda
 * abajo del menú de inicio, que desaparece en cuanto empezás a jugar. Acá hay
 * una pestaña que se puede consultar en cualquier momento, también desde la
 * pausa.
 *
 * Este archivo NO decide nada: recibe un lector y un escritor, dibuja lo que
 * el lector devuelve y avisa lo que el jugador tocó. Quién aplica cada ajuste
 * —el mezclador de audio, el post-procesado, el renderer— sigue siendo el
 * GameManager. Es la misma separación que ya tienen PauseMenu y StartMenu: la
 * UI no le habla a la simulación.
 *
 * Se abre desde el menú de inicio y desde la pausa. Es la misma pantalla en
 * los dos casos a propósito: un ajuste que solo aparece en un sitio es un
 * ajuste que la mitad de los jugadores no encuentra.
 */
export class OptionsMenu {
  /**
   * @param {{
   *   leer: () => {volume:number, muted:boolean, bloom:boolean, quality:string, aimManual:boolean},
   *   cambiar: (clave:string, valor:any) => void,
   *   onWipe: () => void,
   *   onClose: () => void,
   * }} acciones
   */
  constructor(acciones) {
    this.acciones = acciones
    this.visible = false
    /** 'ajustes' | 'controles' */
    this.tab = 'ajustes'

    this.el = document.createElement('div')
    this.el.id = 'options-menu'
    this.el.hidden = true
    this.el.innerHTML = `
      <div class="omenu">
        <div class="ohead">
          <h2>AJUSTES</h2>
          <button class="oclose" data-act="close">Volver</button>
        </div>
        <div class="otabs">
          <button data-act="tab" data-tab="ajustes">Ajustes</button>
          <button data-act="tab" data-tab="controles">Controles</button>
        </div>
        <div class="obody" data-body></div>
      </div>
    `
    document.body.appendChild(this.el)

    this.body = this.el.querySelector('[data-body]')
    this.tabBtns = this.el.querySelectorAll('[data-act="tab"]')

    // Un solo listener delegado: el cuerpo se reescribe entero en cada cambio,
    // así que enganchar los botones de a uno sería una fuga garantizada.
    this.el.addEventListener('click', (ev) => {
      const el = ev.target.closest('[data-act]')
      if (!el) return
      const act = el.dataset.act

      if (act === 'close') this.acciones.onClose()
      else if (act === 'tab') this._setTab(el.dataset.tab)
      else if (act === 'set') this.acciones.cambiar(el.dataset.key, this._valor(el))
      else if (act === 'wipe') this.acciones.onWipe()
    })

    // El deslizador manda `input` mientras se arrastra, no `click`: sin esto el
    // volumen solo cambiaría al soltar y no se podría regular de oído.
    this.el.addEventListener('input', (ev) => {
      const el = ev.target.closest('[data-slider]')
      if (!el) return
      this.acciones.cambiar(el.dataset.slider, Number(el.value) / 100)
    })
  }

  /** Los valores viajan como texto en el DOM; acá vuelven a su tipo real. */
  _valor(el) {
    const v = el.dataset.value
    if (v === 'true') return true
    if (v === 'false') return false
    return v
  }

  show(tab = this.tab) {
    this.tab = tab
    this.visible = true
    this.el.hidden = false
    this.render()
  }

  hide() {
    this.visible = false
    this.el.hidden = true
  }

  _setTab(tab) {
    this.tab = tab
    this.render()
  }

  /**
   * Redibuja con lo que diga el perfil.
   *
   * Se vuelve a leer TODO en vez de acordarse de lo que se tocó: así el panel
   * dice la verdad aunque el ajuste se haya cambiado desde otro lado (la tecla
   * M, o el resplandor apagándose solo por falta de rendimiento).
   */
  render() {
    if (!this.visible) return

    for (const t of this.tabBtns) t.classList.toggle('on', t.dataset.tab === this.tab)
    this.body.innerHTML = this.tab === 'ajustes' ? this._ajustes() : this._controles()
  }

  _ajustes() {
    const s = this.acciones.leer()
    const vol = Math.round(s.volume * 100)

    return `
      <div class="ogroup">Sonido</div>

      <div class="orow">
        <span class="oname">Volumen</span>
        <span class="octl">
          <input type="range" min="0" max="100" step="5" value="${vol}" data-slider="volume" aria-label="Volumen">
          <b class="oval">${vol}%</b>
        </span>
      </div>

      ${this._toggle('Silencio', 'muted', s.muted, 'Callado', 'Con sonido')}

      <div class="ogroup">Imagen</div>

      ${this._toggle('Resplandor', 'bloom', s.bloom, 'Encendido', 'Apagado')}
      <p class="onota">El brillo de las balas, las gemas y los avisos del jefe. Apagarlo devuelve algunos cuadros por segundo en equipos justos.</p>

      <div class="orow">
        <span class="oname">Calidad</span>
        <span class="oseg">
          <button data-act="set" data-key="quality" data-value="high"${s.quality === 'high' ? ' class="on"' : ''}>Alta</button>
          <button data-act="set" data-key="quality" data-value="low"${s.quality === 'low' ? ' class="on"' : ''}>Baja</button>
        </span>
      </div>
      <p class="onota">Baja dibuja a menos resolución. Es lo primero que conviene probar si el juego va lento en un teléfono.</p>

      <div class="ogroup">Juego</div>

      <div class="orow">
        <span class="oname">Apuntado</span>
        <span class="oseg">
          <button data-act="set" data-key="aimManual" data-value="false"${s.aimManual ? '' : ' class="on"'}>Automático</button>
          <button data-act="set" data-key="aimManual" data-value="true"${s.aimManual ? ' class="on"' : ''}>Manual</button>
        </span>
      </div>
      <p class="onota">Automático elige el blanco solo. Manual dispara hacia el mouse, y también se alterna con Espacio.</p>

      <div class="ogroup">Datos</div>

      <div class="orow">
        <span class="oname">Borrar perfil</span>
        <button class="odanger" data-act="wipe">Borrar</button>
      </div>
      <p class="onota">Se pierden la moneda, las mejoras compradas y el mejor tiempo. No se puede deshacer.</p>
    `
  }

  /** Fila de dos estados. Se guarda el booleano, no el texto que se ve. */
  _toggle(nombre, key, valor, siOn, siOff) {
    return `
      <div class="orow">
        <span class="oname">${nombre}</span>
        <span class="oseg">
          <button data-act="set" data-key="${key}" data-value="true"${valor ? ' class="on"' : ''}>${siOn}</button>
          <button data-act="set" data-key="${key}" data-value="false"${valor ? '' : ' class="on"'}>${siOff}</button>
        </span>
      </div>
    `
  }

  /**
   * Los controles, los dos juegos completos.
   *
   * Se muestran las dos columnas siempre, sin detectar el aparato: alguien con
   * pantalla táctil puede tener un teclado enchufado, y una lista que se
   * esconde sola es una lista que no se puede consultar cuando hace falta.
   */
  _controles() {
    const filas = [
      ['Moverse', 'WASD o las flechas', 'Joystick abajo a la izquierda'],
      ['Disparar', 'Solo, sin apretar nada', 'Solo, sin apretar nada'],
      ['Apuntar a mano', 'Espacio alterna, después el mouse', 'Ajustes → Apuntado'],
      ['Pausa', 'Esc o P', 'El botón de arriba a la derecha'],
      ['Silencio', 'M', 'Ajustes → Silencio'],
      ['Elegir arma', '1 a 3, Enter para empezar', 'Tocar la tarjeta'],
      ['Elegir mejora', 'Clic en la carta', 'Tocar la carta'],
      ['Reintentar al morir', 'R', 'El botón Reintentar'],
      ['Volver al taller', 'T', 'El botón Volver al taller'],
    ]

    return `
      <div class="ocols"><span></span><b>Teclado y mouse</b><b>Pantalla táctil</b></div>
      ${filas
        .map(
          ([que, pc, tacto]) => `
        <div class="orow ocontrol">
          <span class="oname">${que}</span>
          <span class="okey"><i>Teclado</i>${pc}</span>
          <span class="okey"><i>Táctil</i>${tacto}</span>
        </div>
      `,
        )
        .join('')}
      <p class="onota">El arma dispara sola: lo único que controlás es dónde estás parado. Todo el juego sale de esa decisión.</p>
    `
  }
}
