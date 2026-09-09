import * as THREE from 'three'
import { SKILL_DEFS, SKILL_KIND, SKILL } from '../config/SkillDefs.js'
import { createWeaponMods, resetWeaponMods } from '../combat/WeaponMods.js'

const _dummy = new THREE.Object3D()

/** Máximo de sierras que puede dibujar el InstancedMesh. */
const MAX_SAWS = 8
/** Vueltas por segundo que gira cada sierra sobre su propio eje. */
const SAW_SPIN = 14
/** Cuánto dura el destello del rayo y el del tajo. */
const BOLT_FLASH = 0.22
const SWEEP_FLASH = 0.26

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
 * DOS HABILIDADES NO HACEN DAÑO Y NO ES UN OLVIDO. `Escarcha` frena y
 * `Señuelo` desvía, y las dos lo consiguen publicando GEOMETRÍA que consume la
 * persecución de la horda (ver EnemyManager.slowZones y .lure). Es el único
 * camino que le llega a un `heavy`: a esos no se los empuja, pero sí se los
 * puede frenar o convencer de perseguir otra cosa.
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

    /**
     * La zona de escarcha y el señuelo se reservan UNA vez y se mutan en el
     * lugar. Se publican por frame, así que crearlos cada vez sería basura a
     * 60 Hz para dos objetos de cuatro campos.
     */
    this._zonaLenta = { x: 0, z: 0, radius: 0, slow: 1 }
    this._cebo = { x: 0, z: 0, radius: 0 }
    /** Segundos que le quedan al señuelo puesto. 0 = no hay. */
    this.lureLeft = 0

    this._initMeshes(scene)
  }

  _initMeshes(scene) {
    /**
     * Sierras: discos de diez lados, apoyados de plano.
     *
     * De plano y no de canto porque la cámara es cenital: un disco vertical se
     * ve como una raya y no se entiende qué es. Diez lados en vez de treinta
     * para que el contorno se lea dentado, que es lo que dice "sierra" sin
     * modelar un solo diente.
     */
    const sawGeo = new THREE.CylinderGeometry(1, 1, 0.16, 10)
    const sawMat = new THREE.MeshBasicMaterial({ color: SKILL_DEFS[SKILL.SAWS].color })
    this.sawMesh = new THREE.InstancedMesh(sawGeo, sawMat, MAX_SAWS)
    this.sawMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.sawMesh.frustumCulled = false
    this.sawMesh.count = 0
    scene.add(this.sawMesh)

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

    // ── Escarcha: un disco tenue con el borde marcado ──────────────────────
    // El borde importa más que el relleno: lo que el jugador necesita saber es
    // exactamente dónde deja de frenar, y un degradado no dice eso.
    const frostColor = SKILL_DEFS[SKILL.FROST].color
    this.frostGroup = new THREE.Group()
    this.frostDisc = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshBasicMaterial({
        color: frostColor,
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    )
    this.frostDisc.rotation.x = -Math.PI / 2
    this.frostDisc.position.y = 0.04
    this.frostRing = new THREE.Mesh(
      new THREE.RingGeometry(0.93, 1, 48),
      new THREE.MeshBasicMaterial({
        color: frostColor,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    )
    this.frostRing.rotation.x = -Math.PI / 2
    this.frostRing.position.y = 0.05
    this.frostGroup.add(this.frostDisc, this.frostRing)
    this.frostGroup.visible = false
    scene.add(this.frostGroup)

    // ── Señuelo: el cebo y el círculo de a quiénes convence ────────────────
    const lureColor = SKILL_DEFS[SKILL.LURE].color
    this.lureGroup = new THREE.Group()
    this.lureCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42),
      new THREE.MeshBasicMaterial({ color: lureColor }),
    )
    this.lureCore.position.y = 0.7
    this.lureRing = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1, 44),
      new THREE.MeshBasicMaterial({
        color: lureColor,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    )
    this.lureRing.rotation.x = -Math.PI / 2
    this.lureRing.position.y = 0.05
    this.lureGroup.add(this.lureCore, this.lureRing)
    this.lureGroup.visible = false
    scene.add(this.lureGroup)

    // ── Guadaña: una porción de disco que apunta a donde caminás ───────────
    // La geometría se rehace solo cuando cambia el ángulo del cono, o sea al
    // subir de nivel: dibujar un cono más ancho del que hace daño sería mentir.
    this.sweepGroup = new THREE.Group()
    this.sweepMesh = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32, -0.9, 1.8),
      new THREE.MeshBasicMaterial({
        color: SKILL_DEFS[SKILL.SWEEP].color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    )
    this.sweepMesh.rotation.x = -Math.PI / 2
    this.sweepMesh.position.y = 0.06
    this.sweepGroup.add(this.sweepMesh)
    this.sweepGroup.visible = false
    scene.add(this.sweepGroup)
    this.sweepTimer = 0
    this._sweepArc = 0
  }

  reset() {
    this.owned.length = 0
    this.sawMesh.count = 0
    this.boltMesh.visible = false
    this.boltTimer = 0
    this.frostGroup.visible = false
    this.sweepGroup.visible = false
    this.sweepTimer = 0
    this._quitarSenuelo()
    this.enemies.slowZones.length = 0
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
    // Las zonas se republican ENTERAS cada frame. Si en vez de eso se fueran
    // agregando, una habilidad que dejaste de tener seguiría frenando a la
    // horda para siempre desde el último lugar donde estuviste.
    this.enemies.slowZones.length = 0

    let sawCount = 0
    let conEscarcha = false

    for (let s = 0; s < this.owned.length; s++) {
      const entry = this.owned[s]
      const def = SKILL_DEFS[entry.defIndex]
      const lvl = def.levels[entry.level - 1]

      if (def.kind === SKILL_KIND.ORBIT) {
        sawCount = this._updateSaws(delta, elapsed, lvl)
      } else if (def.kind === SKILL_KIND.FROST) {
        // Continua: no tiene reloj, está siempre puesta.
        this._frost(delta, elapsed, lvl)
        conEscarcha = true
      } else if (def.kind === SKILL_KIND.STRIKE) {
        entry.timer -= delta
        if (entry.timer <= 0) {
          entry.timer = lvl.interval
          this._strike(lvl)
        }
      } else if (def.kind === SKILL_KIND.LURE) {
        entry.timer -= delta
        if (entry.timer <= 0) {
          entry.timer = lvl.interval
          this._lure(lvl)
        }
      } else if (def.kind === SKILL_KIND.SWEEP) {
        entry.timer -= delta
        if (entry.timer <= 0) {
          entry.timer = lvl.interval
          this._sweep(lvl)
        }
      }
      // SKILL_KIND.WEAPON no hace nada por frame: ya está en this.mods.
    }

    this.sawMesh.count = sawCount
    if (sawCount > 0) this.sawMesh.instanceMatrix.needsUpdate = true
    this.frostGroup.visible = conEscarcha

    this._updateBolt(delta)
    this._updateLure(delta, elapsed)
    this._updateSweep(delta)
  }

  /**
   * Sierras girando. El daño es por segundo de contacto, no por golpe: con
   * cuerpos moviéndose rápido, contar golpes discretos depende del framerate.
   */
  _updateSaws(delta, elapsed, lvl) {
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

      // Además de orbitar, cada una gira sobre su eje: es lo que la hace leer
      // como una sierra y no como una moneda flotando.
      _dummy.position.set(ox, 0.55, oz)
      _dummy.rotation.set(0, elapsed * SAW_SPIN + a, 0)
      _dummy.scale.setScalar(lvl.size)
      _dummy.updateMatrix()
      this.sawMesh.setMatrixAt(o, _dummy.matrix)

      for (let i = 0; i < e.count; i++) {
        const dx = e.posX[i] - ox
        const dz = e.posZ[i] - oz
        const r = e.radius[i] + lvl.size
        if (dx * dx + dz * dz <= r * r) e.queueDamage(i, dmg)
      }
    }

    return lvl.count
  }

  /**
   * Escarcha: el campo que frena.
   *
   * No golpea ni empuja — publica una zona y desgasta. Lo que la hace valer es
   * que frenar es lo ÚNICO que le funciona a un `heavy`, y hoy hay siete: el
   * Cazador y las seis élites. Por eso su daño por segundo es bajo: lo que
   * comprás es el control.
   */
  _frost(delta, elapsed, lvl) {
    const e = this.enemies
    const px = this.player.position.x
    const pz = this.player.position.z

    this._zonaLenta.x = px
    this._zonaLenta.z = pz
    this._zonaLenta.radius = lvl.radius
    this._zonaLenta.slow = lvl.slow
    e.slowZones.push(this._zonaLenta)

    const rSq = lvl.radius * lvl.radius
    const dmg = lvl.dps * delta * this.progression.stats.damageMult

    for (let i = 0; i < e.count; i++) {
      const dx = e.posX[i] - px
      const dz = e.posZ[i] - pz
      if (dx * dx + dz * dz <= rSq) e.queueDamage(i, dmg)
    }

    this.frostGroup.position.set(px, 0, pz)
    // El alto NO se escala: si se escalara, el disco despegaría del piso.
    this.frostGroup.scale.set(lvl.radius, 1, lvl.radius)

    // Latido lento. Un disco quieto se lee como parte del piso.
    const latido = 0.85 + Math.sin(elapsed * 2.2) * 0.15
    this.frostRing.material.opacity = 0.5 * latido
    this.frostDisc.material.opacity = 0.13 * latido
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
    this.boltTimer = BOLT_FLASH
  }

  _updateBolt(delta) {
    if (!this.boltMesh.visible) return

    this.boltTimer -= delta
    if (this.boltTimer <= 0) {
      this.boltMesh.visible = false
      return
    }

    this.boltMesh.material.opacity = this.boltTimer / BOLT_FLASH
  }

  /**
   * Señuelo: el cebo queda DONDE ESTABAS PARADO.
   *
   * Es la única herramienta de escape del juego y no rompe la regla de que lo
   * único que controlás es dónde estás parado: no te mueve a vos, mueve a
   * ellos. Por eso entra donde no entra nada — a un `heavy` no se lo empuja,
   * pero sí persigue otra cosa.
   *
   * No hace daño a propósito. Si además matara sería una bomba con una ventaja
   * escondida, en vez de una decisión de posición.
   */
  _lure(lvl) {
    this._cebo.x = this.player.position.x
    this._cebo.z = this.player.position.z
    this._cebo.radius = lvl.radius

    this.enemies.lure = this._cebo
    this.lureLeft = lvl.duration

    this.lureGroup.position.set(this._cebo.x, 0, this._cebo.z)
    // El anillo marca EXACTAMENTE a quiénes convence: sin él, el jugador no
    // tiene forma de saber si le va a servir antes de tirarlo.
    this.lureGroup.scale.set(lvl.radius, 1, lvl.radius)
    this.lureGroup.visible = true
  }

  _updateLure(delta, elapsed) {
    if (this.lureLeft <= 0) return

    this.lureLeft -= delta
    if (this.lureLeft <= 0) {
      this._quitarSenuelo()
      return
    }

    // El cebo gira y late; el anillo se apaga a medida que se acaba, que es la
    // cuenta regresiva sin escribir un número.
    this.lureCore.rotation.y = elapsed * 3
    this.lureCore.rotation.x = elapsed * 2
    // El núcleo no se estira con el anillo: el grupo está escalado por el radio
    // del señuelo, así que se lo compensa.
    const inv = 1 / this.lureGroup.scale.x
    this.lureCore.scale.set(inv, 1, inv)
    this.lureRing.material.opacity = 0.2 + 0.35 * Math.min(1, this.lureLeft)
  }

  _quitarSenuelo() {
    this.lureLeft = 0
    this.enemies.lure = null
    this.lureGroup.visible = false
  }

  /**
   * Guadaña: un tajo en cono hacia donde CAMINA el cuerpo.
   *
   * Hacia donde camina y no hacia donde mira, y la diferencia importa desde que
   * el torso apunta al blanco del arma por su cuenta (ver Player): si usara el
   * torso sería un segundo cañón, y lo que tiene que premiar es meterse.
   */
  _sweep(lvl) {
    const e = this.enemies
    const px = this.player.position.x
    const pz = this.player.position.z

    // El muñeco mira hacia su -Z local, así que su frente en el mundo es esto.
    const fx = -Math.sin(this.player.facing)
    const fz = -Math.cos(this.player.facing)

    const rSq = lvl.radius * lvl.radius
    // arc es el cono COMPLETO en grados; acá hace falta el coseno del medio.
    const cono = Math.cos((lvl.arc * Math.PI) / 360)
    const dmg = lvl.damage * this.progression.stats.damageMult

    for (let i = 0; i < e.count; i++) {
      const dx = e.posX[i] - px
      const dz = e.posZ[i] - pz
      const dSq = dx * dx + dz * dz
      if (dSq > rSq) continue

      // Encima tuyo no hay dirección que medir: entra siempre.
      if (dSq < 0.0001) {
        e.queueDamage(i, dmg)
        continue
      }

      const inv = 1 / Math.sqrt(dSq)
      if (dx * inv * fx + dz * inv * fz < cono) continue
      e.queueDamage(i, dmg)
    }

    this._ajustarCono(lvl.arc)
    this.sweepGroup.position.set(px, 0, pz)
    this.sweepGroup.scale.set(lvl.radius, 1, lvl.radius)
    // El +90° sale de la geometría: la porción arranca centrada en su +X local,
    // y el frente del muñeco está a un cuarto de vuelta de ahí.
    this.sweepGroup.rotation.y = this.player.facing + Math.PI / 2
    this.sweepGroup.visible = true
    this.sweepTimer = SWEEP_FLASH
  }

  /** Rehace la porción de disco si cambió el ángulo. Pasa al subir de nivel. */
  _ajustarCono(arc) {
    if (this._sweepArc === arc) return
    this._sweepArc = arc

    const rad = (arc * Math.PI) / 180
    this.sweepMesh.geometry.dispose()
    this.sweepMesh.geometry = new THREE.CircleGeometry(1, 32, -rad / 2, rad)
  }

  _updateSweep(delta) {
    if (!this.sweepGroup.visible) return

    this.sweepTimer -= delta
    if (this.sweepTimer <= 0) {
      this.sweepGroup.visible = false
      return
    }

    const t = this.sweepTimer / SWEEP_FLASH
    this.sweepMesh.material.opacity = 0.55 * t
  }
}
