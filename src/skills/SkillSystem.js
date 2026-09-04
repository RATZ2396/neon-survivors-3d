import * as THREE from 'three'
import { CONFIG } from '../config/GameConfig.js'
import { SKILL_DEFS, SKILL_KIND, SKILL } from '../config/SkillDefs.js'
import { createWeaponMods, resetWeaponMods } from '../combat/WeaponMods.js'

const _dummy = new THREE.Object3D()

/** Máximo de orbes que puede dibujar el InstancedMesh del escudo. */
const MAX_ORBS = 8
/** Máximo de drones. El tope de la tabla es 3; sobra uno de margen. */
const MAX_DRONES = 4
/** A qué distancia orbitan los drones, y a qué velocidad. */
const DRONE_RADIUS = 2.9
const DRONE_SPIN = 0.18
/** Cuánto dura el destello de la onda expansiva. */
const PULSE_FLASH = 0.3

/**
 * SkillSystem — todas las habilidades, un solo resolutor.
 *
 * Igual que WeaponSystem: `kind`s y ningún archivo por skill. El GDD v1 tenía
 * OrbitalShield, ThunderStrike, WarCrySkill, TurretSkill y GrenadeSkill como
 * clases separadas repitiendo la misma búsqueda de enemigos en un radio.
 *
 * El daño se encola (queueDamage) igual que el de las armas: nadie mata
 * mientras se está recorriendo la horda.
 *
 * HAY UN KIND QUE NO HACE NADA ACÁ. Las habilidades de personaje
 * (`kind: WEAPON`) no dibujan ni golpean: publican modificadores en el objeto
 * de WeaponMods.js y los aplican WeaponSystem y ProjectileManager. Este
 * sistema solo las traduce, en `_recomputeMods()`.
 */
export class SkillSystem {
  /**
   * @param {ProjectileManager} projectiles por dónde disparan los drones
   * @param {object} mods objeto compartido de WeaponMods; lo escribe este
   *                      sistema y lo leen el arma y los proyectiles
   */
  constructor(player, enemies, progression, scene, projectiles = null, mods = createWeaponMods()) {
    this.player = player
    this.enemies = enemies
    this.progression = progression
    this.projectiles = projectiles
    this.mods = mods

    /** [{ defIndex, level, timer }] — solo las que el jugador consiguió. */
    this.owned = []

    /**
     * Un reloj por dron, no uno por habilidad: si compartieran el mismo, los
     * tres dispararían en el mismo frame y se vería como un arma sola.
     */
    this.droneTimers = new Float32Array(MAX_DRONES)

    /**
     * Bala del dron. Es un objeto privado con la forma que espera
     * `projectiles.fire()`, no una fila de ninguna tabla: se reescribe su
     * `damage` en cada disparo y por eso NO puede ser un dato compartido.
     */
    this._droneShot = {
      speed: 26,
      lifetime: 0.9,
      damage: 0,
      size: 0.14,
      pierce: 0,
      color: 0xa78bfa,
    }

    this._initMeshes(scene)
  }

