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

  _computeDesired() {
    const { OFFSET } = CONFIG.CAMERA
    this._desired.set(
      this.target.position.x + OFFSET.x,
      this.target.position.y + OFFSET.y,
      this.target.position.z + OFFSET.z,
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
