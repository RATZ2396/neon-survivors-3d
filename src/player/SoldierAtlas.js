import * as THREE from 'three'

/**
 * SoldierAtlas — texturas procedurales del soldado, en UN solo atlas.
 *
 * Por qué un atlas y no un material por cosa: el modelo tiene tela de camuflaje,
 * nylon de chaleco, piel, goma, polímero y metal. Con un MeshStandardMaterial por
 * cada uno serían 6+ materiales y, como cada parte del rig se anima por separado,
 * el personaje solo costaría ~30 draw calls. Metiendo todo en un atlas
 * (color + rugosidad + metalicidad) el soldado entero usa UN material y el costo
 * queda en 1 draw call por hueso animado.
 *
 * El atlas se genera en canvas, sin archivos: el proyecto no tiene assets
 * binarios y no quiero introducir el primero para la Parte B.
 *
 * Layout (en UV, origen abajo-izquierda):
 *
 *   +---------------------+----------+
 *   |  CAMO  (uniforme)   | swatches |   v 0.5 .. 1
 *   +---------------------+  4 x 8   |
 *   |  NYLON (equipo)     |  planos  |   v 0   .. 0.5
 *   +---------------------+----------+
 *   u 0 .. 0.5             u 0.5 .. 1
 *
 * Las dos regiones grandes son tela con patrón: cada pieza texturada mapea su
 * UV 0..1 a un sub-rectángulo de la región (ver `camoRect` en SoldierModel), lo
 * que permite darle escala distinta a cada parte sin repetir la textura y sin
 * costuras. Los swatches son colores planos: la pieza pone TODOS sus UV en el
 * centro de la celda, así que muestrea un único téxel y no hay sangrado.
 */

const SIZE = 1024
/** Mitad derecha del atlas: grilla de colores planos. */
const SWATCH_COLS = 4
const SWATCH_ROWS = 8

/**
 * Superficies duras: color, rugosidad y metalicidad. El orden define la celda,
 * así que agregar al final no mueve las existentes.
 */
const SWATCHES = {
  skin: { color: '#b07a55', roughness: 0.66, metalness: 0.0 },
  skinDark: { color: '#8d5f42', roughness: 0.7, metalness: 0.0 },
  glove: { color: '#26251f', roughness: 0.82, metalness: 0.02 },
  boot: { color: '#241f1a', roughness: 0.55, metalness: 0.04 },
  sole: { color: '#121110', roughness: 0.95, metalness: 0.0 },
  gunmetal: { color: '#40444a', roughness: 0.38, metalness: 0.88 },
  polymer: { color: '#33362e', roughness: 0.52, metalness: 0.06 },
  optic: { color: '#0b0d12', roughness: 0.12, metalness: 0.5 },
  webbing: { color: '#6d6449', roughness: 0.9, metalness: 0.0 },
  rubber: { color: '#17181a', roughness: 0.88, metalness: 0.0 },
  steel: { color: '#8b9099', roughness: 0.3, metalness: 0.95 },
}

/** Región de tela: camuflaje del uniforme. */
export const CAMO = { u0: 0.0, v0: 0.5, u1: 0.5, v1: 1.0 }
/** Región de tela: nylon verde ranger del equipo (chaleco, mochila, casco). */
export const NYLON = { u0: 0.0, v0: 0.0, u1: 0.5, v1: 0.5 }

/** PRNG determinista: el camuflaje tiene que salir igual en cada arranque. */
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvas2d(size) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c.getContext('2d')
}

/** Rect en píxeles de una región UV (el canvas tiene el eje V invertido). */
function pxRect(region) {
  return {
    x: region.u0 * SIZE,
    y: (1 - region.v1) * SIZE,
    w: (region.u1 - region.u0) * SIZE,
    h: (region.v1 - region.v0) * SIZE,
  }
}

/**
 * Mancha orgánica: varias elipses solapadas alrededor de un centro. Una sola
 * elipse se lee como gota; seis con rotación y radio variable se leen como
 * mancha de camuflaje.
 */
function blob(ctx, x, y, r, rand) {
  const lobes = 5 + Math.floor(rand() * 5)
  ctx.beginPath()
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + rand() * 0.8
    const d = r * (0.25 + rand() * 0.5)
    ctx.ellipse(
      x + Math.cos(a) * d,
      y + Math.sin(a) * d,
      r * (0.45 + rand() * 0.55),
      r * (0.35 + rand() * 0.5),
      rand() * Math.PI,
      0,
      Math.PI * 2,
    )
  }
  ctx.fill()
}

