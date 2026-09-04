import * as THREE from 'three'
import { CONFIG } from '../config/GameConfig.js'
import { ENEMY_DEFS } from '../config/EnemyDefs.js'
import { SpatialGrid } from './SpatialGrid.js'

// Scratch a nivel de módulo. Se reutiliza en cada frame: dentro del loop no se
// construye ni un solo objeto (regla de rendimiento del proyecto).
const _dummy = new THREE.Object3D()
const _color = new THREE.Color()

/**
 * EnemyManager — la horda entera.
 *
 * Dos decisiones que definen todo lo demás:
 *
 * 1. NO hay una clase Enemy con `new` por enemigo. Los datos viven en arrays
 *    paralelos de tipo fijo (structure of arrays). Aparecer y morir son
 *    escrituras en un índice: cero presión sobre el recolector de basura, que
 *    es lo que produce los tirones periódicos en los juegos de hordas.
 *
 * 2. NO hay un THREE.Mesh por enemigo. Un único InstancedMesh dibuja los 400
 *    en UNA draw call. Con meshes sueltos serían 400 llamadas por frame, que es
 *    exactamente donde se cae el rendimiento en GPU integrada.
 *
 * El precio a pagar: al morir uno, el último vivo ocupa su hueco (swap-remove),
 * así que el índice de un enemigo NO es estable entre frames. Quien lo necesite
 * estable (Parte D: proyectiles con objetivo) debe guardar el `id`, no el índice.
 */
export class EnemyManager {
  constructor(scene) {
    const max = CONFIG.ENEMIES.MAX_ALIVE
    this.max = max
    this.count = 0

    // --- Datos (structure of arrays) ---
    this.posX = new Float32Array(max)
    this.posZ = new Float32Array(max)
    this.hp = new Float32Array(max)
    this.maxHp = new Float32Array(max)
    this.speed = new Float32Array(max)
    this.radius = new Float32Array(max)
    this.type = new Uint8Array(max)
    this.seed = new Float32Array(max) // desfase del balanceo: que no floten al unísono
    this.id = new Int32Array(max) // identidad estable pese al swap-remove
    /** 1 = pesado: no lo empuja la separación ni lo bloquea la multitud. */
    this.heavy = new Uint8Array(max)
    /** Acumulador de empuje por separación; se aplica al final del frame. */
    this._pushX = new Float32Array(max)
    this._pushZ = new Float32Array(max)
    /** Daño acumulado este frame, pendiente de resolver. Ver queueDamage(). */
    this._pending = new Float32Array(max)
    this._pendingCount = 0
    /** 1 = tiene a alguien pegado adelante y no puede avanzar este frame. */
    this._blocked = new Uint8Array(max)

    /**
     * Dónde murió cada enemigo en el frame actual, para que la progresión
     * pueda soltar una gema ahí. Se vacía en cada resolveDamage(): quien lo
     * necesite tiene que leerlo en ese mismo frame.
     */
    this.deathX = new Float32Array(max)
    this.deathZ = new Float32Array(max)
    this.deathXp = new Float32Array(max)
    this.deathCoin = new Float32Array(max)
    /** Color del que murió, para que las partículas salgan de su color. */
    this.deathColor = new Int32Array(max)
    this.deathCount = 0

    this._nextId = 1
    this.killCount = 0

    /**
     * A dónde fue a parar el daño. Separa lo que le llegó a un blanco
     * prioritario (el boss) de lo que se comió la horda, que es la única
     * forma de contestar "¿por qué no le hago nada al boss?" con un número
     * en vez de con una sensación. Los lee el grabador de partidas.
     */
    this.dmgToPriority = 0
    this.dmgToRest = 0

    this.grid = new SpatialGrid(CONFIG.WORLD.ARENA_SIZE, CONFIG.ENEMIES.GRID_CELL, max)

    this._initMesh(scene)
  }

