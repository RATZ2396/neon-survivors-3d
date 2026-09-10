import * as THREE from 'three'
import { CONFIG } from '../config/GameConfig.js'

/**
 * CameraController — cámara en 3ra persona angulada, world-locked.
 *
 * Decisión única y documentada (antes se alternó entre lerp y snap directo
 * sin decidirse): la cámara SIEMPRE interpola hacia el objetivo con un
 * suavizado exponencial independiente del framerate. No hay dos modos.
 *
 * No rota con el jugador: el mundo mantiene su orientación en pantalla, que
 * es lo que un survivor necesita para que puedas leer de dónde viene la horda.
 */
export class CameraController {
  constructor(camera, target) {
    this.camera = camera
    this.target = target

    this._desired = new THREE.Vector3()
    this._lookAt = new THREE.Vector3()

    /**
     * Multiplicador de la distancia de cámara. 1 = la de la tabla.
     *
     * Se define ANTES del snap() de abajo: snap ya calcula la posición y la
     * necesita puesta.
     */
    this.zoom = 1

    this.snap()
  }

  /**
   * Se planta detrás del jugador sin interpolar.
   *
   * Se usa en el primer frame y al reiniciar la partida. Sin esto, al reiniciar
   * la cámara viaja suavemente desde donde moriste hasta el centro de la arena,
   * y arrancás la partida nueva mirando el recorrido.
   */
  snap() {
    this._computeDesired()
    this.camera.position.copy(this._desired)
    this._computeLookAt()
    this.camera.lookAt(this._lookAt)
  }

  /**
   * Acerca o aleja la cámara. `pasos` positivo aleja, negativo acerca.
   *
   * @returns {number} el zoom que quedó, ya recortado contra los topes.
   */
  zoomBy(pasos) {
    const { ZOOM } = CONFIG.CAMERA
    const z = this.zoom * Math.pow(ZOOM.STEP, pasos)
    this.zoom = Math.min(ZOOM.MAX, Math.max(ZOOM.MIN, z))
    return this.zoom
  }

  /** Vuelve a la distancia de la tabla. */
  resetZoom() {
    this.zoom = 1
  }

  _computeDesired() {
    const { OFFSET } = CONFIG.CAMERA
    // El zoom escala el offset ENTERO: la cámara se acerca por la misma línea
    // en vez de bajar hacia el piso, así que el ángulo no cambia nunca.
    const z = this.zoom
    this._desired.set(
      this.target.position.x + OFFSET.x * z,
      this.target.position.y + OFFSET.y * z,
      this.target.position.z + OFFSET.z * z,
    )
  }

  _computeLookAt() {
    this._lookAt.set(
      this.target.position.x,
      this.target.position.y + CONFIG.CAMERA.LOOK_HEIGHT,
      this.target.position.z,
    )
  }

  update(delta) {
    this._computeDesired()

    // Suavizado exponencial: mismo comportamiento a 60 y a 144 Hz.
    const t = 1 - Math.exp(-CONFIG.CAMERA.SMOOTHING * delta)
    this.camera.position.lerp(this._desired, t)

    this._computeLookAt()
    this.camera.lookAt(this._lookAt)
  }
}
