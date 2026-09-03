import * as THREE from 'three'
import { CONFIG } from '../config/GameConfig.js'
import { VFX_DEFS } from '../config/VfxDefs.js'

const _obj = new THREE.Object3D()
const _col = new THREE.Color()

/**
 * ParticleSystem — todas las partículas del juego, en una sola llamada de dibujo.
 *
 * Misma arquitectura que la horda y que las balas, porque el problema es el
 * mismo: muchas entidades cortitas, iguales entre sí, que aparecen y mueren en
 * el peor momento. Arrays paralelos de tipo fijo, un InstancedMesh, borrado por
 * intercambio, y CERO asignaciones dentro del bucle: todo lo que hace falta se
 * reserva en el constructor.
 *
 * POOL FIJO, NO ELÁSTICO. Si se llena, la partícula nueva se descarta. Un pool
 * que crece bajo presión es un pool que no sirve — el pico de memoria y de
 * recolección de basura llega justo cuando hay 400 enemigos muriendo, que es
 * exactamente el momento en que el juego no puede permitirse un tirón.
 *
 * Las partículas NO colisionan con nada ni consultan la rejilla espacial. Son
 * decoración: si costaran lo que cuesta un enemigo, no valdrían la pena.
 */
export class ParticleSystem {
  constructor(scene) {
    const max = CONFIG.VFX.MAX_PARTICLES
    this.max = max
    this.count = 0

    this.posX = new Float32Array(max)
    this.posY = new Float32Array(max)
    this.posZ = new Float32Array(max)
    this.velX = new Float32Array(max)
    this.velY = new Float32Array(max)
    this.velZ = new Float32Array(max)
    this.life = new Float32Array(max)
    this.maxLife = new Float32Array(max)
    this.size = new Float32Array(max)
    this.spin = new Float32Array(max)
    this.angle = new Float32Array(max)
    /** 1 = le pega la gravedad. */
    this.heavy = new Uint8Array(max)
    this.colR = new Float32Array(max)
    this.colG = new Float32Array(max)
    this.colB = new Float32Array(max)

    /** Cuántas se pidieron y no entraron. Lo mira la verificación. */
    this.dropped = 0

    this._initMesh(scene)
  }

