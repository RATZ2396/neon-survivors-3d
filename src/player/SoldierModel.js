import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { buildSoldierAtlas, CAMO, NYLON } from './SoldierAtlas.js'

/**
 * SoldierModel — soldado de infantería procedural para el jugador (Parte B).
 *
 * Contexto de la decisión (GDD_v2 §6.3): los `.glb` del proyecto anterior se
 * borraron y el jugador es hoy una cápsula. Esto es un modelo *generado por
 * código*, no un asset: no agrega archivos binarios, no necesita pipeline de
 * exportación y se tunea desde acá.
 *
 * Qué significa "realista" con esta técnica y qué no:
 *
 *   - SÍ: proporciones humanas medidas (soldado de 1.80 m con casco), equipo
 *     completo con la silueta correcta desde arriba —casco, placas, mochila,
 *     fusil—, camuflaje y nylon con textura de tela, y una marcha con ciclo de
 *     pierna, balanceo de cadera y contragiro de torso.
 *   - NO: deformación de piel (skinning). Cada hueso es un mesh rígido. A la
 *     altura de cámara del juego (y=11, FOV 55) no se ve un codo doblándose,
 *     se ve la silueta; el rig rígido cuesta 1 draw call por hueso y no
 *     necesita un esqueleto exportado. Si algún día hay cámara de cerca, esto
 *     se reemplaza por un GLTF con skinning sin tocar Player.js.
 *
 * Presupuesto: UN material (ver SoldierAtlas.js) y 15 meshes = 15 draw calls
 * para el jugador entero. La horda sigue costando 1 (InstancedMesh).
 *
 * Unidades: TODO acá está en metros de un humano real. El grupo se escala una
 * sola vez al final para que el modelo mida `options.height` unidades de juego,
 * así las proporciones no dependen de CONFIG.PLAYER.HEIGHT.
 */

/** Altura de referencia del modelo: suela → tope del casco. */
const REF_HEIGHT = 1.8

/** Medidas del esqueleto, en metros. Cambiar acá cambia el personaje entero. */
const RIG = {
  hipY: 0.95,
  shoulderY: 1.44,
  neckY: 1.5,
  shoulderX: 0.185,
  hipX: 0.095,
  thigh: 0.45,
  shin: 0.43,
  upperArm: 0.3,
  foreArm: 0.3,
}

/** Puntos de agarre del fusil, en espacio del arma. */
const GRIP_RIGHT = new THREE.Vector3(0.0, -0.085, 0.105)
const GRIP_LEFT = new THREE.Vector3(0.0, -0.05, -0.235)
const MUZZLE = new THREE.Vector3(0, 0.012, -0.56)

/** Pose de porte del arma en espacio del torso (low ready). */
const WEAPON_REST = {
  position: new THREE.Vector3(-0.03, 0.3, -0.22),
  rotation: new THREE.Euler(0.16, -0.34, 0.12),
}

const DOWN = new THREE.Vector3(0, -1, 0)
const TAU = Math.PI * 2
/** Metros de avance por ciclo completo de dos pasos. Define la cadencia. */
const STRIDE = 1.55

// ---------------------------------------------------------------------------
// Helpers de geometría
// ---------------------------------------------------------------------------

/** Contador para que cada pieza de tela caiga en un sub-rect distinto del atlas. */
let fabricIndex = 0

function fract(x) {
  return x - Math.floor(x)
}

/** Lleva los UV de la geometría a 0..1 (ExtrudeGeometry los genera en unidades). */
function normalizeUV(geo) {
  const uv = geo.attributes.uv
  let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i)
    if (u < minU) minU = u
    if (u > maxU) maxU = u
    if (v < minV) minV = v
    if (v > maxV) maxV = v
  }
  const du = maxU - minU || 1
  const dv = maxV - minV || 1
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) - minU) / du, (uv.getY(i) - minV) / dv)
  }
  return geo
}

/**
 * Mapea la pieza a un sub-rectángulo de una región de tela del atlas.
 * `scale` es qué fracción de la región ocupa: chico = patrón grande sobre la
 * pieza. La posición del sub-rect sale de un hash del índice, así dos piezas
 * vecinas no repiten exactamente la misma mancha.
 */
function fabric(geo, region, scale = 0.4) {
  normalizeUV(geo)
  const i = ++fabricIndex
  const rw = region.u1 - region.u0
  const rh = region.v1 - region.v0
  const w = rw * scale
  const h = rh * scale
  const u0 = region.u0 + fract(Math.sin(i * 12.9898) * 43758.5453) * (rw - w)
  const v0 = region.v0 + fract(Math.sin(i * 78.233) * 43758.5453) * (rh - h)
  const uv = geo.attributes.uv
  for (let k = 0; k < uv.count; k++) {
    uv.setXY(k, u0 + uv.getX(k) * w, v0 + uv.getY(k) * h)
  }
  return geo
}

/** Color plano: todos los UV al centro de la celda del atlas (un solo téxel). */
function flat(geo, swatch) {
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, swatch.u, swatch.v)
  return geo
}

