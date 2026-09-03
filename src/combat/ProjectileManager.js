import * as THREE from 'three'
import { CONFIG } from '../config/GameConfig.js'

const _dummy = new THREE.Object3D()
const _color = new THREE.Color()

/**
 * ProjectileManager — pool de proyectiles.
 *
 * "Pooling real" es el criterio de la Parte D en el GDD. Acá significa algo
 * concreto y verificable: el array se reserva UNA vez en el constructor y
 * disparar es escribir en un índice. No hay `new` por bala. En un survivor se
 * disparan cientos de balas por segundo; crearlas y descartarlas es la fuente
 * número uno de tirones por recolección de basura.
 *
 * Mismo patrón que EnemyManager (structure of arrays + un solo InstancedMesh):
 * si entendés uno, entendés el otro.
 */
export class ProjectileManager {
  constructor(scene, enemies) {
    const max = CONFIG.COMBAT.MAX_PROJECTILES
    this.max = max
    this.count = 0
    this.enemies = enemies
    /**
     * Impactos acumulados en la partida. Es una estadística de solo lectura:
     * la publica para que otros sistemas (hoy el audio) puedan reaccionar sin
     * que este tenga que conocerlos. Se reinicia con clear().
     */
    this.hitCount = 0

    this.posX = new Float32Array(max)
    this.posZ = new Float32Array(max)
    this.velX = new Float32Array(max)
    this.velZ = new Float32Array(max)
    this.life = new Float32Array(max)
    this.damage = new Float32Array(max)
    this.size = new Float32Array(max)
    this.pierce = new Int16Array(max)
    this.explodeRadius = new Float32Array(max)
    this.explodeDamage = new Float32Array(max)
    /** Último enemigo golpeado, por id: evita que una bala que atraviesa le
     *  pegue dos veces al mismo mientras sigue solapada con él. */
    this.lastHitId = new Int32Array(max)

    this._initMesh(scene)
  }

  _initMesh(scene) {
    const geo = new THREE.SphereGeometry(0.5, 8, 6)
    const mat = new THREE.MeshBasicMaterial({}) // sin luz: una bala se lee mejor plana
    this.mesh = new THREE.InstancedMesh(geo, mat, this.max)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    for (let i = 0; i < this.max; i++) this.mesh.setColorAt(i, _color.setHex(0xffffff))
    scene.add(this.mesh)
  }

  /**
   * Devuelve false si el pool está lleno (se pierde el disparo, no se agranda).
   *
   * El daño se congela acá, en el momento del disparo, multiplicado por las
   * mejoras que había en ese instante. Si se leyera al impactar, una bala en
   * vuelo cambiaría de daño al subir de nivel a mitad de camino.
   */
  fire(x, z, dirX, dirZ, def, damageMult = 1) {
    if (this.count >= this.max) return false

    const i = this.count++
    this.posX[i] = x
    this.posZ[i] = z
    this.velX[i] = dirX * def.speed
    this.velZ[i] = dirZ * def.speed
    this.life[i] = def.lifetime
    this.damage[i] = def.damage * damageMult
    this.size[i] = def.size
    this.pierce[i] = def.pierce || 0
    this.explodeRadius[i] = def.explodeRadius || 0
    this.explodeDamage[i] = (def.explodeDamage || 0) * damageMult
    this.lastHitId[i] = 0

    this.mesh.setColorAt(i, _color.setHex(def.color))
    this.mesh.instanceColor.needsUpdate = true
    return true
  }

  _remove(i) {
    const last = --this.count
    if (i !== last) {
      this.posX[i] = this.posX[last]
      this.posZ[i] = this.posZ[last]
      this.velX[i] = this.velX[last]
      this.velZ[i] = this.velZ[last]
      this.life[i] = this.life[last]
      this.damage[i] = this.damage[last]
      this.size[i] = this.size[last]
      this.pierce[i] = this.pierce[last]
      this.explodeRadius[i] = this.explodeRadius[last]
      this.explodeDamage[i] = this.explodeDamage[last]
      this.lastHitId[i] = this.lastHitId[last]

      const c = this.mesh.instanceColor.array
      c[i * 3] = c[last * 3]
      c[i * 3 + 1] = c[last * 3 + 1]
      c[i * 3 + 2] = c[last * 3 + 2]
      this.mesh.instanceColor.needsUpdate = true
    }
  }