/** Grano de tela: ruido fino + trama de hilos. Es lo que evita el look plástico. */
function fabricGrain(ctx, r, rand, strength) {
  ctx.globalAlpha = strength
  const dots = Math.floor(r.w * r.h * 0.04)
  for (let i = 0; i < dots; i++) {
    const v = rand() < 0.5 ? 0 : 255
    ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'
    ctx.fillRect(r.x + rand() * r.w, r.y + rand() * r.h, 1, 1)
  }
  ctx.globalAlpha = strength * 0.5
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 1
  for (let y = 0; y < r.h; y += 3) {
    ctx.beginPath()
    ctx.moveTo(r.x, r.y + y)
    ctx.lineTo(r.x + r.w, r.y + y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

/** Camuflaje multiterreno: base arena + capas verde/marrón/oscuro + ramitas. */
function paintCamo(ctx, region, rand) {
  const r = pxRect(region)
  ctx.save()
  ctx.beginPath()
  ctx.rect(r.x, r.y, r.w, r.h)
  ctx.clip()

  ctx.fillStyle = '#8b7d55'
  ctx.fillRect(r.x, r.y, r.w, r.h)

  const layers = [
    { color: '#a2946a', count: 26, min: 26, max: 60 },
    { color: '#6c7749', count: 30, min: 20, max: 52 },
    { color: '#7a6440', count: 26, min: 16, max: 44 },
    { color: '#4b4030', count: 34, min: 8, max: 26 },
  ]
  for (const layer of layers) {
    ctx.fillStyle = layer.color
    for (let i = 0; i < layer.count; i++) {
      blob(ctx, r.x + rand() * r.w, r.y + rand() * r.h, layer.min + rand() * (layer.max - layer.min), rand)
    }
  }

  // Ramitas: trazos finos oscuros, la firma visual del patrón multiterreno.
  ctx.strokeStyle = 'rgba(58,50,36,0.75)'
  for (let i = 0; i < 70; i++) {
    const x = r.x + rand() * r.w
    const y = r.y + rand() * r.h
    const a = rand() * Math.PI * 2
    const len = 10 + rand() * 40
    ctx.lineWidth = 1 + rand() * 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(
      x + Math.cos(a) * len * 0.5 + (rand() - 0.5) * 12,
      y + Math.sin(a) * len * 0.5 + (rand() - 0.5) * 12,
      x + Math.cos(a) * len,
      y + Math.sin(a) * len,
    )
    ctx.stroke()
  }

  fabricGrain(ctx, r, rand, 0.1)
  ctx.restore()
}

/** Nylon del equipo: verde ranger con desgaste y cintas MOLLE cosidas. */
function paintNylon(ctx, region, rand) {
  const r = pxRect(region)
  ctx.save()
  ctx.beginPath()
  ctx.rect(r.x, r.y, r.w, r.h)
  ctx.clip()

  ctx.fillStyle = '#464b3c'
  ctx.fillRect(r.x, r.y, r.w, r.h)

  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(96,102,82,0.35)' : 'rgba(32,36,28,0.35)'
    blob(ctx, r.x + rand() * r.w, r.y + rand() * r.h, 14 + rand() * 46, rand)
  }

  for (let y = 26; y < r.h; y += 46) {
    ctx.fillStyle = 'rgba(28,32,24,0.5)'
    ctx.fillRect(r.x, r.y + y + 20, r.w, 3)
    ctx.fillStyle = 'rgba(120,126,104,0.35)'
    ctx.fillRect(r.x, r.y + y, r.w, 2)
    ctx.fillStyle = 'rgba(20,24,18,0.65)'
    for (let x = 6; x < r.w; x += 30) ctx.fillRect(r.x + x, r.y + y + 2, 2, 18)
  }

  fabricGrain(ctx, r, rand, 0.08)
  ctx.restore()
}

/** Celda (en píxeles) del swatch i de la grilla de la mitad derecha. */
function swatchRect(index) {
  const cw = (SIZE * 0.5) / SWATCH_COLS
  const ch = SIZE / SWATCH_ROWS
  const col = index % SWATCH_COLS
  const row = Math.floor(index / SWATCH_COLS)
  return { x: SIZE * 0.5 + col * cw, y: row * ch, w: cw, h: ch }
}

/** Centro de la celda en UV: el único punto que muestrean los colores planos. */
function swatchUV(index) {
  const r = swatchRect(index)
  return { u: (r.x + r.w * 0.5) / SIZE, v: 1 - (r.y + r.h * 0.5) / SIZE }
}

function gray(value) {
  const v = Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255)
  return 'rgb(' + v + ',' + v + ',' + v + ')'
}

/**
 * Construye el atlas. Devuelve las tres texturas, el UV de cada swatch y un
 * `dispose()` — lo llama el preview al recargar y el juego al destruir el modelo.
 */
export function buildSoldierAtlas(seed = 20260902) {
  const color = canvas2d(SIZE)
  const rough = canvas2d(SIZE)
  const metal = canvas2d(SIZE)

  paintCamo(color, CAMO, mulberry32(seed))
  paintNylon(color, NYLON, mulberry32(seed + 7))

  // Telas: rugosidad alta con ruido, metalicidad cero.
  for (const region of [CAMO, NYLON]) {
    const r = pxRect(region)
    rough.fillStyle = gray(0.88)
    rough.fillRect(r.x, r.y, r.w, r.h)
    fabricGrain(rough, r, mulberry32(seed + 13), 0.25)
    metal.fillStyle = gray(0)
    metal.fillRect(r.x, r.y, r.w, r.h)
  }

  const uv = {}
  Object.keys(SWATCHES).forEach((name, i) => {
    const r = swatchRect(i)
    const s = SWATCHES[name]
    color.fillStyle = s.color
    color.fillRect(r.x, r.y, r.w, r.h)
    rough.fillStyle = gray(s.roughness)
    rough.fillRect(r.x, r.y, r.w, r.h)
    metal.fillStyle = gray(s.metalness)
    metal.fillRect(r.x, r.y, r.w, r.h)
    uv[name] = swatchUV(i)
  })

  const map = new THREE.CanvasTexture(color.canvas)
  map.colorSpace = THREE.SRGBColorSpace
  const roughnessMap = new THREE.CanvasTexture(rough.canvas)
  const metalnessMap = new THREE.CanvasTexture(metal.canvas)

  for (const t of [map, roughnessMap, metalnessMap]) {
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
    t.anisotropy = 8
  }

  return {
    map,
    roughnessMap,
    metalnessMap,
    swatch: uv,
    dispose() {
      map.dispose()
      roughnessMap.dispose()
      metalnessMap.dispose()
    },
  }
}
