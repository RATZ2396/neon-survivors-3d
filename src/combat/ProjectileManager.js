import * as THREE from 'three'
import { CONFIG } from '../config/GameConfig.js'
import { ENEMY_DEFS } from '../config/EnemyDefs.js'
import { createWeaponMods } from './WeaponMods.js'

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
  /**
   * @param {object} mods modificadores que las habilidades de personaje le
   *                      hacen a las balas (ver WeaponMods.js). Se lee, no
   *                      se escribe.
   */
  constructor(scene, enemies, mods = createWeaponMods()) {
    const max = CONFIG.COMBAT.MAX_PROJECTILES
    this.max = max
    this.count = 0
    this.enemies = enemies
    this.mods = mods
    /**
     * Impactos acumulados en la partida. Es una estadística de solo lectura:
     * la publica para que otros sistemas (hoy el audio) puedan reaccionar sin
     * que este tenga que conocerlos. Se reinicia con clear().
     */
    this.hitCount = 0
    /** Dónde pegó la última bala. Lo leen las partículas. */
    this.hitX = 0
    this.hitZ = 0

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
    /** Saltos que le quedan a la bala. Tiene que ser POR BALA: se gasta. */
    this.bounces = new Int16Array(max)
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
  fire(x, z, dirX, dirZ, def, damageMult = 1, boomRadius = 0, boomDamage = 0) {
    if (this.count >= this.max) return false

    const i = this.count++
    this.posX[i] = x
    this.posZ[i] = z
    this.velX[i] = dirX * def.speed
    this.velZ[i] = dirZ * def.speed
    this.life[i] = def.lifetime
    this.damage[i] = def.damage * damageMult
    this.size[i] = def.size
    // La penetración y el rebote salen de los modificadores en el momento
    // del disparo, igual que el daño: una bala en vuelo no cambia de reglas
    // porque hayas subido de nivel a mitad de camino.
    this.pierce[i] = (def.pierce || 0) + this.mods.pierceAdd
    this.bounces[i] = this.mods.ricochet
    this.explodeRadius[i] = boomRadius || def.explodeRadius || 0
    this.explodeDamage[i] = (boomDamage || def.explodeDamage || 0) * damageMult
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
      this.bounces[i] = this.bounces[last]
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
      this.hitX = x
      this.hitZ = z

      if (this.mods.knockback > 0) this._knockback(hit, i)

      if (this.explodeRadius[i] > 0) {
        this._explode(x, z, this.explodeRadius[i], this.explodeDamage[i], hit)
        this._remove(i)
        continue
      }

      // ── QUIÉN FRENA UNA BALA ────────────────────────────────────────
      // Antes la frenaba cualquiera, y con la horda encima eso hacía que al
      // boss no le llegara nada: medido, el 0.2% del daño. Ahora un enemigo
      // marcado con `blocksShots` (boss y tanque) la frena SIEMPRE, sin
      // importar cuánta penetración le quede; el resto solo le gasta una
      // carga. El tope de penetración es lo que impide que una bala barra
      // una fila entera y convierta la horda en un trámite.
      // `pierceAll` es la habilidad "Perforación total" de la pistola: apaga
      // esta regla entera, que es exactamente lo que la hace valiosa.
      if (ENEMY_DEFS[e.type[hit]].blocksShots && !this.mods.pierceAll) {
        this._remove(i)
        continue
      }

      if (this.pierce[i] > 0) this.pierce[i]--
      // El rebote entra DESPUÉS de la penetración, no en vez de ella: se
      // gasta cuando la bala ya no puede seguir de largo.
      else if (this.bounces[i] > 0 && this._ricochet(i, x, z, hit)) this.bounces[i]--
      else this._remove(i)
    }
  }

  /**
   * Empuje del impacto. Escribe la posición directo, como la separación de
   * la horda: el empuje no es daño y no tiene por qué esperar a que se
   * resuelva la cola. A los `heavy` no los mueve nada.
   */
  _knockback(hit, i) {
    const e = this.enemies
    if (e.heavy[hit]) return

    const vx = this.velX[i]
    const vz = this.velZ[i]
    const len = Math.sqrt(vx * vx + vz * vz)
    if (len < 0.0001) return

    const k = this.mods.knockback
    const edge = CONFIG.WORLD.ARENA_SIZE / 2 - e.radius[hit]

    let nx = e.posX[hit] + (vx / len) * k
    let nz = e.posZ[hit] + (vz / len) * k
    if (nx > edge) nx = edge
    else if (nx < -edge) nx = -edge
    if (nz > edge) nz = edge
    else if (nz < -edge) nz = -edge
    e.posX[hit] = nx
    e.posZ[hit] = nz
  }

  /**
   * Reapunta la bala al enemigo más cercano que no sea el que acaba de
   * recibir. Conserva la velocidad y pierde una fracción del daño.
   *
   * @returns {boolean} false si no había a dónde saltar; ahí la bala muere
   *                    normalmente y no se gasta el rebote.
   */
  _ricochet(i, x, z, hit) {
    const e = this.enemies
    const skip = e.id[hit]
    const rangeSq = CONFIG.COMBAT.RICOCHET_RANGE * CONFIG.COMBAT.RICOCHET_RANGE

    let best = -1
    let bestSq = rangeSq
    for (let j = 0; j < e.count; j++) {
      if (e.id[j] === skip) continue
      const dx = e.posX[j] - x
      const dz = e.posZ[j] - z
      const dSq = dx * dx + dz * dz
      if (dSq < bestSq) {
        bestSq = dSq
        best = j
      }
    }
    if (best === -1) return false

    const dist = Math.sqrt(bestSq)
    if (dist < 0.0001) return false

    const vx = this.velX[i]
    const vz = this.velZ[i]
    const speed = Math.sqrt(vx * vx + vz * vz)
    this.velX[i] = ((e.posX[best] - x) / dist) * speed
    this.velZ[i] = ((e.posZ[best] - z) / dist) * speed
    this.damage[i] *= this.mods.ricochetKeep

    // Una bala a punto de expirar no llegaría ni al de al lado: se le da lo
    // justo para cubrir el salto, no una vida nueva.
    const necesita = dist / speed + 0.05
    if (this.life[i] < necesita) this.life[i] = necesita
    return true
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
