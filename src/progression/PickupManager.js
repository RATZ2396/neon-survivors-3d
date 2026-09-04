import * as THREE from 'three'
import { CONFIG } from '../config/GameConfig.js'
import { PICKUP_DEFS, PICKUP_KIND, BONUS_KINDS } from '../config/PickupDefs.js'

const _dummy = new THREE.Object3D()

/**
 * PickupManager — todo lo que se junta del piso.
 *
 * ANTES ERA GemManager, y solo sabía de experiencia. Se generalizó cuando
 * aparecieron la moneda, el corazón y el imán: el archivo viejo terminaba
 * diciendo "es el tercer sistema con esta forma; si hiciera falta un cuarto,
 * ahí sí valdría abstraerlo". Habrían hecho falta un cuarto y un quinto. Así
 * que en vez de tres copias del mismo bucle de atracción hay una sola, con un
 * `kind` por objeto (ver PickupDefs).
 *
 * No es decoración: es lo que le da sentido al movimiento. Si la XP y la
 * moneda se cobraran solas al matar, pararse en un rincón sería óptimo.
 * Teniendo que ir a buscarlas, cada muerte te empuja hacia donde estaba el
 * peligro. Ese tironeo es el juego.
 *
 * LO QUE SE JUNTÓ ESTE FRAME no se devuelve: se acumula en campos que el
 * llamador lee (`gotXp`, `gotCoins`, `gotHeal`, `gotMagnets`). Devolver un
 * objeto sería basura nueva 60 veces por segundo para cuatro números, y es el
 * mismo patrón que ya usa EnemyManager con su buffer de muertos.
 */
export class PickupManager {
  constructor(scene) {
    const max = CONFIG.PROGRESSION.MAX_PICKUPS
    this.max = max
    this.count = 0

    this.posX = new Float32Array(max)
    this.posZ = new Float32Array(max)
    this.value = new Float32Array(max)
    this.kind = new Uint8Array(max)
    this.seed = new Float32Array(max) // desfase del giro, para que no roten iguales

    /** Botín recogido en el frame actual. Se pisa en cada update(). */
    this.gotXp = 0
    this.gotCoins = 0
    this.gotHeal = 0
    this.gotMagnets = 0

    /** Segundos que le quedan al imán agarrado. 0 = imán normal. */
    this.magnetTimer = 0
    /** Cuenta atrás para el próximo bonus del mapa. */
    this.bonusTimer = CONFIG.PROGRESSION.BONUS_FIRST_AT

    this._perKind = new Uint16Array(PICKUP_DEFS.length)
    this._initMeshes(scene)
  }

  _initMeshes(scene) {
    this.meshes = PICKUP_DEFS.map((def) => {
      // Los que sueltan los enemigos pueden llegar a ser cientos; los del mapa
      // están topeados por BONUS_MAX_ON_MAP y reservar `max` para ellos sería
      // pedir memoria para instancias que no pueden existir.
      const cupo = def.loot ? this.max : CONFIG.PROGRESSION.BONUS_MAX_ON_MAP
      const mesh = new THREE.InstancedMesh(geometriaDe(def), new THREE.MeshBasicMaterial({ color: def.color }), cupo)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.frustumCulled = false
      mesh.count = 0
      mesh.visible = false
      scene.add(mesh)
      return mesh
    })
  }

  /**
   * Suelta lo que dejó cada enemigo que murió este frame: una gema Y una
   * moneda. Que la moneda salga de la misma muerte que la gema es el punto —
   * el dinero deja de ser un número que aparece al final y pasa a ser algo que
   * está en el piso, donde estaba el peligro.
   *
   * @returns {{xp:number, coins:number}} lo que NO entró en el pool. Se acredita
   *   directo en vez de perderse: quedarse sin cupo es un problema de memoria,
   *   no una razón para castigar al jugador. Es el único objeto que este
   *   sistema crea, y pasa una vez por frame, no por objeto.
   */
  spawnFromDeaths(enemies) {
    let xp = 0
    let coins = 0

    for (let d = 0; d < enemies.deathCount; d++) {
      const x = enemies.deathX[d]
      const z = enemies.deathZ[d]
      if (!this._add(PICKUP_KIND.XP, x, z, enemies.deathXp[d])) xp += enemies.deathXp[d]
      if (!this._add(PICKUP_KIND.COIN, x, z, enemies.deathCoin[d])) coins += enemies.deathCoin[d]
    }

    return { xp, coins }
  }

  /** @returns {boolean} false si el pool está lleno */
  _add(kind, x, z, value) {
    if (this.count >= this.max) return false

    const i = this.count++
    this.posX[i] = x
    this.posZ[i] = z
    this.kind[i] = kind
    this.value[i] = value
    this.seed[i] = Math.random() * Math.PI * 2
    return true
  }

  _remove(i) {
    const last = --this.count
    if (i !== last) {
      this.posX[i] = this.posX[last]
      this.posZ[i] = this.posZ[last]
      this.value[i] = this.value[last]
      this.kind[i] = this.kind[last]
      this.seed[i] = this.seed[last]
    }
  }

  clear() {
    this.count = 0
    this.magnetTimer = 0
    this.bonusTimer = CONFIG.PROGRESSION.BONUS_FIRST_AT
    this.gotXp = 0
    this.gotCoins = 0
    this.gotHeal = 0
    this.gotMagnets = 0
    for (const m of this.meshes) {
      m.count = 0
      m.visible = false
    }
  }