  _initMesh(scene) {
    // Geometría unitaria: la escala real de cada instancia sale de su radio.
    const geo = new THREE.BoxGeometry(1, 1, 1)
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.15 })

    this.mesh = new THREE.InstancedMesh(geo, mat, this.max)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // El frustum culling se calcula sobre el bounding del InstancedMesh entero:
    // no ahorra nada acá y sí puede hacer desaparecer la horda completa.
    this.mesh.frustumCulled = false
    this.mesh.count = 0

    // instanceColor no existe hasta el primer setColorAt; se fuerza acá para no
    // tener que comprobar su existencia en cada spawn.
    for (let i = 0; i < this.max; i++) this.mesh.setColorAt(i, _color.setHex(0xffffff))

    scene.add(this.mesh)
  }

  /**
   * Crea un enemigo. Si la horda está llena no hace nada: el techo es
   * intencional, un pico descontrolado de enemigos es un bug, no una oleada.
   * @returns {number} índice creado, o -1 si estaba llena
   */
  spawn(typeId, x, z, hpMultiplier = 1) {
    if (this.count >= this.max) return -1

    const def = ENEMY_DEFS[typeId]
    const i = this.count++

    this.posX[i] = x
    this.posZ[i] = z
    this.maxHp[i] = def.hp * hpMultiplier
    this.hp[i] = this.maxHp[i]
    this.speed[i] = def.speed
    this.radius[i] = def.radius
    this.type[i] = typeId
    this.seed[i] = Math.random() * Math.PI * 2
    this.id[i] = this._nextId++
    this.heavy[i] = def.heavy ? 1 : 0

    this.mesh.setColorAt(i, _color.setHex(def.color))
    this.mesh.instanceColor.needsUpdate = true

    return i
  }

  /** Cambia el color de una instancia (lo usa el boss para avisar sus ataques). */
  setColor(i, hex) {
    if (i < 0 || i >= this.count) return
    this.mesh.setColorAt(i, _color.setHex(hex))
    this.mesh.instanceColor.needsUpdate = true
  }

  /**
   * Índice actual de un enemigo a partir de su id.
   *
   * Hace falta porque el swap-remove mueve a todo el mundo: guardar un índice
   * entre frames es un bug esperando. Es un recorrido lineal sobre 400 como
   * mucho, y lo llama un solo sistema una vez por frame.
   *
   * @returns {number} -1 si ya no está vivo
   */
  indexOfId(id) {
    for (let i = 0; i < this.count; i++) {
      if (this.id[i] === id) return i
    }
    return -1
  }

  /**
   * Aplica daño. Es la interfaz que va a consumir la Parte D (armas).
   * @returns {number} XP si murió, 0 si sigue vivo
   */
  damage(i, amount) {
    if (i < 0 || i >= this.count) return 0

    this.hp[i] -= amount
    if (this.hp[i] > 0) return 0

    const xp = ENEMY_DEFS[this.type[i]].xp

    // Se anota dónde cayó ANTES de removerlo: después de _remove() ese índice
    // ya es de otro enemigo.
    const d = this.deathCount++
    this.deathX[d] = this.posX[i]
    this.deathZ[d] = this.posZ[i]
    this.deathXp[d] = xp
    this.deathCoin[d] = ENEMY_DEFS[this.type[i]].coin
    this.deathColor[d] = ENEMY_DEFS[this.type[i]].color

    this._remove(i)
    this.killCount++
    return xp
  }

  /**
   * Acumula daño sin aplicarlo todavía.
   *
   * POR QUÉ NO SE APLICA EN EL ACTO: matar compacta el array (swap-remove), así
   * que el índice de cualquier otro enemigo puede cambiar en ese mismo instante.
   * Si un proyectil mata al enemigo 12 mientras se está recorriendo la lista de
   * impactos, el siguiente impacto contra "el 12" le pega a OTRO enemigo — el
   * que acaba de ocupar ese hueco. Es un bug silencioso: no rompe nada, solo
   * hace que el daño caiga en el enemigo equivocado.
   *
   * La regla del frame es: todos escriben acá, y resolveDamage() aplica todo
   * junto cuando ya nadie está iterando.
   */
  /**
   * Mata todo lo vivo SIN contarlo como daño del jugador.
   *
   * El boss limpia la arena al aparecer. Antes lo hacía encolando 1e9 de daño
   * a cada enemigo con queueDamage(), y ese número entraba en los contadores
   * de diagnóstico: con siete enemigos en pantalla el informe decía "7000
   * millones de daño a la horda" y el reparto real quedaba en 0%. Matar por
   * decreto no es hacer daño, y ahora el código lo distingue.
   */
  queueWipe() {
    for (let i = 0; i < this.count; i++) {
      if (this._pending[i] === 0) this._pendingCount++
      this._pending[i] += 1e9
    }
  }

  queueDamage(i, amount) {
    if (i < 0 || i >= this.count) return
    if (this._pending[i] === 0) this._pendingCount++
    this._pending[i] += amount

    if (ENEMY_DEFS[this.type[i]].priorityTarget) this.dmgToPriority += amount
    else this.dmgToRest += amount
  }

  /**
   * Aplica el daño acumulado y devuelve la XP de los que murieron.
   *
   * Se recorre de atrás para adelante a propósito: el swap-remove trae al hueco
   * el ÚLTIMO elemento, que en ese orden ya fue procesado. De adelante para
   * atrás, ese elemento recibiría daño dos veces.
   */
  resolveDamage() {
    this.deathCount = 0
    if (this._pendingCount === 0) return 0

    let xp = 0
    for (let i = this.count - 1; i >= 0; i--) {
      const dmg = this._pending[i]
      if (dmg === 0) continue
      this._pending[i] = 0
      xp += this.damage(i, dmg)
    }

    // Los huecos por encima de count quedan con daño colgado de enemigos que ya
    // murieron; se limpian acá para no arrastrarlo al próximo spawn.
    this._pending.fill(0, this.count)
    this._pendingCount = 0
    return xp
  }

  /** Swap-remove: el último vivo ocupa el hueco. O(1), sin reordenar nada. */
  _remove(i) {
    const last = --this.count
    if (i !== last) {
      this.posX[i] = this.posX[last]
      this.posZ[i] = this.posZ[last]
      this.hp[i] = this.hp[last]
      this.maxHp[i] = this.maxHp[last]
      this.speed[i] = this.speed[last]
      this.radius[i] = this.radius[last]
      this.type[i] = this.type[last]
      this.seed[i] = this.seed[last]
      this.id[i] = this.id[last]
      this.heavy[i] = this.heavy[last]

      // El color vive en un buffer de la GPU, así que también hay que moverlo.
      const c = this.mesh.instanceColor.array
      c[i * 3] = c[last * 3]
      c[i * 3 + 1] = c[last * 3 + 1]
      c[i * 3 + 2] = c[last * 3 + 2]
      this.mesh.instanceColor.needsUpdate = true
    }

    // El daño encolado contra un enemigo que ya murió se descarta: si no, lo
    // heredaría el que ocupe el hueco (o peor, el próximo que aparezca ahí).
    this._pending[i] = 0
    this._pending[last] = 0
  }

  /** Vacía la horda sin liberar memoria (para reiniciar la partida). */
  /**
   * Vacía la arena. También pone el contador de bajas en cero: es una
   * estadística DE LA PARTIDA, no del navegador abierto.
   *
   * Sin esto las bajas se arrastraban de un run al siguiente. Era invisible
   * mientras el número solo se mostraba, pero desde que la recompensa se calcula
   * con él, reintentar sin cerrar la pestaña pagaba de más cada vez.
   */
  clear() {
    this.count = 0
    this.mesh.count = 0
    this.killCount = 0
    this.dmgToPriority = 0
    this.dmgToRest = 0
  }

  /**
   * Simulación. NO escribe las matrices de dibujo: eso lo hace sync(), que se
   * llama al final del frame, después de que el combate resolvió las muertes.
   * Si se dibujara acá, un enemigo muerto por una bala de este mismo frame se
   * vería un frame de más.
   *
   * @param {number} delta
   * @param {THREE.Vector3} playerPos
   */
  update(delta, playerPos) {
    const n = this.count
    if (n === 0) return

    // La rejilla se construye UNA vez por frame y la comparten las tres pasadas
    // que necesitan vecinos: entre pasada y pasada nadie se mueve ni cerca de
    // una celda entera (2 u), así que reconstruirla no cambiaría nada y costaría
    // el triple.
    this.grid.build(this.posX, this.posZ, n)

    for (let pass = 0; pass < CONFIG.ENEMIES.SEPARATION_PASSES; pass++) {
      this._separate(n)
    }

    this._markBlocked(playerPos, n)
    this._chase(delta, playerPos, n)
    this._resolvePlayer(playerPos, n)
  }

  /** Vuelca el estado a la GPU. Último paso del frame. */
  sync(elapsed, playerPos) {
    this._writeMatrices(elapsed, playerPos, this.count)
  }

  /**
   * Marca a los enemigos que tienen a otro pegado por delante.
   *
   * Sin esto, los 400 empujan hacia el jugador con la misma fuerza y la
   * separación no da abasto: medido, quedaban 73 enemigos dentro de un radio
   * de 2 u, que físicamente da lugar para ~14. El resultado eran cubos
   * atravesándose en el centro de la pantalla.
   *
   * La regla es la de cualquier cola de gente: si hay alguien parado ENTRE el
   * jugador y yo, y me está tocando, no avanzo.
   *
   * El "entre" es literal y se mide con un cono hacia el jugador. La primera
   * versión usaba "está más cerca del jugador que yo", y era sutilmente
   * incorrecto: entre dos enemigos pegados al jugador uno siempre está un
   * milímetro más cerca, así que se bloqueaban ENTRE SÍ de costado y el anillo
   * interno dejaba de apretar. Efecto medido: 25 enemigos encima del jugador le
   * pegaban 2 veces en 12 segundos. Es decir, cuanto más te rodeaban, menos te
   * lastimaban — exactamente al revés de lo que tiene que pasar.
   */
  _markBlocked(playerPos, n) {
    const { posX, posZ, radius, _blocked, grid } = this
    const { items, start, dim } = grid
    const margin = CONFIG.ENEMIES.BLOCK_MARGIN
    const coneSq = CONFIG.ENEMIES.BLOCK_CONE * CONFIG.ENEMIES.BLOCK_CONE
    const px = playerPos.x
    const pz = playerPos.z

    _blocked.fill(0, 0, n)

    for (let i = 0; i < n; i++) {
      // Un pesado se abre paso: la horda no lo frena.
      if (this.heavy[i]) continue

      const xi = posX[i]
      const zi = posZ[i]
      const ri = radius[i]
      // Vector hacia el jugador, sin normalizar: el cono se resuelve comparando
      // cuadrados y no hace falta ninguna raíz.
      const toPX = px - xi
      const toPZ = pz - zi
      const toPSq = toPX * toPX + toPZ * toPZ
      const cx = grid.cellX(xi)
      const cz = grid.cellZ(zi)

      const x0 = cx > 0 ? cx - 1 : 0
      const x1 = cx < dim - 1 ? cx + 1 : dim - 1
      const z0 = cz > 0 ? cz - 1 : 0
      const z1 = cz < dim - 1 ? cz + 1 : dim - 1

      search: for (let gz = z0; gz <= z1; gz++) {
        const row = gz * dim
        for (let gx = x0; gx <= x1; gx++) {
          const cell = row + gx
          const from = start[cell]
          const to = start[cell + 1]

          for (let k = from; k < to; k++) {
            const j = items[k]
            if (j === i) continue

            const ddx = posX[j] - xi
            const ddz = posZ[j] - zi
            const dSq = ddx * ddx + ddz * ddz
            const minDist = (ri + radius[j]) * margin

            if (dSq >= minDist * minDist) continue // no me está tocando

            // ¿Está en mi camino? cos(ángulo) = dot / (|d| · |haciaJugador|).
            // Elevando al cuadrado se evitan las dos raíces.
            const dot = ddx * toPX + ddz * toPZ
            if (dot <= 0) continue // está detrás mío, no me tapa nada
            if (dot * dot < coneSq * dSq * toPSq) continue // fuera del cono

            _blocked[i] = 1
            break search
          }
        }
      }
    }
  }

  /** Persecución directa. Un sqrt por enemigo: es el mínimo para normalizar. */
  _chase(delta, playerPos, n) {
    const px = playerPos.x
    const pz = playerPos.z
    const blockedSpeed = CONFIG.ENEMIES.BLOCKED_SPEED

    for (let i = 0; i < n; i++) {
      const dx = px - this.posX[i]
      const dz = pz - this.posZ[i]
      const distSq = dx * dx + dz * dz

      // Ya está encima del jugador: normalizar acá sería dividir por ~0.
      if (distSq < 0.0001) continue

      // Bloqueado no significa congelado: sigue presionando muy despacio, para
      // que cuando el jugador se corra la horda arranque sin latencia.
      const scale = this._blocked[i] ? blockedSpeed : 1

      const inv = 1 / Math.sqrt(distSq)
      const step = this.speed[i] * scale * delta
      this.posX[i] += dx * inv * step
      this.posZ[i] += dz * inv * step
    }
  }

  /**
   * Separación entre enemigos, usando la rejilla.
   *
   * Criterio de salida de la Parte C en el GDD: "los enemigos no se apilan
   * visualmente unos sobre otros". Sin esto todos convergen al mismo punto y la
   * horda se ve como un único enemigo grande parpadeando.
   *
   * Cada par se evalúa UNA sola vez (j > i) y el empuje se acumula aparte:
   * aplicarlo al final evita que el orden de iteración sesgue el resultado.
   */
  _separate(n) {
    const { posX, posZ, radius, _pushX, _pushZ, grid } = this
    const { items, start, dim, cellCount } = grid
    const strength = CONFIG.ENEMIES.SEPARATION * 0.5

    _pushX.fill(0, 0, n)
    _pushZ.fill(0, 0, n)

    for (let i = 0; i < n; i++) {
      const xi = posX[i]
      const zi = posZ[i]
      const ri = radius[i]
      const cx = grid.cellX(xi)
      const cz = grid.cellZ(zi)

      const x0 = cx > 0 ? cx - 1 : 0
      const x1 = cx < dim - 1 ? cx + 1 : dim - 1
      const z0 = cz > 0 ? cz - 1 : 0
      const z1 = cz < dim - 1 ? cz + 1 : dim - 1

      for (let gz = z0; gz <= z1; gz++) {
        const row = gz * dim
        for (let gx = x0; gx <= x1; gx++) {
          const cell = row + gx
          if (cell < 0 || cell >= cellCount) continue

          const from = start[cell]
          const to = start[cell + 1]

          for (let k = from; k < to; k++) {
            const j = items[k]
            if (j <= i) continue // cada par, una sola vez

            const dx = posX[j] - xi
            const dz = posZ[j] - zi
            const minDist = ri + radius[j]
            const distSq = dx * dx + dz * dz

            if (distSq >= minDist * minDist) continue

            // Exactamente superpuestos: se desempata con un desvío fijo, si no
            // la división por cero los deja pegados para siempre.
            if (distSq < 0.000001) {
              _pushX[i] -= 0.01
              _pushX[j] += 0.01
              continue
            }

            const dist = Math.sqrt(distSq)
            const overlap = (minDist - dist) * strength
            const hi = this.heavy[i]
            const hj = this.heavy[j]

            // Un pesado (el boss) no cede terreno: si el otro es liviano, se
            // corre él solo, y el doble, para que el solapamiento igual se
            // resuelva en una pasada. Entre dos pesados nadie se mueve.
            const nx = (dx / dist) * overlap
            const nz = (dz / dist) * overlap

            if (!hi) {
              const k = hj ? 2 : 1
              _pushX[i] -= nx * k
              _pushZ[i] -= nz * k
            }
            if (!hj) {
              const k = hi ? 2 : 1
              _pushX[j] += nx * k
              _pushZ[j] += nz * k
            }
          }
        }
      }
    }

    const limit = CONFIG.WORLD.ARENA_SIZE / 2
    for (let i = 0; i < n; i++) {
      let x = posX[i] + _pushX[i]
      let z = posZ[i] + _pushZ[i]

      const edge = limit - radius[i]
      if (x > edge) x = edge
      else if (x < -edge) x = -edge
      if (z > edge) z = edge
      else if (z < -edge) z = -edge

      posX[i] = x
      posZ[i] = z
    }
  }

  /**
   * Los enemigos no atraviesan al jugador: se amontonan a su alrededor.
   *
   * Acá NO se aplica daño. El daño por contacto es Parte D (combate), y
   * mezclarlo con la resolución de colisión sería repartir la misma
   * responsabilidad en dos archivos distintos.
   */
  _resolvePlayer(playerPos, n) {
    const pr = CONFIG.PLAYER.RADIUS
    const px = playerPos.x
    const pz = playerPos.z

    for (let i = 0; i < n; i++) {
      const dx = this.posX[i] - px
      const dz = this.posZ[i] - pz
      const minDist = pr + this.radius[i]
      const distSq = dx * dx + dz * dz

      if (distSq >= minDist * minDist || distSq < 0.000001) continue

      const dist = Math.sqrt(distSq)
      const push = minDist - dist
      this.posX[i] += (dx / dist) * push
      this.posZ[i] += (dz / dist) * push
    }
  }

  /** Único punto donde se toca la GPU: una escritura de matrices por frame. */
  _writeMatrices(elapsed, playerPos, n) {
    const amp = CONFIG.ENEMIES.BOB_AMPLITUDE
    const bobSpeed = CONFIG.ENEMIES.BOB_SPEED

    for (let i = 0; i < n; i++) {
      const r = this.radius[i]
      const size = r * 2
      const bob = Math.sin(elapsed * bobSpeed + this.seed[i]) * amp

      _dummy.position.set(this.posX[i], r + amp + bob, this.posZ[i])
      _dummy.rotation.y = Math.atan2(playerPos.x - this.posX[i], playerPos.z - this.posZ[i])
      _dummy.scale.set(size, size, size)
      _dummy.updateMatrix()

      this.mesh.setMatrixAt(i, _dummy.matrix)
    }

    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