  _initMeshes(scene) {
    // Orbes del escudo
    const orbGeo = new THREE.SphereGeometry(1, 10, 8)
    const orbMat = new THREE.MeshBasicMaterial({ color: SKILL_DEFS[SKILL.ORBIT].color })
    this.orbMesh = new THREE.InstancedMesh(orbGeo, orbMat, MAX_ORBS)
    this.orbMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.orbMesh.frustumCulled = false
    this.orbMesh.count = 0
    scene.add(this.orbMesh)

    // Columna del rayo: un solo mesh reutilizado, se muestra un instante
    const boltGeo = new THREE.CylinderGeometry(1, 1, 9, 14, 1, true)
    const boltMat = new THREE.MeshBasicMaterial({
      color: SKILL_DEFS[SKILL.STRIKE].color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.boltMesh = new THREE.Mesh(boltGeo, boltMat)
    this.boltMesh.visible = false
    scene.add(this.boltMesh)
    this.boltTimer = 0

    // Anillo de la onda: crece y se apaga en PULSE_FLASH segundos
    const pulseGeo = new THREE.RingGeometry(0.86, 1, 48)
    const pulseMat = new THREE.MeshBasicMaterial({
      color: SKILL_DEFS[SKILL.PULSE].color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.pulseMesh = new THREE.Mesh(pulseGeo, pulseMat)
    this.pulseMesh.rotation.x = -Math.PI / 2
    this.pulseMesh.position.y = 0.07
    this.pulseMesh.visible = false
    scene.add(this.pulseMesh)
    this.pulseTimer = 0
    this.pulseRadius = 0

    // Drones
    const droneGeo = new THREE.OctahedronGeometry(1, 0)
    const droneMat = new THREE.MeshBasicMaterial({ color: SKILL_DEFS[SKILL.DRONE].color })
    this.droneMesh = new THREE.InstancedMesh(droneGeo, droneMat, MAX_DRONES)
    this.droneMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.droneMesh.frustumCulled = false
    this.droneMesh.count = 0
    scene.add(this.droneMesh)
  }

  reset() {
    this.owned.length = 0
    this.orbMesh.count = 0
    this.droneMesh.count = 0
    this.boltMesh.visible = false
    this.boltTimer = 0
    this.pulseMesh.visible = false
    this.pulseTimer = 0
    this.droneTimers.fill(0)
    this._recomputeMods()
  }

  /** @returns {number} nivel actual de la skill (0 = no la tiene) */
  levelOf(defIndex) {
    for (let i = 0; i < this.owned.length; i++) {
      if (this.owned[i].defIndex === defIndex) return this.owned[i].level
    }
    return 0
  }

  /** La agrega si no la tenía, o le sube un nivel. */
  grant(key) {
    const defIndex = SKILL[key]
    if (defIndex === undefined) return false

    const def = SKILL_DEFS[defIndex]
    for (let i = 0; i < this.owned.length; i++) {
      if (this.owned[i].defIndex !== defIndex) continue
      if (this.owned[i].level >= def.levels.length) return false
      this.owned[i].level++
      this._recomputeMods()
      return true
    }

    this.owned.push({ defIndex, level: 1, timer: 0 })
    this._recomputeMods()
    return true
  }

  /**
   * Traduce las habilidades de personaje a modificadores del arma.
   *
   * Se llama al cambiar lo equipado, NO por frame: es una tabla chiquita, pero
   * recorrerla 60 veces por segundo para un resultado que solo cambia al subir
   * de nivel sería trabajo repetido por definición.
   *
   * Asignar (y no sumar) alcanza porque cada modificador sale de una sola
   * habilidad, y las de personaje están separadas por arma: nunca podés tener
   * dos que escriban lo mismo. La excepción es el laboratorio, que deja
   * equipar cualquier cosa con cualquier arma; ahí gana la última, y para una
   * herramienta de diseño eso es suficiente.
   */
  _recomputeMods() {
    resetWeaponMods(this.mods)

    for (let i = 0; i < this.owned.length; i++) {
      const def = SKILL_DEFS[this.owned[i].defIndex]
      if (def.kind !== SKILL_KIND.WEAPON) continue

      const m = def.levels[this.owned[i].level - 1].mods
      for (const k in m) this.mods[k] = m[k]
    }
  }

  update(delta, elapsed) {
    let orbCount = 0
    let droneCount = 0

    for (let s = 0; s < this.owned.length; s++) {
      const entry = this.owned[s]
      const def = SKILL_DEFS[entry.defIndex]
      const lvl = def.levels[entry.level - 1]

      if (def.kind === SKILL_KIND.ORBIT) {
        orbCount = this._updateOrbit(delta, elapsed, lvl)
      } else if (def.kind === SKILL_KIND.DRONE) {
        droneCount = this._updateDrones(delta, elapsed, lvl)
      } else if (def.kind === SKILL_KIND.STRIKE) {
        entry.timer -= delta
        if (entry.timer <= 0) {
          entry.timer = lvl.interval
          this._strike(lvl)
        }
      } else if (def.kind === SKILL_KIND.PULSE) {
        entry.timer -= delta
        if (entry.timer <= 0) {
          entry.timer = lvl.interval
          this._pulse(lvl)
        }
      }
      // SKILL_KIND.WEAPON no hace nada por frame: ya está en this.mods.
    }

    this.orbMesh.count = orbCount
    if (orbCount > 0) this.orbMesh.instanceMatrix.needsUpdate = true
    this.droneMesh.count = droneCount
    if (droneCount > 0) this.droneMesh.instanceMatrix.needsUpdate = true

    this._updateBolt(delta)
    this._updatePulse(delta)
  }

  /**
   * Orbes girando. El daño es por segundo de contacto, no por golpe: con orbes
   * moviéndose rápido, contar golpes discretos depende del framerate.
   */
  _updateOrbit(delta, elapsed, lvl) {
    const e = this.enemies
    const px = this.player.position.x
    const pz = this.player.position.z
    const dmg = lvl.dps * delta * this.progression.stats.damageMult
    const step = (Math.PI * 2) / lvl.count
    const base = elapsed * lvl.spin * Math.PI * 2

    for (let o = 0; o < lvl.count; o++) {
      const a = base + step * o
      const ox = px + Math.cos(a) * lvl.radius
      const oz = pz + Math.sin(a) * lvl.radius

      _dummy.position.set(ox, 0.9, oz)
      _dummy.scale.setScalar(lvl.size)
      _dummy.updateMatrix()
      this.orbMesh.setMatrixAt(o, _dummy.matrix)

      for (let i = 0; i < e.count; i++) {
        const dx = e.posX[i] - ox
        const dz = e.posZ[i] - oz
        const r = e.radius[i] + lvl.size
        if (dx * dx + dz * dz <= r * r) e.queueDamage(i, dmg)
      }
    }

    return lvl.count
  }

  _strike(lvl) {
    const e = this.enemies
    if (e.count === 0) return

    const px = this.player.position.x
    const pz = this.player.position.z

    // Cae sobre el más cercano: es el que te está por tocar.
    let best = -1
    let bestSq = Infinity
    for (let i = 0; i < e.count; i++) {
      const dx = e.posX[i] - px
      const dz = e.posZ[i] - pz
      const dSq = dx * dx + dz * dz
      if (dSq < bestSq) {
        bestSq = dSq
        best = i
      }
    }
    if (best === -1) return

    const tx = e.posX[best]
    const tz = e.posZ[best]
    const rSq = lvl.radius * lvl.radius
    const dmg = lvl.damage * this.progression.stats.damageMult

    for (let i = 0; i < e.count; i++) {
      const dx = e.posX[i] - tx
      const dz = e.posZ[i] - tz
      if (dx * dx + dz * dz <= rSq) e.queueDamage(i, dmg)
    }

    this.boltMesh.position.set(tx, 4.5, tz)
    this.boltMesh.scale.set(lvl.radius, 1, lvl.radius)
    this.boltMesh.visible = true
    this.boltTimer = 0.22
  }

  _updateBolt(delta) {
    if (!this.boltMesh.visible) return

    this.boltTimer -= delta
    if (this.boltTimer <= 0) {
      this.boltMesh.visible = false
      return
    }

    this.boltMesh.material.opacity = this.boltTimer / 0.22
  }

  /**
   * Onda expansiva: daña y EMPUJA.
   *
   * El empuje es lo que la distingue de cualquier otra área de daño, y por eso
   * se escribe directo sobre la posición en vez de encolarse: es lo mismo que
   * hace `_resolvePlayer()` cuando te sacás a alguien de encima. A los `heavy`
   * no los mueve — si el boss retrocediera con cada onda, la pelea se ganaría
   * sola quedándote quieto.
   */
  _pulse(lvl) {
    const e = this.enemies
    const px = this.player.position.x
    const pz = this.player.position.z
    const rSq = lvl.radius * lvl.radius
    const dmg = lvl.damage * this.progression.stats.damageMult
    const edge = CONFIG.WORLD.ARENA_SIZE / 2

    for (let i = 0; i < e.count; i++) {
      const dx = e.posX[i] - px
      const dz = e.posZ[i] - pz
      const dSq = dx * dx + dz * dz
      if (dSq > rSq) continue

      e.queueDamage(i, dmg)
      if (e.heavy[i]) continue

      // Justo encima no hay dirección que calcular: se empuja hacia un lado
      // fijo en vez de dividir por cero.
      const d = Math.sqrt(dSq)
      const nx = d > 0.0001 ? dx / d : 1
      const nz = d > 0.0001 ? dz / d : 0

      const lim = edge - e.radius[i]
      let x = e.posX[i] + nx * lvl.push
      let z = e.posZ[i] + nz * lvl.push
      if (x > lim) x = lim
      else if (x < -lim) x = -lim
      if (z > lim) z = lim
      else if (z < -lim) z = -lim
      e.posX[i] = x
      e.posZ[i] = z
    }

    this.pulseMesh.position.set(px, 0.07, pz)
    this.pulseMesh.visible = true
    this.pulseTimer = PULSE_FLASH
    this.pulseRadius = lvl.radius
  }

  /** El anillo crece hasta el radio real de la onda mientras se apaga. */
  _updatePulse(delta) {
    if (!this.pulseMesh.visible) return

    this.pulseTimer -= delta
    if (this.pulseTimer <= 0) {
      this.pulseMesh.visible = false
      return
    }

    const t = 1 - this.pulseTimer / PULSE_FLASH
    this.pulseMesh.scale.setScalar(this.pulseRadius * (0.25 + 0.75 * t))
    this.pulseMesh.material.opacity = 1 - t
  }

  /**
   * Drones: orbitan lejos y lento, y disparan por su cuenta.
   *
   * Las balas salen por el MISMO pool que las del arma, así que heredan lo que
   * tus habilidades le hicieron a las balas (rebote, empuje, penetración). Es
   * deliberado: son tus balas, y tratarlas distinto obligaría a mantener dos
   * caminos de colisión.
   */
  _updateDrones(delta, elapsed, lvl) {
    const n = lvl.count < MAX_DRONES ? lvl.count : MAX_DRONES
    const px = this.player.position.x
    const pz = this.player.position.z
    const step = (Math.PI * 2) / n
    const base = elapsed * DRONE_SPIN * Math.PI * 2

    for (let d = 0; d < n; d++) {
      const a = base + step * d
      const dx = px + Math.cos(a) * DRONE_RADIUS
      const dz = pz + Math.sin(a) * DRONE_RADIUS

      _dummy.position.set(dx, 1.5, dz)
      _dummy.rotation.y = a * 2
      _dummy.scale.setScalar(0.26)
      _dummy.updateMatrix()
      this.droneMesh.setMatrixAt(d, _dummy.matrix)

      this.droneTimers[d] -= delta
      // Si no había blanco el reloj queda en cero y reintenta al frame
      // siguiente: el dron no "pierde" su disparo por apuntar a la nada.
      if (this.droneTimers[d] <= 0 && this._droneShoot(dx, dz, lvl)) {
        this.droneTimers[d] = lvl.interval
      }
    }

    return n
  }

  /** @returns {boolean} si llegó a disparar */
  _droneShoot(dx, dz, lvl) {
    if (!this.projectiles) return false

    const e = this.enemies
    const rangeSq = lvl.range * lvl.range
    let best = -1
    let bestSq = rangeSq

    for (let i = 0; i < e.count; i++) {
      const ex = e.posX[i] - dx
      const ez = e.posZ[i] - dz
      const dSq = ex * ex + ez * ez
      if (dSq < bestSq) {
        bestSq = dSq
        best = i
      }
    }
    if (best === -1) return false

    const tx = e.posX[best] - dx
    const tz = e.posZ[best] - dz
    const dist = Math.sqrt(bestSq)
    if (dist < 0.0001) return false

    this._droneShot.damage = lvl.damage
    return this.projectiles.fire(
      dx,
      dz,
      tx / dist,
      tz / dist,
      this._droneShot,
      this.progression.stats.damageMult,
    )
  }
}
