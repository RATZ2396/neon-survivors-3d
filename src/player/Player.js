import * as THREE from 'three'
import { CONFIG } from '../config/GameConfig.js'
import { SoldierModel } from './SoldierModel.js'

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
   * El jugador es un soldado procedural (ver SoldierModel.js), no un asset: se
   * genera por código, así que no hay .glb que versionar ni pipeline de
   * exportación que mantener.
   *
   * El modelo se agrega a un grupo intermedio en vez de usarse directo como
   * `mesh`: la posición y la rotación del jugador las escribe la lógica de
   * movimiento sobre ese grupo, y el modelo anima adentro. Así la animación no
   * puede pisar el movimiento ni al revés — que es exactamente el tipo de
   * acoplamiento que el GDD §1 prohíbe.
   */
  _buildMesh(radius, height) {
    const group = new THREE.Group()
    this.model = new SoldierModel({ height })
    group.add(this.model.object3D)
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
    // La animación se alimenta SOLO de lo que ya decidió el movimiento: no
    // vuelve a leer el input ni corrige la posición.
    this.model.update(delta, this.currentSpeed, this.isMoving)
    this._updateHitFlash()
  }

  /**
   * Cura, sin pasarse del máximo. Existe como método y no como dos líneas
   * sueltas porque ahora curan dos cosas distintas —el botiquín del menú de
   * nivel y el corazón del mapa— y el tope tiene que valer para las dos.
   */
  heal(amount) {
    if (this.isDead) return
    this.hp = Math.min(this.maxHp, this.hp + amount)
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
    this.model.reset()
  }

  /** Orienta el mesh de golpe (lo usa el arma al disparar estando quieto). */
  faceTowards(angle) {
    this.facing = angle
    this.mesh.rotation.y = angle
  }

  /** Patada del arma. La llama WeaponSystem al disparar. */
  recoil(strength = 1) {
    this.model.recoil(strength)
  }

  /**
   * Destello rojo durante la invulnerabilidad. Refuerza al HUD: la barra de
   * vida dice cuánto perdiste, esto dice en qué instante.
   */
  _updateHitFlash() {
    this.model.setHit(this.invulnTimer > 0)
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