function roundedRectShape(w, h, r) {
  const x = -w / 2
  const y = -h / 2
  const s = new THREE.Shape()
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

/**
 * Caja con cantos redondeados. Es la pieza base de todo el equipo: una caja
 * dura no engancha luz en los bordes y se lee como cubo de prototipo; con 15 mm
 * de bisel aparece el reflejo del canto y la misma caja se lee como nylon o
 * polímero.
 */
function box(w, h, d, r = 0.014) {
  const rr = Math.max(0.002, Math.min(r, w * 0.45, h * 0.45, d * 0.45))
  const sw = w - rr * 2
  const sh = h - rr * 2
  const sd = d - rr * 2
  const shape = roundedRectShape(sw, sh, Math.min(rr * 2, sw * 0.49, sh * 0.49))
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: sd,
    bevelEnabled: true,
    bevelThickness: rr,
    bevelSize: rr,
    bevelSegments: 1,
    curveSegments: 1,
    steps: 1,
  })
  geo.translate(0, 0, -sd / 2)
  return geo
}

/**
 * Miembro cónico con puntas redondeadas, de y=0 (arriba) a y=-len (abajo).
 * Un cilindro no sirve: el muslo humano baja de 10 cm de radio a 7.5 y esa
 * conicidad es la mitad de lo que hace que una pierna parezca una pierna.
 */
function limb(rTop, rBot, len, seg = 12) {
  const capT = rTop * 0.5
  const capB = rBot * 0.5
  const pts = [
    new THREE.Vector2(0.002, 0),
    new THREE.Vector2(rBot * 0.62, capB * 0.4),
    new THREE.Vector2(rBot, capB),
    new THREE.Vector2(rTop, len - capT),
    new THREE.Vector2(rTop * 0.62, len - capT * 0.4),
    new THREE.Vector2(0.002, len),
  ]
  const geo = new THREE.LatheGeometry(pts, seg)
  geo.translate(0, -len, 0)
  return geo
}

/** Anillo abierto (cinturón, cummerbund, visor): cilindro sin tapas. */
function ring(radius, height, seg = 16, thetaStart = 0, thetaLength = TAU) {
  return new THREE.CylinderGeometry(radius, radius, height, seg, 1, true, thetaStart, thetaLength)
}

function sphere(r, wSeg = 14, hSeg = 10) {
  return new THREE.SphereGeometry(r, wSeg, hSeg)
}

function cyl(rTop, rBot, len, seg = 10) {
  return new THREE.CylinderGeometry(rTop, rBot, len, seg, 1, false)
}

/** Acumula piezas y las funde en un solo mesh (1 draw call por hueso). */
class Part {
  constructor(name) {
    this.name = name
    this.geos = []
  }

