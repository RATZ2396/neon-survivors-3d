import { CONFIG } from '../config/GameConfig.js'

/**
 * Time — fuente única de deltaTime.
 *
 * Todo lo que se mueva debe multiplicar por `delta`. Eso hace el juego
 * independiente de la tasa de refresco: a 60 Hz y a 144 Hz el personaje
 * recorre la misma distancia por segundo.
 */
export class Time {
  constructor() {
    this.delta = 0
    this.elapsed = 0
    this.frame = 0
    this._last = performance.now() / 1000
  }

  /** Se llama una sola vez por frame, al principio del loop. */
  update() {
    const now = performance.now() / 1000
    let delta = now - this._last
    this._last = now

    // Clamp: evita el salto gigante al volver de una pestaña en segundo plano.
    if (delta > CONFIG.TIME.MAX_DELTA) delta = CONFIG.TIME.MAX_DELTA

    this.delta = delta
    this.elapsed += delta
    this.frame++
  }
}
