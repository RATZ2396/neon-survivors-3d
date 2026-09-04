import * as THREE from 'three'
import { SKILL_DEFS, SKILL_KIND, SKILL } from '../config/SkillDefs.js'

const _dummy = new THREE.Object3D()

/** Máximo de orbes que puede dibujar el InstancedMesh del escudo. */
const MAX_ORBS = 8

/**
 * SkillSystem — todas las habilidades, un solo resolutor.
 *
 * Igual que WeaponSystem: dos `kind` y ningún archivo por skill. El GDD v1
 * tenía OrbitalShield, ThunderStrike, WarCrySkill, TurretSkill y GrenadeSkill
 * como clases separadas repitiendo la misma búsqueda de enemigos en un radio.
 *
 * El daño se encola (queueDamage) igual que el de las armas: nadie mata
 * mientras se está recorriendo la horda.
 */
export class SkillSystem {
  constructor(player, enemies, progression, scene) {
    this.player = player
    this.enemies = enemies
    this.progression = progression

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
  }

  reset() {
    this.owned.length = 0
    this.orbMesh.count = 0
    this.boltMesh.visible = false
    this.boltTimer = 0
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
      return true
    }

    this.owned.push({ defIndex, level: 1, timer: 0 })
    return true
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
      }
    }

    this.orbMesh.count = orbCount
    if (orbCount > 0) this.orbMesh.instanceMatrix.needsUpdate = true
    this._updateBolt(delta)
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
}
