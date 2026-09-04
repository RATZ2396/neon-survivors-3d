import * as THREE from 'three'
import { CONFIG } from '../config/GameConfig.js'
import { SKILL_DEFS, SKILL_KIND, SKILL } from '../config/SkillDefs.js'
import { createWeaponMods, resetWeaponMods } from '../combat/WeaponMods.js'

const _dummy = new THREE.Object3D()

/** Máximo de orbes que puede dibujar el InstancedMesh del escudo. */
const MAX_ORBS = 8
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
   * @param {object} mods objeto compartido de WeaponMods; lo escribe este
   *                      sistema y lo leen el arma y los proyectiles
   */
  constructor(player, enemies, progression, scene, mods = createWeaponMods()) {
    this.player = player
    this.enemies = enemies
    this.progression = progression
    this.mods = mods

    /** [{ defIndex, level, timer }] — solo las que el jugador consiguió. */
    this.owned = []

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
  }

  reset() {
    this.owned.length = 0
    this.orbMesh.count = 0
    this.boltMesh.visible = false
    this.boltTimer = 0
    this.pulseMesh.visible = false
    this.pulseTimer = 0
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

    for (let s = 0; s < this.owned.length; s++) {
      const entry = this.owned[s]
      const def = SKILL_DEFS[entry.defIndex]
      const lvl = def.levels[entry.level - 1]

      if (def.kind === SKILL_KIND.ORBIT) {
        orbCount = this._updateOrbit(delta, elapsed, lvl)
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
}
