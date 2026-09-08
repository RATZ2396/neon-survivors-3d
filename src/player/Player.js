import * as THREE from 'three'
import { CONFIG } from '../config/GameConfig.js'
import { SoldierModel } from './SoldierModel.js'

/**
 * La diferencia entre dos ángulos por el camino más corto.
 *
 * Sin esto, girar de 179° a -179° da una vuelta de 358 grados en vez de los
 * dos que son. Vive suelta porque la usan el jugador y cada compañero.
 */
export function anguloCorto(d) {
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

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
    /**
     * Radio de su cuerpo. Estaba solo en la config, y ahora hace falta como
     * campo: la horda resuelve el choque contra una lista de cuerpos —vos y
     * los compañeros— y todos tienen que poder decir cuánto miden.
     */
    this.radius = RADIUS
    /**
     * Hacia dónde mira EL CUERPO (las caderas y las piernas), en radianes.
     * 0 = -Z. El torso puede estar girado sobre esto: ver _updateFacing.
     */
    this.facing = 0
    /** Hacia dónde está apuntando el arma, y cuánto le queda de mandar. */
    this._aimAngle = 0
    this._aimHold = 0
    /** Velocidad actual en unidades/segundo (magnitud, para animación/HUD). */
    this.currentSpeed = 0
    this.isMoving = false

    this.maxHp = CONFIG.PLAYER.MAX_HP
    this.hp = this.maxHp
    /** Segundos desde el último golpe. Lo lee la regeneración. */
    this.sinceDamage = 0
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
    this._regenerate(delta)
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

  /**
   * Regeneración: se cura sola mientras no te toquen.
   *
   * El reloj lo reinicia takeDamage(), no el contacto: si te pegan, volvés
   * a empezar de cero. Por eso esto no es "más vida" — mientras estás en
   * problemas no regenera nada. Sirve para lo otro: que un raspón temprano
   * no te condene los diez minutos que siguen.
   */
  _regenerate(delta) {
    if (this.isDead) return

    this.sinceDamage += delta
    if (this.sinceDamage < CONFIG.PLAYER.REGEN_DELAY) return
    if (this.hp >= this.maxHp) return

    this.hp = Math.min(this.maxHp, this.hp + CONFIG.PLAYER.REGEN_PER_SECOND * delta)
  }

  takeDamage(amount) {
    if (this.isDead || this.invulnTimer > 0) return

    this.hp -= amount
    this.invulnTimer = CONFIG.PLAYER.INVULN_TIME
    this.sinceDamage = 0

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
    this._aimHold = 0
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
    this.sinceDamage = 0
    this.model.reset()
  }

  /**
   * "Estoy disparando hacia allá". La llama el arma en cada disparo.
   *
   * NO gira nada de golpe: deja anotado el ángulo y por cuánto tiempo manda,
   * y el giro lo resuelve _updateFacing con el resto. Antes esto escribía la
   * rotación directamente y solo cuando estabas quieto, así que corriendo el
   * muñeco miraba a donde caminaba mientras las balas salían para otro lado.
   *
   * @param {number} angle en la misma convención que `facing` (0 = -Z)
   * @param {number} hold segundos que la mira sigue mandando
   */
  faceTowards(angle, hold = CONFIG.PLAYER.AIM_HOLD_MIN) {
    this._aimAngle = angle
    this._aimHold = hold
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

  /**
   * DOS COSAS QUE MIRAN A LADOS DISTINTOS.
   *
   * Las piernas van a donde caminás; el torso, los brazos y el arma van a lo
   * que estás disparando. Es lo que hace que se vea sincronizado cuando
   * corrés en una dirección y tirás en otra, que es casi todo el tiempo.
   *
   * La cintura tiene un tope (AIM_TWIST_MAX). Pasado ese ángulo el cuerpo
   * entero acompaña, porque un torso girado 180° sobre las caderas no es un
   * soldado apuntando, es un accidente.
   */
  _updateFacing(delta, move) {
    if (this._aimHold > 0) this._aimHold -= delta

    // 1. El cuerpo sigue al movimiento. El mesh mira hacia -Z por defecto
    //    (convención three.js), igual que "adelante" en InputManager.
    if (this.isMoving) {
      const objetivo = Math.atan2(-move.x, -move.z)
      // Giro suavizado, independiente del framerate.
      const t = 1 - Math.exp(-CONFIG.PLAYER.TURN_SMOOTHING * delta)
      this.facing += anguloCorto(objetivo - this.facing) * t
    }

    // 2. El torso gira sobre el cuerpo hacia el blanco.
    let twist = 0
    if (this._aimHold > 0) {
      twist = anguloCorto(this._aimAngle - this.facing)
      const max = CONFIG.PLAYER.AIM_TWIST_MAX
      // Lo que la cintura no da, lo giran las caderas.
      if (twist > max) {
        this.facing += twist - max
        twist = max
      } else if (twist < -max) {
        this.facing += twist + max
        twist = -max
      }
    }

    this.mesh.rotation.y = this.facing
    this.model.setAimTwist(twist)
  }
}
