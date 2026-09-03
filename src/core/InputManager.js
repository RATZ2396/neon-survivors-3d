import nipplejs from 'nipplejs'
import { CONFIG } from '../config/GameConfig.js'

/**
 * InputManager — única fuente de verdad del input de movimiento.
 *
 * ┌─ CONVENCIÓN DE EJES (leer antes de tocar nada) ──────────────────────┐
 * │                                                                      │
 * │   El jugador se mueve sobre el plano XZ. Y es la altura.             │
 * │                                                                      │
 * │        -Z  (adelante / arriba en pantalla)                           │
 * │         ↑                                                            │
 * │   -X ←──┼──→ +X   (izquierda / derecha)                             │
 * │         ↓                                                            │
 * │        +Z  (atrás / abajo en pantalla)                              │
 * │                                                                      │
 * │   W = -Z     S = +Z     A = -X     D = +X                            │
 * │   Joystick arriba = -Z   Joystick derecha = +X                       │
 * │                                                                      │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Esta convención es la causa histórica de los bugs de movimiento del proyecto
 * anterior: teclado y joystick usaban conversiones distintas y cada "fix"
 * corregía uno rompiendo el otro. Acá ambos producen el MISMO vector, y
 * getMovementVector() es el único lugar del código que decide qué significa
 * "adelante".
 */
export class InputManager {
  constructor() {
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
    }

    /** Vector crudo del joystick, ya en convención de mundo (-Z = adelante). */
    this.joystick = { x: 0, z: 0 }
    this.joystickActive = false

    /** Resultado normalizado del último getMovementVector(). Reutilizado, no re-creado. */
    this._movement = { x: 0, z: 0 }

    this._keyMap = {
      KeyW: 'forward',
      ArrowUp: 'forward',
      KeyS: 'backward',
      ArrowDown: 'backward',
      KeyA: 'left',
      ArrowLeft: 'left',
      KeyD: 'right',
      ArrowRight: 'right',
    }

    this._onKeyDown = this._onKeyDown.bind(this)
    this._onKeyUp = this._onKeyUp.bind(this)
    this._onBlur = this._onBlur.bind(this)

    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
    // Si la ventana pierde el foco con una tecla apretada, el keyup nunca llega
    // y el personaje queda caminando solo para siempre. Bug clásico.
    window.addEventListener('blur', this._onBlur)

    this._initJoystick()
  }

  _onKeyDown(e) {
    const action = this._keyMap[e.code]
    if (action) {
      this.keys[action] = true
      e.preventDefault()
    }
  }

  _onKeyUp(e) {
    const action = this._keyMap[e.code]
    if (action) {
      this.keys[action] = false
      e.preventDefault()
    }
  }

  _onBlur() {
    this.keys.forward = false
    this.keys.backward = false
    this.keys.left = false
    this.keys.right = false
    this.joystick.x = 0
    this.joystick.z = 0
    this.joystickActive = false
  }

  _initJoystick() {
    const zone = document.getElementById('zone_joystick')
    if (!zone) return

    this.nipple = nipplejs.create({
      zone,
      mode: 'static',
      position: { left: '50%', top: '50%' },
      color: '#39d0ff',
      size: 110,
    })

    this.nipple.on('move', (_evt, data) => {
      if (!data || !data.vector) return
      // nipplejs: vector.y positivo = arriba. En mundo, arriba = -Z.
      this.joystick.x = data.vector.x
      this.joystick.z = -data.vector.y
      this.joystickActive = true
    })

    this.nipple.on('end', () => {
      this.joystick.x = 0
      this.joystick.z = 0
      this.joystickActive = false
    })
  }

  /**
   * Devuelve la dirección de movimiento deseada, NORMALIZADA.
   *
   * - Longitud 0 si no hay input.
   * - Longitud 1 si hay input (en cualquier dirección, incluida la diagonal).
   *
   * El objeto devuelto se reutiliza entre frames: no lo guardes por referencia,
   * copiá los valores si los necesitás más tarde.
   */
  getMovementVector() {
    let x = 0
    let z = 0

    // Teclado
    if (this.keys.right) x += 1
    if (this.keys.left) x -= 1
    if (this.keys.backward) z += 1
    if (this.keys.forward) z -= 1

    // Joystick (si está activo, se suma; en la práctica se usa uno u otro)
    if (this.joystickActive) {
      x += this.joystick.x
      z += this.joystick.z
    }

    const lengthSq = x * x + z * z

    if (lengthSq < CONFIG.INPUT.DEADZONE * CONFIG.INPUT.DEADZONE) {
      this._movement.x = 0
      this._movement.z = 0
      return this._movement
    }

    // Normalización: la diagonal no puede ser 1.41x más rápida que el recto.
    const length = Math.sqrt(lengthSq)
    this._movement.x = x / length
    this._movement.z = z / length
    return this._movement
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    window.removeEventListener('blur', this._onBlur)
    if (this.nipple) this.nipple.destroy()
  }
}
