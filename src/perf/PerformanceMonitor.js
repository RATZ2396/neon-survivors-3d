import { CONFIG } from '../config/GameConfig.js'

/**
 * PerformanceMonitor — el ÚNICO panel de debug del proyecto.
 *
 * En la versión anterior había overlays de colores distintos apilados
 * (naranja, rojo, cyan), uno por cada intento de fix, compitiendo por la misma
 * esquina de la pantalla. Regla nueva: un solo panel, acá, apagable desde
 * CONFIG.DEV.SHOW_DEBUG_PANEL.
 */
export class PerformanceMonitor {
  constructor() {
    this.enabled = CONFIG.DEV.SHOW_DEBUG_PANEL
    this.fps = 0

    this._frames = 0
    this._accum = 0
    this._sampleInterval = 0.25

    if (!this.enabled) return

    this.el = document.createElement('div')
    this.el.id = 'debug-panel'
    document.body.appendChild(this.el)
  }

  /**
   * @param {number} delta
   * @param {object} stats datos a mostrar (posición, velocidad, etc.)
   */
  update(delta, stats) {
    if (!this.enabled) return

    this._frames++
    this._accum += delta

    if (this._accum < this._sampleInterval) return

    this.fps = Math.round(this._frames / this._accum)
    const frameMs = (this._accum / this._frames) * 1000
    this._frames = 0
    this._accum = 0

    const heap = performance.memory
      ? `${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)} MB`
      : 'n/d'

    // Solo diagnóstico técnico. Vida, oleada, bajas y armas son información
    // del JUEGO y viven en el HUD (src/ui/HUD.js) — no se duplican acá.
    this.el.textContent =
      `FPS ${this.fps}  ·  ${frameMs.toFixed(2)} ms  ·  heap ${heap}\n` +
      `draw calls ${stats.renderCalls}\n` +
      `entidades  ${stats.enemies} enemigos  ·  ${stats.projectiles} balas\n` +
      `pos  x ${stats.x.toFixed(2)}  z ${stats.z.toFixed(2)}\n` +
      `vel  ${stats.speed.toFixed(2)} u/s  ·  ${stats.moving ? 'MOVIENDO' : 'QUIETO'}\n` +
      `input x ${stats.inputX.toFixed(2)}  z ${stats.inputZ.toFixed(2)}`
  }
}