  _initMesh(scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1)
    // Material sin iluminar: una partícula es luz, no una superficie. Además
    // así su brillo no depende de dónde esté la luz direccional, que es lo que
    // el bloom necesita para florecer de forma predecible.
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false })

    this.mesh = new THREE.InstancedMesh(geo, mat, this.max)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // Se dibujan alrededor del jugador, siempre a la vista: calcular el frustum
    // de 900 instancias para no descartar ninguna es trabajo tirado.
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    scene.add(this.mesh)
  }

  clear() {
    this.count = 0
    this.mesh.count = 0
    this.dropped = 0
  }

  /**
   * Dispara un efecto de VFX_DEFS en un punto.
   *
   * @param {string} key   clave de VFX_DEFS
   * @param {number} x
   * @param {number} y     altura del centro de la explosión
   * @param {number} z
   * @param {number} [color] color en hex; si falta usa el de la tabla
   */
  emit(key, x, y, z, color) {
    const def = VFX_DEFS[key]
    if (!def) return

    _col.setHex(color !== undefined ? color : def.color !== undefined ? def.color : 0xffffff)

    for (let n = 0; n < def.count; n++) {
      if (this.count >= this.max) {
        this.dropped += def.count - n
        return
      }

      const i = this.count++

      // Dirección al azar en el plano, con el empuje vertical de la tabla: una
      // explosión que sale en todas las direcciones de la esfera se ve como una
      // pelota; una que sale del piso hacia arriba se ve como un impacto.
      const a = Math.random() * Math.PI * 2
      const v = def.speed * (1 + (Math.random() * 2 - 1) * def.speedVar)

      this.posX[i] = x
      this.posY[i] = y
      this.posZ[i] = z
      this.velX[i] = Math.cos(a) * v
      this.velZ[i] = Math.sin(a) * v
      this.velY[i] = def.up * (0.35 + Math.random() * 0.65)

      const life = def.life * (1 + (Math.random() * 2 - 1) * def.lifeVar)
      this.life[i] = life
      this.maxLife[i] = life

      this.size[i] = def.size * (1 + (Math.random() * 2 - 1) * def.sizeVar)
      this.angle[i] = Math.random() * Math.PI
      this.spin[i] = (Math.random() * 2 - 1) * 9
      this.heavy[i] = def.gravity ? 1 : 0

      this.colR[i] = _col.r
      this.colG[i] = _col.g
      this.colB[i] = _col.b
    }
  }

  /**
   * Integra el movimiento y retira las que se apagaron.
   *
   * Se recorre HACIA ATRÁS: el borrado por intercambio trae la última partícula
   * al hueco, y yendo al revés esa ya fue procesada este frame. Yendo hacia
   * adelante, la recién movida se saltearía.
   */
  update(delta) {
    const g = CONFIG.VFX.GRAVITY
    const drag = Math.exp(-CONFIG.VFX.DRAG * delta)

    for (let i = this.count - 1; i >= 0; i--) {
      this.life[i] -= delta
      if (this.life[i] <= 0) {
        this._remove(i)
        continue
      }

      if (this.heavy[i]) this.velY[i] += g * delta

      this.posX[i] += this.velX[i] * delta
      this.posY[i] += this.velY[i] * delta
      this.posZ[i] += this.velZ[i] * delta

      // El rozamiento se aplica como factor exponencial y no restando: así frena
      // igual a 60 y a 144 Hz.
      this.velX[i] *= drag
      this.velZ[i] *= drag

      // Rebote seco contra el piso, perdiendo casi toda la energía. Sin esto las
      // partículas atraviesan el suelo y la explosión se ve hueca.
      if (this.posY[i] < 0.05) {
        this.posY[i] = 0.05
        this.velY[i] = -this.velY[i] * 0.28
        this.velX[i] *= 0.55
        this.velZ[i] *= 0.55
      }

      this.angle[i] += this.spin[i] * delta
    }
  }

  _remove(i) {
    const last = --this.count
    if (i === last) return

    this.posX[i] = this.posX[last]
    this.posY[i] = this.posY[last]
    this.posZ[i] = this.posZ[last]
    this.velX[i] = this.velX[last]
    this.velY[i] = this.velY[last]
    this.velZ[i] = this.velZ[last]
    this.life[i] = this.life[last]
    this.maxLife[i] = this.maxLife[last]
    this.size[i] = this.size[last]
    this.spin[i] = this.spin[last]
    this.angle[i] = this.angle[last]
    this.heavy[i] = this.heavy[last]
    this.colR[i] = this.colR[last]
    this.colG[i] = this.colG[last]
    this.colB[i] = this.colB[last]
  }

  /** Vuelca a la GPU. Aparte del update, igual que la horda. */
  sync() {
    const n = this.count
    this.mesh.count = n
    if (n === 0) return

    for (let i = 0; i < n; i++) {
      // Se achica al morir en vez de desvanecerse: la transparencia obliga a
      // ordenar por profundidad todos los frames, y encima el bloom la trata
      // distinto según lo que tenga detrás.
      const t = this.life[i] / this.maxLife[i]
      const s = this.size[i] * t

      _obj.position.set(this.posX[i], this.posY[i], this.posZ[i])
      _obj.rotation.set(this.angle[i] * 0.6, this.angle[i], 0)
      _obj.scale.set(s, s, s)
      _obj.updateMatrix()
      this.mesh.setMatrixAt(i, _obj.matrix)

      _col.setRGB(this.colR[i], this.colG[i], this.colB[i])
      this.mesh.setColorAt(i, _col)
    }

    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }
}
