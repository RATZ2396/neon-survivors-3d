import * as THREE from 'three'
import { CONFIG } from '../config/GameConfig.js'

/**
 * Player — movimiento y representación del jugador.
 *
 * Un único handleMovement(). Si el movimiento se siente mal, se corrige ACÁ.
 * Está terminantemente prohibido reasignar estos métodos desde otro archivo
 * (ver GDD_v2 §1): ese patrón fue lo que degeneró en 6 scripts de "fix" en la
 * versión anterior del proyecto.
 */
export class Player {
  constructor(scene) {
    const { RADIUS, HEIGHT } = CONFIG.PLAYER

    this.position = new THREE.Vector3(0, 0, 0)
    /** Dirección hacia la que mira, en radianes. 0 = -Z (adelante). */
    this.facing = 0
    /** Velocidad actual en unidades/segundo (magnitud, para animación/HUD). */
    this.currentSpeed = 0
    this.isMoving = false

    this.maxHp = CONFIG.PLAYER.MAX_HP
    this.hp = this.maxHp
    this.isDead = false
    /** Segundos de invulnerabilidad restantes tras recibir un golpe. */
    this.invulnTimer = 0
    /** Multiplicador de velocidad; lo suben las mejoras (Parte E). */
    this.speedMult = 1

    this.mesh = this._buildMesh(RADIUS, HEIGHT)
    scene.add(this.mesh)

    // Scratch reutilizado — no se crean vectores dentro del loop.
    this._targetQuat = new THREE.Quaternion()
    this._up = new THREE.Vector3(0, 1, 0)
  }

  /**
   * Placeholder procedural. Los .glb del proyecto anterior se borraron;
   * cuando se incorporen modelos reales, esto se reemplaza en la Parte B
   * sin tocar la lógica de movimiento.
   */
  _buildMesh(radius, height) {
    const group = new THREE.Group()

    const bodyHeight = height - radius * 2
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(radius, bodyHeight, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x39d0ff, roughness: 0.5, metalness: 0.1 }),
    )
    body.position.y = height / 2
    group.add(body)
    this._body = body // se le cambia el emisivo al recibir daño

    // Marcador de orientación: sobresale hacia -Z, que es "adelante".
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 0.45, radius * 1.1, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
    )
    nose.rotation.x = -Math.PI / 2
    nose.position.set(0, height * 0.62, -radius * 1.1)
    group.add(nose)

    return group
  }

  /**
   * @param {number} delta segundos desde el frame anterior
   * @param {{x:number,z:number}} move vector normalizado de InputManager
   */
  update(delta, move) {
    this._handleMovement(delta, move)
    this._updateFacing(delta, move)

    this.mesh.position.copy(this.position)
    this._updateHitFlash()
  }

  takeDamage(amount) {
    if (this.isDead || this.invulnTimer > 0) return

    this.hp -= amount
    this.invulnTimer = CONFIG.PLAYER.INVULN_TIME

    if (this.hp <= 0) {
      this.hp = 0
      this.isDead = true
    }
  }

  /** Vuelve al estado inicial sin recrear nada de la escena. */
  reset() {
    this.position.set(0, 0, 0)
    this.mesh.position.copy(this.position)
    this.facing = 0
    this.mesh.rotation.y = 0
    this.currentSpeed = 0
    this.isMoving = false
    // Vida máxima y velocidad vuelven a los valores de config: las mejoras de
    // la partida anterior no se heredan a la siguiente.
    this.maxHp = CONFIG.PLAYER.MAX_HP
    this.speedMult = 1
    this.hp = this.maxHp
    this.isDead = false
    this.invulnTimer = 0
  }

  /** Orienta el mesh de golpe (lo usa el arma al disparar estando quieto). */
  faceTowards(angle) {
    this.facing = angle
    this.mesh.rotation.y = angle
  }

  /**
   * Parpadeo durante la invulnerabilidad. Es la única señal de que recibiste un
   * golpe hasta que exista el HUD (Parte G), y sin ella no se entiende por qué
   * baja la vida.
   */
  _updateHitFlash() {
    const hit = this.invulnTimer > 0
    this._body.material.emissive.setHex(hit ? 0xff2244 : 0x000000)
    this._body.material.emissiveIntensity = hit ? 0.9 : 0
  }

  _handleMovement(delta, move) {
    // ARCADE PURO (CONFIG.PLAYER.SPEED documenta la decisión):
    // sin input => velocidad 0 este mismo frame, sin deslizamiento.
    if (move.x === 0 && move.z === 0) {
      this.currentSpeed = 0
      this.isMoving = false
      return
    }

    const speed = CONFIG.PLAYER.SPEED * this.speedMult
    this.position.x += move.x * speed * delta
    this.position.z += move.z * speed * delta

    this.currentSpeed = speed
    this.isMoving = true

    this._clampToArena()
  }

  _clampToArena() {
    const limit = CONFIG.WORLD.ARENA_SIZE / 2 - CONFIG.PLAYER.RADIUS
    if (this.position.x > limit) this.position.x = limit
    else if (this.position.x < -limit) this.position.x = -limit
    if (this.position.z > limit) this.position.z = limit
    else if (this.position.z < -limit) this.position.z = -limit
  }

  _updateFacing(delta, move) {
    if (!this.isMoving) return

    // El mesh mira hacia -Z por defecto (convención three.js), igual que
    // "adelante" en InputManager: por eso el ángulo sale directo de atan2.
    const targetAngle = Math.atan2(-move.x, -move.z)

    // Giro suavizado, independiente del framerate.
    const t = 1 - Math.exp(-CONFIG.PLAYER.TURN_SMOOTHING * delta)
    let diff = targetAngle - this.facing

    // Camino más corto alrededor del círculo (evita el giro de 350° absurdo).
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2

    this.facing += diff * t
    this.mesh.rotation.y = this.facing
  }
}
