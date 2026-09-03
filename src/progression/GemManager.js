import * as THREE from 'three'
import { CONFIG } from '../config/GameConfig.js'

const _dummy = new THREE.Object3D()

/**
 * GemManager — las gemas de experiencia que sueltan los enemigos.
 *
 * No es decoración: es lo que le da sentido al movimiento. Si la XP se cobrara
 * sola al matar, pararse en un rincón sería óptimo. Teniendo que ir a buscarla,
 * cada muerte te empuja hacia donde estaba el peligro. Ese tironeo es el juego.
 *
 * Mismo patrón que la horda y los proyectiles: arrays de tipo fijo reservados
 * una vez y un solo InstancedMesh. Es el tercer sistema con esta forma; si
 * hiciera falta un cuarto, ahí sí valdría abstraerlo.
 */
export class GemManager {
  constructor(scene) {
    const max = CONFIG.PROGRESSION.MAX_GEMS
    this.max = max
    this.count = 0

    this.posX = new Float32Array(max)
    this.posZ = new Float32Array(max)
    this.value = new Float32Array(max)
    this.seed = new Float32Array(max) // desfase del giro, para que no roten iguales

    this._initMesh(scene)
  }

  _initMesh(scene) {
    // Octaedro: pocos triángulos y una silueta que se distingue de los cubos
    // enemigos aunque sea chiquita y esté lejos.
    const geo = new THREE.OctahedronGeometry(0.22)
    const mat = new THREE.MeshBasicMaterial({ color: 0x8bffb0 })
    this.mesh = new THREE.InstancedMesh(geo, mat, this.max)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    scene.add(this.mesh)
  }

  /**
   * Suelta una gema por cada enemigo que murió este frame.
   *
   * @returns {number} XP que NO pudo representarse como gema porque el pool
   *   estaba lleno. Se acredita directo en vez de perderse: quedarse sin cupo
   *   es un problema de memoria, no una razón para castigar al jugador.
   */
  spawnFromDeaths(enemies) {
    let overflow = 0

    for (let d = 0; d < enemies.deathCount; d++) {
      if (this.count >= this.max) {
        overflow += enemies.deathXp[d]
        continue
      }

      const i = this.count++
      this.posX[i] = enemies.deathX[d]
      this.posZ[i] = enemies.deathZ[d]
      this.value[i] = enemies.deathXp[d]
      this.seed[i] = Math.random() * Math.PI * 2
    }

    return overflow
  }

  _remove(i) {
    const last = --this.count
    if (i !== last) {
      this.posX[i] = this.posX[last]
      this.posZ[i] = this.posZ[last]
      this.value[i] = this.value[last]
      this.seed[i] = this.seed[last]
    }
  }

  clear() {
    this.count = 0
    this.mesh.count = 0
  }

  /**
   * Atrae y recoge.
   * @returns {number} XP recogida este frame
   */
  update(delta, playerPos, magnetRadius) {
    const px = playerPos.x
    const pz = playerPos.z
    const magnetSq = magnetRadius * magnetRadius
    const pickupSq = CONFIG.PROGRESSION.PICKUP_RADIUS * CONFIG.PROGRESSION.PICKUP_RADIUS
    const speed = CONFIG.PROGRESSION.MAGNET_SPEED * delta

    let collected = 0

    for (let i = this.count - 1; i >= 0; i--) {
      const dx = px - this.posX[i]
      const dz = pz - this.posZ[i]
      const dSq = dx * dx + dz * dz

      if (dSq <= pickupSq) {
        collected += this.value[i]
        this._remove(i)
        continue
      }

      if (dSq > magnetSq) continue // fuera del imán: se queda donde cayó

      const inv = speed / Math.sqrt(dSq)
      this.posX[i] += dx * inv
      this.posZ[i] += dz * inv
    }

    return collected
  }

  sync(elapsed) {
    const n = this.count
    for (let i = 0; i < n; i++) {
      _dummy.position.set(this.posX[i], 0.35, this.posZ[i])
      _dummy.rotation.y = elapsed * 2 + this.seed[i]
      _dummy.rotation.x = 0.4
      _dummy.updateMatrix()
      this.mesh.setMatrixAt(i, _dummy.matrix)
    }
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
