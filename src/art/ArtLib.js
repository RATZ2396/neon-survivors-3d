import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/**
 * ArtLib — las herramientas con las que se construye lo que se ve.
 *
 * Es la base de la capa de arte (`src/art/`). No sabe nada del juego: no
 * importa CONFIG, ni enemigos, ni armas. Recibe medidas y devuelve geometría.
 *
 * Estas funciones nacieron adentro de `player/SoldierModel.js`, que las tenía
 * privadas. Salieron acá al aparecer el segundo constructor de geometría
 * (`WeaponModels`): dos copias de `box()` en dos archivos es exactamente la
 * duplicación que el GDD §1 manda evitar. `SoldierModel` todavía conserva las
 * suyas y hay que hacerle el reemplazo — está anotado en el README.
 *
 * QUÉ COSTO TIENE CADA PRIMITIVA. Todo lo de acá es para lo que hay UNO en
 * pantalla: el jugador, un compañero, un arma. Cientos de triángulos por pieza
 * y no importa. Cuando toque la horda —lo mismo dibujado 400 veces— van a
 * hacer falta primitivas de 12 triángulos, y ese es otro archivo.
 */

// ---------------------------------------------------------------------------
// UV
// ---------------------------------------------------------------------------

/** Lleva los UV de la geometría a 0..1 (ExtrudeGeometry los genera en unidades). */
export function normalizeUV(geo) {
  const uv = geo.attributes.uv
  let minU = Infinity
  let minV = Infinity
  let maxU = -Infinity
  let maxV = -Infinity
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i)
    const v = uv.getY(i)
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

function fract(x) {
  return x - Math.floor(x)
}

/** Contador para que cada pieza caiga en un trozo distinto de la textura. */
let fabricIndex = 0

/** Reinicia el reparto de sub-rectángulos. Lo llama cada modelo al empezar. */
export function resetFabricIndex(value = 0) {
  fabricIndex = value
}

/**
 * Mapea la pieza a un sub-rectángulo de una región texturada del atlas.
 *
 * `scale` es qué fracción de la región ocupa: chico = patrón grande sobre la
 * pieza. La posición sale de un hash del índice, así dos piezas vecinas no
 * repiten la misma mancha y no hay que elegirla a mano para cada una.
 */
export function fabric(geo, region, scale = 0.4) {
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

/**
 * Color plano: todos los UV al centro de la celda del atlas.
 *
 * Al ser un único punto, la derivada del UV es cero y la GPU siempre elige el
 * mip más detallado: no hay sangrado entre celdas vecinas por más lejos que
 * esté el objeto.
 */
export function flat(geo, swatch) {
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, swatch.u, swatch.v)
  return geo
}

// ---------------------------------------------------------------------------
// Primitivas
// ---------------------------------------------------------------------------

export function roundedRectShape(w, h, r) {
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
 * Caja con cantos redondeados.
 *
 * Una caja dura no engancha luz en los bordes y se lee como cubo de prototipo;
 * con unos milímetros de bisel aparece el reflejo del canto y la misma caja se
 * lee como nylon, polímero o metal. Es la pieza base de todas las armas.
 */
export function box(w, h, d, r = 0.014) {
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
 *
 * Un cilindro no sirve: el muslo humano baja de 10 cm de radio a 7.5 y esa
 * conicidad es la mitad de lo que hace que una pierna parezca una pierna.
 */
export function limb(rTop, rBot, len, seg = 12) {
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

/** Anillo abierto (cinturón, visor, aro): cilindro sin tapas. */
export function ring(radius, height, seg = 16, thetaStart = 0, thetaLength = Math.PI * 2) {
  return new THREE.CylinderGeometry(radius, radius, height, seg, 1, true, thetaStart, thetaLength)
}

export function sphere(r, wSeg = 14, hSeg = 10) {
  return new THREE.SphereGeometry(r, wSeg, hSeg)
}

export function cyl(rTop, rBot, len, seg = 10) {
  return new THREE.CylinderGeometry(rTop, rBot, len, seg, 1, false)
}

// ---------------------------------------------------------------------------
// Ensamblado
// ---------------------------------------------------------------------------

const MERGE_ATTRS = ['position', 'normal', 'uv']

/**
 * Acumula piezas y las funde en UNA geometría.
 *
 * Es lo que mantiene barato un modelo detallado: un arma son veinte piezas y
 * un solo draw call. Para un cuerpo articulado se usa una Part por hueso, y
 * cada una termina en su propio mesh, porque cada hueso se mueve por separado.
 */
export class Part {
  constructor(name) {
    this.name = name
    this.geos = []
  }

  /** @param {THREE.BufferGeometry} geo ya posicionada y con sus UV puestas */
  add(geo) {
    // mergeGeometries exige el mismo set de atributos, y todas indexadas o
    // ninguna. ExtrudeGeometry viene sin índice y el resto con índice, así que
    // se normaliza todo a no-indexado.
    const g = geo.index ? geo.toNonIndexed() : geo
    for (const key of Object.keys(g.attributes)) {
      if (!MERGE_ATTRS.includes(key)) g.deleteAttribute(key)
    }
    g.clearGroups()
    if (g !== geo) geo.dispose()
    this.geos.push(g)
    return this
  }

  /** Funde lo acumulado y libera las piezas sueltas. */
  build() {
    const merged = mergeGeometries(this.geos, false)
    for (const g of this.geos) g.dispose()
    this.geos.length = 0
    merged.name = this.name
    return merged
  }

  mesh(material) {
    const m = new THREE.Mesh(this.build(), material)
    m.name = this.name
    return m
  }
}

/** Triángulos de una geometría ya fundida. Lo usan las mediciones. */
export function triangleCount(geo) {
  const pos = geo.attributes.position
  if (!pos) return 0
  return (geo.index ? geo.index.count : pos.count) / 3
}
