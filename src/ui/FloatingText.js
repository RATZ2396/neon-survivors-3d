import * as THREE from 'three'
import { CONFIG } from '../config/GameConfig.js'

/** Scratch de proyección. No se crean vectores dentro del bucle. */
const _v = new THREE.Vector3()

/**
 * FloatingText — números que suben desde el mundo y se apagan.
 *
 * QUÉ MUESTRA Y QUÉ NO, que es la decisión de diseño y no un detalle técnico:
 * solo el daño al boss, el daño que recibís y la subida de nivel. Un número por
 * cada impacto sobre 400 enemigos no es información, es una cortina — y taparía
 * justo lo que hay que ver, que es de dónde viene la horda. El daño a la horda
 * ya se comunica: el enemigo desaparece.
 *
 * Implementación en DOM y no en 3D a propósito, igual que el HUD: texto nítido a
 * cualquier resolución, cero draw calls y nada que ordenar por profundidad. Los
 * elementos se reservan una vez y se reciclan; el pool no crece.
 */
export class FloatingText {
  constructor() {
    const max = CONFIG.UI.FLOAT_MAX

    this.root = document.createElement('div')
    this.root.id = 'floaters'
    document.body.appendChild(this.root)

    this.max = max
    this.count = 0

    this.posX = new Float32Array(max)
    this.posY = new Float32Array(max)
    this.posZ = new Float32Array(max)
    this.life = new Float32Array(max)
    this.maxLife = new Float32Array(max)

    /** Los divs, creados una sola vez. */
    this.nodes = []
    for (let i = 0; i < max; i++) {
      const el = document.createElement('div')
      el.className = 'floater'
      el.style.display = 'none'
      this.root.appendChild(el)
      this.nodes.push(el)
    }
  }

  clear() {
    for (let i = 0; i < this.count; i++) this.nodes[i].style.display = 'none'
    this.count = 0
  }

  /**
   * @param {string} texto
   * @param {number} x @param {number} y @param {number} z posición en el mundo
   * @param {string} [tipo] clase CSS extra: 'dano' | 'recibido' | 'nivel'
   */
  spawn(texto, x, y, z, tipo = '') {
    // Si el pool está lleno se pisa el más viejo en vez de descartar: acá lo
    // último que pasó es lo que importa, al revés que en las partículas.
    let i
    if (this.count < this.max) {
      i = this.count++
    } else {
      i = 0
      let peor = this.life[0] / this.maxLife[0]
      for (let k = 1; k < this.count; k++) {
        const r = this.life[k] / this.maxLife[k]
        if (r < peor) {
          peor = r
          i = k
        }
      }
    }

    this.posX[i] = x
    this.posY[i] = y
    this.posZ[i] = z
    this.life[i] = CONFIG.UI.FLOAT_LIFE
    this.maxLife[i] = CONFIG.UI.FLOAT_LIFE

    const el = this.nodes[i]
    el.textContent = texto
    el.className = 'floater' + (tipo ? ' ' + tipo : '')
    el.style.display = 'block'
  }

  /**
   * Sube, se apaga y se reposiciona en pantalla.
   *
   * Se recorre hacia atrás por el borrado por intercambio, igual que en la horda
   * y en las partículas.
   */
  update(delta, camera) {
    if (this.count === 0) return

    const w = window.innerWidth * 0.5
    const h = window.innerHeight * 0.5

    for (let i = this.count - 1; i >= 0; i--) {
      this.life[i] -= delta
      if (this.life[i] <= 0) {
        this._remove(i)
        continue
      }

      this.posY[i] += CONFIG.UI.FLOAT_RISE * delta

      _v.set(this.posX[i], this.posY[i], this.posZ[i]).project(camera)
      const el = this.nodes[i]

      // Detrás de la cámara z sale fuera de [-1,1] y la proyección se invierte:
      // sin este corte el número aparecería reflejado del otro lado.
      if (_v.z > 1) {
        el.style.display = 'none'
        continue
      }

      const t = this.life[i] / this.maxLife[i]
      el.style.display = 'block'
      el.style.transform = `translate(${(_v.x * w + w).toFixed(0)}px, ${(-_v.y * h + h).toFixed(0)}px)`
      el.style.opacity = t < 0.4 ? (t / 0.4).toFixed(2) : '1'
    }
  }

  _remove(i) {
    const last = --this.count
    this.nodes[i].style.display = 'none'
    if (i === last) return

    this.posX[i] = this.posX[last]
    this.posY[i] = this.posY[last]
    this.posZ[i] = this.posZ[last]
    this.life[i] = this.life[last]
    this.maxLife[i] = this.maxLife[last]

    // Los divs son el pool: se intercambian los nodos, no su contenido, para no
    // volver a escribir texto ni clases en cada compactación.
    const tmp = this.nodes[i]
    this.nodes[i] = this.nodes[last]
    this.nodes[last] = tmp
  }
}