  /**
   * Atrae, recoge y siembra los bonus del mapa.
   *
   * @param {number} magnetRadius radio de atracción normal, el del perfil
   */
  update(delta, playerPos, magnetRadius) {
    this.gotXp = 0
    this.gotCoins = 0
    this.gotHeal = 0
    this.gotMagnets = 0

    this._spawnBonus(delta, playerPos)

    const px = playerPos.x
    const pz = playerPos.z
    const pickupSq = CONFIG.PROGRESSION.PICKUP_RADIUS * CONFIG.PROGRESSION.PICKUP_RADIUS

    // Imán agarrado: alcance infinito, más rápido, y arrastra hasta lo que no
    // es botín. Es la única vez que el corazón viene solo hacia vos.
    const conIman = this.magnetTimer > 0
    if (conIman) this.magnetTimer -= delta

    const magnetSq = conIman ? Infinity : magnetRadius * magnetRadius
    const speed =
      CONFIG.PROGRESSION.MAGNET_SPEED * delta * (conIman ? CONFIG.PROGRESSION.MAGNET_PICKUP_BOOST : 1)

    for (let i = this.count - 1; i >= 0; i--) {
      const dx = px - this.posX[i]
      const dz = pz - this.posZ[i]
      const dSq = dx * dx + dz * dz

      if (dSq <= pickupSq) {
        this._collect(i)
        continue
      }

      // Sin imán, lo que aparece en el mapa no se mueve: hay que ir.
      if (!conIman && !PICKUP_DEFS[this.kind[i]].loot) continue
      if (dSq > magnetSq) continue // fuera del imán: se queda donde cayó

      const inv = speed / Math.sqrt(dSq)
      this.posX[i] += dx * inv
      this.posZ[i] += dz * inv
    }
  }

  _collect(i) {
    const kind = this.kind[i]
    const value = this.value[i]

    if (kind === PICKUP_KIND.XP) this.gotXp += value
    else if (kind === PICKUP_KIND.COIN) this.gotCoins += value
    else if (kind === PICKUP_KIND.HEART) this.gotHeal += value
    else if (kind === PICKUP_KIND.MAGNET) {
      this.gotMagnets++
      // Se fija, no se suma: agarrar dos seguidos no da el doble de tiempo.
      this.magnetTimer = CONFIG.PROGRESSION.MAGNET_PICKUP_TIME
    }

    this._remove(i)
  }

  /**
   * Siembra un corazón o un imán cada tanto, cerca del jugador pero no encima:
   * tiene que ser una decisión de ir a buscarlo, no un regalo.
   *
   * El tope de cuántos hay a la vez existe para que dejarlos juntando polvo no
   * se convierta en una reserva: si no vas, el mapa deja de ofrecerte.
   */
  _spawnBonus(delta, playerPos) {
    this.bonusTimer -= delta
    if (this.bonusTimer > 0) return
    this.bonusTimer = CONFIG.PROGRESSION.BONUS_EVERY

    let enElMapa = 0
    for (let i = 0; i < this.count; i++) {
      if (!PICKUP_DEFS[this.kind[i]].loot) enElMapa++
    }
    if (enElMapa >= CONFIG.PROGRESSION.BONUS_MAX_ON_MAP) return

    const { BONUS_MIN_DIST, BONUS_MAX_DIST, HEART_HEAL } = CONFIG.PROGRESSION
    const a = Math.random() * Math.PI * 2
    const d = BONUS_MIN_DIST + Math.random() * (BONUS_MAX_DIST - BONUS_MIN_DIST)
    const edge = CONFIG.WORLD.ARENA_SIZE / 2 - 2

    const x = Math.max(-edge, Math.min(edge, playerPos.x + Math.cos(a) * d))
    const z = Math.max(-edge, Math.min(edge, playerPos.z + Math.sin(a) * d))

    const kind = BONUS_KINDS[(Math.random() * BONUS_KINDS.length) | 0]
    this._add(kind, x, z, kind === PICKUP_KIND.HEART ? HEART_HEAL : 0)
  }

  /** Vuelca el estado a la GPU: una malla por tipo, cada una con su silueta. */
  sync(elapsed) {
    this._perKind.fill(0)

    for (let i = 0; i < this.count; i++) {
      const k = this.kind[i]
      const def = PICKUP_DEFS[k]
      const mesh = this.meshes[k]
      const slot = this._perKind[k]
      // El cupo de las mallas del mapa es chico a propósito; si alguna vez se
      // llenara, es preferible no dibujar uno que escribir fuera del buffer.
      if (slot >= mesh.instanceMatrix.count) continue
      this._perKind[k]++

      _dummy.position.set(this.posX[i], def.height, this.posZ[i])
      _dummy.rotation.set(def.tilt, elapsed * 2 + this.seed[i], 0)
      _dummy.updateMatrix()
      mesh.setMatrixAt(slot, _dummy.matrix)
    }

    for (let k = 0; k < this.meshes.length; k++) {
      const mesh = this.meshes[k]
      const n = this._perKind[k]
      mesh.count = n
      // Una malla vacía todavía se manda a dibujar; apagarla no.
      mesh.visible = n > 0
      if (n > 0) mesh.instanceMatrix.needsUpdate = true
    }
  }
}

/** La silueta de cada tipo. Es lo único que traduce `shape` a THREE. */
function geometriaDe(def) {
  const s = def.size
  if (def.shape === 'OCTA') return new THREE.OctahedronGeometry(s)
  if (def.shape === 'DISC') return new THREE.CylinderGeometry(s, s, s * 0.3, 12)
  if (def.shape === 'ORB') return new THREE.IcosahedronGeometry(s, 0)
  return new THREE.TorusGeometry(s * 0.68, s * 0.3, 8, 14)
}