  clear() {
    this.count = 0
    this.mesh.count = 0
    this.hitCount = 0
  }

  /**
   * Mueve, colisiona y encola daño.
   *
   * El daño NO se aplica acá: se encola en EnemyManager y se resuelve al final
   * del frame (ver queueDamage). Mientras se recorre esta lista, los índices de
   * enemigos tienen que quedarse quietos.
   */
  update(delta) {
    const e = this.enemies
    const limit = CONFIG.WORLD.ARENA_SIZE / 2

    // Hacia atrás: eliminar con swap-remove trae el último al hueco actual, y
    // recorriendo al revés ese último ya fue procesado.
    for (let i = this.count - 1; i >= 0; i--) {
      this.life[i] -= delta
      if (this.life[i] <= 0) {
        this._remove(i)
        continue
      }

      const x = (this.posX[i] += this.velX[i] * delta)
      const z = (this.posZ[i] += this.velZ[i] * delta)

      if (x > limit || x < -limit || z > limit || z < -limit) {
        this._remove(i)
        continue
      }

      const hit = this._findHit(i, x, z)
      if (hit === -1) continue

      e.queueDamage(hit, this.damage[i])
      this.lastHitId[i] = e.id[hit]
      this.hitCount++

      if (this.explodeRadius[i] > 0) {
        this._explode(x, z, this.explodeRadius[i], this.explodeDamage[i], hit)
        this._remove(i)
        continue
      }

      if (this.pierce[i] > 0) this.pierce[i]--
      else this._remove(i)
    }
  }

  /**
   * Primer enemigo tocado por el proyectil i.
   *
   * Usa la rejilla que EnemyManager ya construyó este frame. Los enemigos se
   * movieron un poco desde entonces (< 0.1 u con el delta acotado), pero se
   * miran las 9 celdas vecinas — 2 u de margen por lado — así que ninguno se
   * escapa por haber cruzado a la celda de al lado.
   */
  _findHit(i, x, z) {
    const e = this.enemies
    const grid = e.grid
    const { items, start, dim } = grid
    const size = this.size[i]
    const skipId = this.lastHitId[i]

    const cx = grid.cellX(x)
    const cz = grid.cellZ(z)
    const x0 = cx > 0 ? cx - 1 : 0
    const x1 = cx < dim - 1 ? cx + 1 : dim - 1
    const z0 = cz > 0 ? cz - 1 : 0
    const z1 = cz < dim - 1 ? cz + 1 : dim - 1

    for (let gz = z0; gz <= z1; gz++) {
      const row = gz * dim
      for (let gx = x0; gx <= x1; gx++) {
        const cell = row + gx
        const from = start[cell]
        const to = start[cell + 1]

        for (let k = from; k < to; k++) {
          const j = items[k]
          // La rejilla es de este frame, pero alguien pudo morir después de
          // construirla: los índices por encima de count ya no existen.
          if (j >= e.count || e.id[j] === skipId) continue

          const dx = e.posX[j] - x
          const dz = e.posZ[j] - z
          const r = e.radius[j] + size

          if (dx * dx + dz * dz <= r * r) return j
        }
      }
    }

    return -1
  }

  /** Daño en área. Recorre la horda entera: pasa pocas veces por segundo. */
  _explode(x, z, radius, damage, skipIndex) {
    const e = this.enemies
    const rSq = radius * radius

    for (let j = 0; j < e.count; j++) {
      if (j === skipIndex) continue // ya recibió el impacto directo
      const dx = e.posX[j] - x
      const dz = e.posZ[j] - z
      if (dx * dx + dz * dz <= rSq) e.queueDamage(j, damage)
    }
  }

  /** Vuelca el estado a la GPU. */
  sync() {
    const n = this.count
    for (let i = 0; i < n; i++) {
      const s = this.size[i] * 2
      _dummy.position.set(this.posX[i], CONFIG.COMBAT.PROJECTILE_HEIGHT, this.posZ[i])
      _dummy.rotation.y = 0
      _dummy.scale.set(s, s, s)
      _dummy.updateMatrix()
      this.mesh.setMatrixAt(i, _dummy.matrix)
    }
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