  add(geo) {
    // mergeGeometries exige el mismo set de atributos y todas indexadas o
    // ninguna. ExtrudeGeometry viene sin índice y el resto con índice, así que
    // se normaliza todo a no-indexado.
    const g = geo.index ? geo.toNonIndexed() : geo
    for (const key of Object.keys(g.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv') g.deleteAttribute(key)
    }
    g.clearGroups()
    if (g !== geo) geo.dispose()
    this.geos.push(g)
    return this
  }

  mesh(material) {
    const merged = mergeGeometries(this.geos, false)
    for (const g of this.geos) g.dispose()
    this.geos.length = 0
    const m = new THREE.Mesh(merged, material)
    m.name = this.name
    return m
  }
}

/** Mancha de contacto bajo los pies: el renderer del juego no tiene sombras. */
function contactShadowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62)
  g.addColorStop(0, 'rgba(0,0,0,0.55)')
  g.addColorStop(0.45, 'rgba(0,0,0,0.28)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// ---------------------------------------------------------------------------

export class SoldierModel {
  /**
   * @param {object} [options]
   * @param {number} [options.height] altura final en unidades de juego
   * @param {boolean} [options.contactShadow] mancha de contacto bajo los pies
   */
  constructor(options = {}) {
    const height = options.height ?? REF_HEIGHT
    this.atlas = options.atlas ?? buildSoldierAtlas()

    this.material = new THREE.MeshStandardMaterial({
      map: this.atlas.map,
      roughnessMap: this.atlas.roughnessMap,
      metalnessMap: this.atlas.metalnessMap,
      roughness: 1,
      metalness: 1,
      envMapIntensity: 0.8,
    })

    this.root = new THREE.Group()
    this.root.name = 'soldier'

    /** Nodo que se mueve verticalmente con la marcha (bob). */
    this.body = new THREE.Group()
    this.root.add(this.body)

    fabricIndex = 0
    this._buildSkeleton()
    this._buildGeometry()

    if (options.contactShadow !== false) this._buildContactShadow()

    this.root.scale.setScalar(height / REF_HEIGHT)

    // Estado de animación.
    this._time = 0
    this._cycle = 0
    this._gait = 0
    this._recoil = 0
    this._hit = false
    /**
     * Giro del torso hacia el blanco, sobre las caderas. Lo escribe quien
     * lleva el modelo (Player, Companion); el modelo solo lo aplica.
     */
    this._aimTwist = 0

    // Scratch: el update no asigna nada.
    this._s = {
      dir: new THREE.Vector3(),
      side: new THREE.Vector3(),
      upper: new THREE.Vector3(),
      elbow: new THREE.Vector3(),
      target: new THREE.Vector3(),
      hand: new THREE.Vector3(),
      qa: new THREE.Quaternion(),
      qb: new THREE.Quaternion(),
    }

    this.update(0, 0, false)
  }

  /** Grupo listo para agregar al mesh del Player. */
  get object3D() {
    return this.root
  }

  /** Triángulos del modelo — lo reporta el preview. */
  get triangleCount() {
    let n = 0
    this.root.traverse((o) => {
      if (o.isMesh && o.geometry.attributes.position) n += o.geometry.attributes.position.count / 3
    })
    return n
  }

  // -------------------------------------------------------------------------
  // Rig
  // -------------------------------------------------------------------------

  _buildSkeleton() {
    const node = (name, x, y, z, parent) => {
      const g = new THREE.Group()
      g.name = name
      g.position.set(x, y, z)
      parent.add(g)
      return g
    }

    this.hips = node('hips', 0, RIG.hipY, 0, this.body)
    this.torso = node('torso', 0, 0, 0, this.hips)
    this.head = node('head', 0, RIG.neckY - RIG.hipY, 0, this.torso)

    this.weapon = node('weapon', 0, 0, 0, this.torso)
    this.weapon.position.copy(WEAPON_REST.position)
    this.weapon.rotation.copy(WEAPON_REST.rotation)

    const shoulderY = RIG.shoulderY - RIG.hipY
    this.armL = node('armL', RIG.shoulderX, shoulderY, 0, this.torso)
    this.foreL = node('foreL', 0, -RIG.upperArm, 0, this.armL)
    this.armR = node('armR', -RIG.shoulderX, shoulderY, 0, this.torso)
    this.foreR = node('foreR', 0, -RIG.upperArm, 0, this.armR)

    this.thighL = node('thighL', RIG.hipX, 0, 0, this.hips)
    this.kneeL = node('kneeL', 0, -RIG.thigh, 0, this.thighL)
    this.ankleL = node('ankleL', 0, -RIG.shin, 0, this.kneeL)
    this.thighR = node('thighR', -RIG.hipX, 0, 0, this.hips)
    this.kneeR = node('kneeR', 0, -RIG.thigh, 0, this.thighR)
    this.ankleR = node('ankleR', 0, -RIG.shin, 0, this.kneeR)

    // Brazos: la mano se pega al fusil por IK de dos huesos, no por pose fija.
    // Así, cuando el arma se mueve (retroceso, balanceo), las manos la siguen.
    this._arms = [
      {
        upper: this.armR,
        fore: this.foreR,
        grip: GRIP_RIGHT,
        // Codo del brazo de disparo: atrás, abajo y hacia afuera.
        pole: new THREE.Vector3(-0.55, -0.62, 0.56).normalize(),
        target: new THREE.Vector3(),
      },
      {
        upper: this.armL,
        fore: this.foreL,
        grip: GRIP_LEFT,
        // Codo del brazo de apoyo: casi debajo del arma.
        pole: new THREE.Vector3(0.42, -0.86, 0.28).normalize(),
        target: new THREE.Vector3(),
      },
    ]
  }

  // -------------------------------------------------------------------------
  // Geometría
  // -------------------------------------------------------------------------

  _buildGeometry() {
    const S = this.atlas.swatch
    const mount = (part, parent) => {
      const m = part.mesh(this.material)
      parent.add(m)
      return m
    }

    mount(this._buildHips(S), this.hips)
    mount(this._buildTorso(S), this.torso)
    mount(this._buildHead(S), this.head)
    mount(this._buildRifle(S), this.weapon)

    for (const side of [1, -1]) {
      const arm = side > 0 ? this.armL : this.armR
      const fore = side > 0 ? this.foreL : this.foreR
      const thigh = side > 0 ? this.thighL : this.thighR
      const knee = side > 0 ? this.kneeL : this.kneeR
      const ankle = side > 0 ? this.ankleL : this.ankleR
      mount(this._buildUpperArm(S, side), arm)
      mount(this._buildForeArm(S, side), fore)
      mount(this._buildThigh(S, side), thigh)
      mount(this._buildShin(S, side), knee)
      mount(this._buildFoot(S, side), ankle)
    }
  }

  _buildHips(S) {
    const p = new Part('hips')

    const pelvis = limb(0.155, 0.135, 0.22, 14)
    pelvis.scale(1, 1, 0.74)
    pelvis.translate(0, 0.09, 0)
    p.add(fabric(pelvis, CAMO, 0.3))

    const belt = ring(0.16, 0.07, 18)
    belt.scale(1, 1, 0.76)
    belt.translate(0, 0.055, 0)
    p.add(fabric(belt, NYLON, 0.28))

    const buckle = box(0.055, 0.05, 0.03, 0.01)
    buckle.translate(0, 0.055, -0.125)
    p.add(flat(buckle, S.gunmetal))

    // Dump pouch a la izquierda: rompe la simetría, que es lo que hace que una
    // silueta militar no parezca un maniquí.
    const dump = box(0.09, 0.12, 0.075, 0.02)
    dump.rotateY(-0.25)
    dump.translate(0.16, -0.02, 0.045)
    p.add(fabric(dump, NYLON, 0.22))

    const utility = box(0.07, 0.09, 0.05, 0.015)
    utility.rotateY(0.3)
    utility.translate(-0.15, -0.01, 0.05)
    p.add(fabric(utility, NYLON, 0.2))

    return p
  }

  _buildTorso(S) {
    const p = new Part('torso')

    // Tronco: perfil de revolución aplastado en Z. La sección elíptica es lo que
    // distingue un torso humano de un tubo.
    const chest = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.002, 0.0),
        new THREE.Vector2(0.1, 0.008),
        new THREE.Vector2(0.15, 0.05),
        new THREE.Vector2(0.152, 0.16),
        new THREE.Vector2(0.175, 0.3),
        new THREE.Vector2(0.185, 0.4),
        new THREE.Vector2(0.16, 0.48),
        new THREE.Vector2(0.105, 0.52),
        new THREE.Vector2(0.002, 0.535),
      ],
      16,
    )
    chest.scale(1, 1, 0.7)
    p.add(fabric(chest, CAMO, 0.5))

    for (const s of [1, -1]) {
      const delt = sphere(0.085)
      delt.scale(1, 0.95, 1)
      delt.translate(s * RIG.shoulderX, 0.47, 0)
      p.add(fabric(delt, CAMO, 0.22))
    }

    // Chaleco portaplacas: placa frontal, placa trasera y cummerbund.
    const front = box(0.28, 0.33, 0.075, 0.025)
    front.rotateX(-0.06)
    front.translate(0, 0.33, -0.115)
    p.add(fabric(front, NYLON, 0.45))

    const back = box(0.3, 0.35, 0.07, 0.025)
    back.rotateX(0.04)
    back.translate(0, 0.33, 0.115)
    p.add(fabric(back, NYLON, 0.45))

    const cummer = ring(0.178, 0.15, 18)
    cummer.scale(1, 1, 0.74)
    cummer.translate(0, 0.2, 0)
    p.add(fabric(cummer, NYLON, 0.3))

    for (const s of [1, -1]) {
      const strap = box(0.085, 0.055, 0.3, 0.02)
      strap.translate(s * 0.105, 0.49, 0)
      p.add(fabric(strap, NYLON, 0.2))
    }

    // Cargadores al frente: tres bolsillos con solapa.
    for (let i = -1; i <= 1; i++) {
      const pouch = box(0.078, 0.14, 0.06, 0.018)
      pouch.translate(i * 0.085, 0.27, -0.178)
      p.add(fabric(pouch, NYLON, 0.18))
      const flap = box(0.08, 0.045, 0.062, 0.015)
      flap.translate(i * 0.085, 0.345, -0.18)
      p.add(fabric(flap, NYLON, 0.14))
    }

    const admin = box(0.13, 0.075, 0.045, 0.015)
    admin.translate(0, 0.4, -0.168)
    p.add(fabric(admin, NYLON, 0.16))

    // Radio con antena: detalle alto que se ve desde la cámara cenital.
    const radio = box(0.07, 0.115, 0.05, 0.015)
    radio.translate(0.15, 0.36, -0.075)
    p.add(fabric(radio, NYLON, 0.16))
    const antenna = cyl(0.004, 0.006, 0.26, 6)
    antenna.rotateX(-0.18)
    antenna.rotateZ(-0.12)
    antenna.translate(0.16, 0.54, -0.05)
    p.add(flat(antenna, S.polymer))

    // Mochila de asalto.
    const pack = box(0.28, 0.34, 0.17, 0.03)
    pack.translate(0, 0.34, 0.215)
    p.add(fabric(pack, NYLON, 0.5))
    const packTop = box(0.24, 0.1, 0.14, 0.03)
    packTop.translate(0, 0.52, 0.21)
    p.add(fabric(packTop, NYLON, 0.2))
    for (const s of [1, -1]) {
      const comp = box(0.025, 0.3, 0.19, 0.008)
      comp.translate(s * 0.1, 0.34, 0.216)
      p.add(flat(comp, S.webbing))
    }
    // Tubo de hidratación asomando por el hombro derecho.
    const tube = cyl(0.008, 0.008, 0.22, 6)
    tube.rotateX(0.5)
    tube.rotateZ(0.35)
    tube.translate(-0.13, 0.49, 0.09)
    p.add(flat(tube, S.rubber))

    const collar = ring(0.088, 0.07, 12)
    collar.translate(0, 0.525, 0)
    p.add(fabric(collar, CAMO, 0.12))

    const neck = cyl(0.055, 0.06, 0.12, 10)
    neck.translate(0, 0.53, 0)
    p.add(flat(neck, S.skinDark))

    return p
  }

  _buildHead(S) {
    const p = new Part('head')

    const skull = sphere(0.098, 16, 12)
    skull.scale(0.92, 1.1, 1.0)
    skull.translate(0, 0.1, 0)
    p.add(flat(skull, S.skin))

    const jaw = box(0.112, 0.075, 0.125, 0.03)
    jaw.translate(0, 0.045, -0.012)
    p.add(flat(jaw, S.skin))

    // Braga cubriendo boca y mentón: es lo que usa medio ejército del mundo y,
    // de paso, evita fingir una cara que a esta escala no se puede sostener.
    const gaiter = ring(0.088, 0.1, 14, Math.PI - 1.15, 2.3)
    gaiter.scale(1.06, 1, 1.06)
    gaiter.translate(0, 0.04, 0)
    p.add(fabric(gaiter, NYLON, 0.12))

    // Anteojos balísticos: banda curva sobre los ojos.
    const visor = ring(0.1, 0.042, 16, Math.PI - 0.72, 1.44)
    visor.scale(1, 1, 1.02)
    visor.translate(0, 0.115, 0)
    p.add(flat(visor, S.optic))

    // Casco: domo con funda de tela + canto grueso.
    const helmet = new THREE.SphereGeometry(0.128, 18, 12, 0, TAU, 0, Math.PI * 0.56)
    helmet.scale(1.0, 1.04, 1.08)
    helmet.translate(0, 0.112, 0.004)
    p.add(fabric(helmet, NYLON, 0.42))

    const rim = new THREE.TorusGeometry(0.126, 0.013, 6, 20)
    rim.rotateX(Math.PI / 2)
    rim.scale(1.0, 1, 1.08)
    rim.translate(0, 0.088, 0.004)
    p.add(fabric(rim, NYLON, 0.1))

    // Soporte de visión nocturna al frente: la pieza que hace leer "moderno".
    const shroud = box(0.07, 0.055, 0.03, 0.012)
    shroud.rotateX(0.35)
    shroud.translate(0, 0.195, -0.115)
    p.add(flat(shroud, S.polymer))
    const nvgArm = box(0.03, 0.05, 0.03, 0.01)
    nvgArm.translate(0, 0.235, -0.125)
    p.add(flat(nvgArm, S.gunmetal))

    for (const s of [1, -1]) {
      const rail = box(0.014, 0.028, 0.15, 0.006)
      rail.rotateY(s * 0.1)
      rail.translate(s * 0.128, 0.13, 0.01)
      p.add(flat(rail, S.polymer))

      // Auriculares de protección auditiva.
      const cup = sphere(0.05, 12, 8)
      cup.scale(0.5, 1, 0.85)
      cup.translate(s * 0.115, 0.075, 0.005)
      p.add(flat(cup, S.rubber))

      const strap = box(0.014, 0.11, 0.014, 0.005)
      strap.rotateX(-0.12)
      strap.translate(s * 0.098, 0.05, -0.025)
      p.add(flat(strap, S.webbing))
    }

    // Micrófono de brazo.
    const mic = cyl(0.005, 0.005, 0.11, 6)
    mic.rotateZ(Math.PI / 2)
    mic.rotateY(-0.6)
    mic.translate(0.075, 0.055, -0.055)
    p.add(flat(mic, S.polymer))

    return p
  }

  _buildUpperArm(S, side) {
    const p = new Part(side > 0 ? 'upperArmL' : 'upperArmR')

    const sleeve = limb(0.058, 0.048, RIG.upperArm, 12)
    p.add(fabric(sleeve, CAMO, 0.2))

    // Parche de hombro: una nota de color que ayuda a leer la orientación.
    const patch = box(0.05, 0.04, 0.012, 0.004)
    patch.rotateY(side * Math.PI * 0.5)
    patch.translate(side * 0.055, -0.06, 0)
    p.add(flat(patch, side > 0 ? S.webbing : S.polymer))

    return p
  }

  _buildForeArm(S, side) {
    const p = new Part(side > 0 ? 'foreArmL' : 'foreArmR')

    const sleeve = limb(0.048, 0.036, 0.26, 12)
    p.add(fabric(sleeve, CAMO, 0.18))

    const elbowPad = box(0.075, 0.08, 0.04, 0.015)
    elbowPad.translate(0, -0.02, 0.045)
    p.add(fabric(elbowPad, NYLON, 0.12))

    const cuff = ring(0.04, 0.035, 10)
    cuff.translate(0, -0.25, 0)
    p.add(fabric(cuff, CAMO, 0.08))

    // Mano enguantada en el extremo del hueso: acá apunta la IK.
    const hand = box(0.055, 0.1, 0.08, 0.022)
    hand.translate(0, -RIG.foreArm + 0.01, 0)
    p.add(flat(hand, S.glove))

    const thumb = box(0.028, 0.055, 0.03, 0.012)
    thumb.rotateZ(side * 0.5)
    thumb.translate(side * -0.035, -RIG.foreArm + 0.035, -0.02)
    p.add(flat(thumb, S.glove))

    return p
  }

  _buildThigh(S, side) {
    const p = new Part(side > 0 ? 'thighL' : 'thighR')

    const leg = limb(0.1, 0.078, RIG.thigh, 12)
    p.add(fabric(leg, CAMO, 0.3))

    // Bolsillo cargo lateral.
    const pocket = box(0.045, 0.13, 0.11, 0.02)
    pocket.translate(side * 0.085, -0.2, 0.01)
    p.add(fabric(pocket, CAMO, 0.14))

    if (side < 0) {
      // Pistolera en la pierna derecha.
      const holster = box(0.055, 0.17, 0.11, 0.02)
      holster.rotateY(-0.1)
      holster.translate(-0.095, -0.29, 0.01)
      p.add(flat(holster, S.polymer))
      const pistol = box(0.032, 0.075, 0.045, 0.01)
      pistol.rotateX(0.25)
      pistol.translate(-0.095, -0.2, 0.035)
      p.add(flat(pistol, S.gunmetal))
      const legStrap = box(0.09, 0.025, 0.13, 0.006)
      legStrap.translate(-0.075, -0.36, 0.005)
      p.add(flat(legStrap, S.webbing))
    }

    return p
  }

  _buildShin(S, side) {
    const p = new Part(side > 0 ? 'shinL' : 'shinR')

    const leg = limb(0.078, 0.052, RIG.shin, 12)
    p.add(fabric(leg, CAMO, 0.26))

    const kneePad = box(0.105, 0.12, 0.06, 0.025)
    kneePad.rotateX(0.12)
    kneePad.translate(0, -0.035, -0.05)
    p.add(fabric(kneePad, NYLON, 0.16))

    // Pantalón embutido en la bota: el pliegue es un anillo un poco más ancho.
    const blouse = limb(0.062, 0.075, 0.09, 12)
    blouse.translate(0, -RIG.shin + 0.11, 0)
    p.add(fabric(blouse, CAMO, 0.1))

    return p
  }

  _buildFoot(S, side) {
    const p = new Part(side > 0 ? 'footL' : 'footR')

    // El nodo de tobillo está a 0.07 m del suelo (RIG.hipY - thigh - shin).
    const upper = box(0.1, 0.15, 0.115, 0.03)
    upper.translate(0, 0.005, 0.005)
    p.add(flat(upper, S.boot))

    const laces = box(0.055, 0.11, 0.02, 0.006)
    laces.translate(0, 0.02, -0.055)
    p.add(flat(laces, S.webbing))

    const foot = box(0.1, 0.075, 0.26, 0.025)
    foot.translate(0, -0.035, -0.07)
    p.add(flat(foot, S.boot))

    const sole = box(0.105, 0.03, 0.27, 0.01)
    sole.translate(0, -0.062, -0.07)
    p.add(flat(sole, S.sole))

    return p
  }

  _buildRifle(S) {
    const p = new Part('rifle')

    // Carabina de asalto, cañón hacia -Z. Medidas de un arma real de ~84 cm.
    const receiver = box(0.05, 0.075, 0.29, 0.012)
    receiver.translate(0, 0, 0.02)
    p.add(flat(receiver, S.gunmetal))

    const rail = box(0.028, 0.014, 0.36, 0.004)
    rail.translate(0, 0.045, -0.06)
    p.add(flat(rail, S.gunmetal))

    const handguard = cyl(0.032, 0.032, 0.26, 8)
    handguard.rotateX(Math.PI / 2)
    handguard.translate(0, -0.004, -0.26)
    p.add(flat(handguard, S.polymer))

    const barrel = cyl(0.0095, 0.011, 0.2, 8)
    barrel.rotateX(Math.PI / 2)
    barrel.translate(0, 0.012, -0.45)
    p.add(flat(barrel, S.gunmetal))

    const muzzle = cyl(0.015, 0.014, 0.06, 8)
    muzzle.rotateX(Math.PI / 2)
    muzzle.translate(0, 0.012, -0.55)
    p.add(flat(muzzle, S.steel))

    const grip = box(0.035, 0.11, 0.05, 0.012)
    grip.rotateX(0.32)
    grip.translate(0, -0.085, 0.115)
    p.add(flat(grip, S.polymer))

    const trigger = box(0.02, 0.035, 0.035, 0.008)
    trigger.translate(0, -0.045, 0.06)
    p.add(flat(trigger, S.gunmetal))

    // Cargador curvo: dos tramos con ángulos distintos aproximan la curva.
    const magTop = box(0.03, 0.1, 0.06, 0.008)
    magTop.rotateX(-0.08)
    magTop.translate(0, -0.09, -0.015)
    p.add(flat(magTop, S.polymer))
    const magBottom = box(0.03, 0.11, 0.058, 0.008)
    magBottom.rotateX(-0.28)
    magBottom.translate(0, -0.185, 0.008)
    p.add(flat(magBottom, S.polymer))

    const tube = cyl(0.019, 0.019, 0.17, 8)
    tube.rotateX(Math.PI / 2)
    tube.translate(0, 0.012, 0.24)
    p.add(flat(tube, S.gunmetal))

    const stock = box(0.05, 0.075, 0.16, 0.018)
    stock.translate(0, -0.005, 0.27)
    p.add(flat(stock, S.polymer))

    const butt = box(0.055, 0.1, 0.03, 0.012)
    butt.translate(0, -0.012, 0.345)
    p.add(flat(butt, S.rubber))

    // Óptica de punto rojo sobre el riel.
    const opticBody = box(0.04, 0.05, 0.11, 0.012)
    opticBody.translate(0, 0.078, -0.05)
    p.add(flat(opticBody, S.gunmetal))
    const lens = cyl(0.019, 0.019, 0.012, 10)
    lens.rotateX(Math.PI / 2)
    lens.translate(0, 0.082, -0.107)
    p.add(flat(lens, S.optic))

    // Empuñadura vertical y linterna en el guardamanos.
    const foregrip = box(0.03, 0.07, 0.032, 0.01)
    foregrip.rotateX(-0.12)
    foregrip.translate(0, -0.055, -0.3)
    p.add(flat(foregrip, S.polymer))
    const light = cyl(0.015, 0.015, 0.09, 8)
    light.rotateX(Math.PI / 2)
    light.translate(0.042, -0.005, -0.33)
    p.add(flat(light, S.gunmetal))

    return p
  }

  _buildContactShadow() {
    this._shadowTexture = contactShadowTexture()
    this._shadowMaterial = new THREE.MeshBasicMaterial({
      map: this._shadowTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
    })
    const geo = new THREE.PlaneGeometry(1.5, 1.5)
    geo.rotateX(-Math.PI / 2)
    const mesh = new THREE.Mesh(geo, this._shadowMaterial)
    mesh.name = 'contactShadow'
    mesh.position.y = 0.02
    mesh.renderOrder = -1
    this.root.add(mesh)
    this._shadow = mesh
  }

  // -------------------------------------------------------------------------
  // Animación
  // -------------------------------------------------------------------------

  /**
   * @param {number} delta segundos
   * @param {number} speed velocidad actual en unidades/segundo
   * @param {boolean} moving si hay input de movimiento
   */
  update(delta, speed = 0, moving = false) {
    this._time += delta

    // La cadencia sale de la velocidad: zancada de largo fijo, sin patinaje.
    const run = THREE.MathUtils.clamp(speed / 6, 0, 1)
    if (moving) this._cycle += (speed / STRIDE) * delta

    // El juego frena en seco (arcade puro): la amplitud del ciclo se apaga en
    // ~0.15 s en vez de cortarse de golpe, que es lo que se vería como tirón.
    const k = 1 - Math.exp(-14 * delta)
    this._gait += ((moving ? 1 : 0) - this._gait) * k
    const amp = this._gait

    const p = this._cycle * TAU
    const sinP = Math.sin(p)
    const cosP = Math.cos(p)

    this._poseLeg(this.thighR, this.kneeR, this.ankleR, p, amp, run)
    this._poseLeg(this.thighL, this.kneeL, this.ankleL, p + Math.PI, amp, run)

    // El cuerpo baja dos veces por ciclo, en cada apoyo.
    this.body.position.y = -0.045 * amp * (0.5 - 0.5 * Math.cos(p * 2))

    this.hips.rotation.z = sinP * 0.05 * amp
    this.hips.rotation.y = -sinP * 0.09 * amp

    // Contragiro del torso: los hombros van al revés que la cadera. Sin esto la
    // caminata se ve como un muñeco deslizándose.
    //
    // Y ENCIMA, el giro hacia el blanco. Se suma acá y no reemplaza nada: el
    // contragiro es de la caminata y el apuntado es de dónde estás mirando,
    // y las dos cosas pasan a la vez cuando corrés disparando de costado.
    const contragiro = sinP * 0.14 * amp
    this.torso.rotation.y = contragiro + this._aimTwist
    this.torso.rotation.z = -sinP * 0.035 * amp
    this.torso.rotation.x = (0.05 + 0.12 * run) * amp
    // Respiración cuando está quieto.
    this.torso.position.y = Math.sin(this._time * 1.7) * 0.007 * (1 - amp)

    // La cabeza compensa el CONTRAGIRO, no el apuntado: la vista se mantiene
    // estable al caminar, pero acompaña al torso cuando está apuntando. Si
    // compensara el giro entero, el soldado dispararía a un lado mirando al
    // otro, que es justo lo que se veía roto.
    this.head.rotation.y = -contragiro * 0.65
    this.head.rotation.x = -this.torso.rotation.x * 0.75 + Math.sin(p * 2) * 0.02 * amp

    // Arma: balanceo con el paso + retroceso decreciente.
    this._recoil = Math.max(0, this._recoil - delta * 6)
    const rec = this._recoil * this._recoil
    this.weapon.position.set(
      WEAPON_REST.position.x + cosP * 0.006 * amp,
      WEAPON_REST.position.y + Math.sin(p * 2) * 0.012 * amp + Math.sin(this._time * 1.7) * 0.004 * (1 - amp),
      WEAPON_REST.position.z + rec * 0.05,
    )
    this.weapon.rotation.set(
      WEAPON_REST.rotation.x - rec * 0.3,
      WEAPON_REST.rotation.y + sinP * 0.03 * amp,
      WEAPON_REST.rotation.z + cosP * 0.04 * amp,
    )

    // Las manos siguen al arma, no al revés.
    this.weapon.updateMatrix()
    for (const arm of this._arms) {
      arm.target.copy(arm.grip).applyMatrix4(this.weapon.matrix)
      this._solveArm(arm)
    }

    if (this._shadow) {
      // La mancha se achica un poco cuando el cuerpo baja: da sensación de peso.
      const s = 1 + this.body.position.y * 0.9
      this._shadow.scale.set(s, 1, s)
    }
  }

  /**
   * Ciclo de pierna. La rodilla sólo flexiona hacia atrás (valor negativo) y el
   * tobillo compensa para que la bota no clave la punta en el piso.
   */
  _poseLeg(thigh, knee, ankle, phase, amp, run) {
    const swing = (0.42 + 0.28 * run) * amp
    const thighA = Math.sin(phase) * swing
    const bend = Math.max(0, Math.sin(phase - 0.85)) * (0.75 + 0.75 * run) * amp
    const kneeA = -(bend + 0.08 * amp) - 0.04
    thigh.rotation.x = thighA
    knee.rotation.x = kneeA
    ankle.rotation.x = -(thighA + kneeA) * 0.85 + Math.max(0, -Math.cos(phase)) * 0.22 * amp
  }

  /**
   * IK de dos huesos en el espacio del torso.
   *
   * El brazo es un triángulo de lados conocidos (húmero, antebrazo, distancia
   * hombro-mano): la ley del coseno da el ángulo del hombro, y el vector `pole`
   * decide hacia dónde apunta el codo, que es lo único que el triángulo no fija.
   */
  _solveArm(arm) {
    const s = this._s
    const L1 = RIG.upperArm
    const L2 = RIG.foreArm
    const shoulder = arm.upper.position

    s.dir.copy(arm.target).sub(shoulder)
    let d = s.dir.length()
    if (d < 1e-4) {
      s.dir.copy(DOWN)
      d = 1e-4
    } else {
      s.dir.divideScalar(d)
    }
    d = THREE.MathUtils.clamp(d, Math.abs(L1 - L2) + 1e-3, (L1 + L2) * 0.999)
    s.target.copy(shoulder).addScaledVector(s.dir, d)

    const cosA = THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)
    const a = Math.acos(cosA)

    // Componente del pole perpendicular a la línea hombro-mano.
    s.side.copy(arm.pole).addScaledVector(s.dir, -arm.pole.dot(s.dir))
    if (s.side.lengthSq() < 1e-6) s.side.set(0, 0, 1).cross(s.dir)
    s.side.normalize()

    s.upper.copy(s.dir).multiplyScalar(Math.cos(a)).addScaledVector(s.side, Math.sin(a))
    s.qa.setFromUnitVectors(DOWN, s.upper)
    arm.upper.quaternion.copy(s.qa)

    s.elbow.copy(shoulder).addScaledVector(s.upper, L1)
    s.hand.copy(s.target).sub(s.elbow).normalize()
    s.qb.setFromUnitVectors(DOWN, s.hand)
    // El antebrazo cuelga del húmero: su rotación local es la diferencia.
    arm.fore.quaternion.copy(s.qa).invert().multiply(s.qb)
  }

  /** Destello rojo mientras el jugador es invulnerable tras un golpe. */
  /**
   * Gira el torso (con los brazos, el arma y la cabeza) hacia el blanco.
   *
   * En radianes y RELATIVO al cuerpo. Quien lo llama es el dueño del modelo:
   * el modelo no sabe qué es un enemigo.
   */
  setAimTwist(rad) {
    this._aimTwist = rad
  }

  setHit(active) {
    if (active === this._hit) return
    this._hit = active
    this.material.emissive.setHex(active ? 0xff2244 : 0x000000)
    this.material.emissiveIntensity = active ? 0.75 : 0
  }

  /** Patada del arma. La llama WeaponSystem al disparar (Parte D). */
  recoil(strength = 1) {
    this._recoil = Math.min(1, this._recoil + strength)
  }

  /** Boca del cañón en coordenadas de mundo, para el fogonazo y el spawn de balas. */
  getMuzzlePosition(target) {
    return target.copy(MUZZLE).applyMatrix4(this.weapon.matrixWorld)
  }

  /** Vuelve a la pose de reposo sin reconstruir nada. */
  reset() {
    this._cycle = 0
    this._gait = 0
    this._recoil = 0
    this._aimTwist = 0
    this.setHit(false)
    this.update(0, 0, false)
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) o.geometry.dispose()
    })
    this.material.dispose()
    this.atlas.dispose()
    if (this._shadowMaterial) this._shadowMaterial.dispose()
    if (this._shadowTexture) this._shadowTexture.dispose()
    this.root.removeFromParent()
  }
}
