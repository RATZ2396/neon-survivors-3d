import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { CONFIG } from '../config/GameConfig.js'

/**
 * PostFX — el bloom, y el interruptor que lo apaga cuando no rinde.
 *
 * Estilo definido en el GDD §6.1: neón oscuro. El bloom es lo que convierte un
 * objeto brillante sobre fondo oscuro en algo que parece emitir luz — las
 * balas, las gemas, las partículas y el aviso del boss. Sobre un fondo claro
 * este mismo efecto solo lavaría la imagen; por eso una decisión llevó a la otra.
 *
 * DEGRADACIÓN AUTOMÁTICA, que es la parte que importa. El GDD Parte I pide
 * presupuesto escrito antes de encender post-procesado porque en el prototipo
 * anterior esto fue de lo más caro en hardware modesto. Acá el presupuesto está
 * en CONFIG.VFX y se hace cumplir solo: si el promedio de fps se queda por
 * debajo del piso durante unos segundos, el bloom se apaga y no vuelve a
 * encenderse en esa sesión. El juego se ve peor y se juega igual — ese es el
 * orden correcto de prioridades, y no le pide al jugador que sepa qué es un
 * composer para que le ande.
 *
 * Cuando está apagado NO hay composer en el medio: render() dibuja directo. Un
 * composer con el pase desactivado igual copia la pantalla a una textura y de
 * vuelta, que es justamente el costo del que estamos huyendo.
 */
export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer
    this.scene = scene
    this.camera = camera

    this.enabled = CONFIG.VFX.BLOOM
    /** Se puso en true si el presupuesto obligó a apagarlo. Es de una sola vía. */
    this.degraded = false

    this._slowFor = 0
    /** Milisegundos que costó el último frame de post-procesado. */
    this.lastCostMs = 0

    this.composer = null
    if (this.enabled) this._build()
  }

  _build() {
    const size = this.renderer.getSize(new THREE.Vector2())

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    this.bloom = new UnrealBloomPass(
      size,
      CONFIG.VFX.BLOOM_STRENGTH,
      CONFIG.VFX.BLOOM_RADIUS,
      CONFIG.VFX.BLOOM_THRESHOLD,
    )
    this.composer.addPass(this.bloom)

    // Sin esto la imagen sale con el espacio de color equivocado y todo se ve
    // lavado: el composer trabaja en lineal y hay que devolverlo a sRGB.
    this.composer.addPass(new OutputPass())
  }

  setSize(width, height) {
    this.composer?.setSize(width, height)
  }

  /**
   * Dibuja el frame.
   *
   * @param {number} fps promedio actual, para hacer cumplir el presupuesto
   * @param {number} delta segundos del frame
   */
  render(fps, delta) {
    if (!this.enabled) {
      this.lastCostMs = 0
      this.renderer.render(this.scene, this.camera)
      return
    }

    this._enforceBudget(fps, delta)

    const t0 = performance.now()
    this.composer.render(delta)
    this.lastCostMs = performance.now() - t0
  }

  _enforceBudget(fps, delta) {
    const { DEGRADE_FPS, DEGRADE_SECONDS } = CONFIG.VFX

    // fps 0 es el arranque, antes de que el promedio tenga datos.
    if (fps > 0 && fps < DEGRADE_FPS) this._slowFor += delta
    else this._slowFor = 0

    if (this._slowFor >= DEGRADE_SECONDS) this._degrade()
  }

  /** Apaga el bloom para siempre en esta sesión y libera lo que ocupaba. */
  _degrade() {
    this.degraded = true
    this.setEnabled(false)
    console.warn(
      `[PostFX] bloom apagado: menos de ${CONFIG.VFX.DEGRADE_FPS} fps durante ` +
        `${CONFIG.VFX.DEGRADE_SECONDS}s. El presupuesto está en CONFIG.VFX.`,
    )
  }

  setEnabled(on) {
    // Una vez degradado no se vuelve a encender solo: si la máquina no da, dar
    // otra oportunidad cada vez que baje la carga produce parpadeo de calidad.
    if (on && this.degraded) return

    this.enabled = on
    if (on && !this.composer) this._build()
    if (!on && this.composer) {
      this.composer.dispose()
      this.composer = null
      this.bloom = null
    }
    this._slowFor = 0
  }

  /** Interruptor manual, para comparar con y sin. Lo usa la tecla B. */
  toggle() {
    // El manual sí puede revivirlo: si lo pedís a mano, es tu decisión.
    this.degraded = false
    this.setEnabled(!this.enabled)
    return this.enabled
  }
}
