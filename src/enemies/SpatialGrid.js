/**
 * SpatialGrid — rejilla espacial uniforme, sin asignaciones en runtime.
 *
 * Para qué: separar N enemigos comparando todos contra todos es O(n²).
 * Con 300 enemigos son 45.000 comparaciones por frame. Con la rejilla solo se
 * compara contra los que están en las 9 celdas vecinas, que en la práctica son
 * unos pocos.
 *
 * Cómo: counting sort por celda. Cada frame se reconstruye entero (más barato
 * y mucho menos propenso a bugs que mantener celdas incrementalmente cuando
 * todo se mueve todo el tiempo).
 *
 * Deliberadamente NO expone un forEachNeighbor(callback): quien la usa itera
 * los arrays crudos. Un callback por par de vecinos sería una closure por
 * frame y esto está en el camino caliente.
 */
export class SpatialGrid {
  /**
   * @param {number} worldSize lado de la arena (centrada en el origen)
   * @param {number} cellSize  lado de la celda
   * @param {number} capacity  máximo de entidades indexables
   */
  constructor(worldSize, cellSize, capacity) {
    this.cellSize = cellSize
    this.invCell = 1 / cellSize
    this.half = worldSize / 2
    this.dim = Math.ceil(worldSize / cellSize) + 1
    this.cellCount = this.dim * this.dim

    // Todo reservado una sola vez, en el constructor.
    this.counts = new Int32Array(this.cellCount)
    this.start = new Int32Array(this.cellCount + 1)
    this.cursor = new Int32Array(this.cellCount)
    this.items = new Int32Array(capacity)
    this.cellOf = new Int32Array(capacity)
  }

  /** Índice de celda para una coordenada de mundo. */
  cellX(x) {
    let c = ((x + this.half) * this.invCell) | 0
    if (c < 0) c = 0
    else if (c >= this.dim) c = this.dim - 1
    return c
  }

  cellZ(z) {
    return this.cellX(z) // misma transformación, arena cuadrada
  }

  /**
   * Reconstruye el índice.
   * @param {Float32Array} posX
   * @param {Float32Array} posZ
   * @param {number} count entidades activas (las primeras `count` del array)
   */
  build(posX, posZ, count) {
    const { counts, start, cursor, items, cellOf, dim } = this

    counts.fill(0)

    for (let i = 0; i < count; i++) {
      const c = this.cellX(posX[i]) + this.cellZ(posZ[i]) * dim
      cellOf[i] = c
      counts[c]++
    }

    // Suma prefija: start[c] es dónde empiezan los items de la celda c.
    let acc = 0
    for (let c = 0; c < this.cellCount; c++) {
      start[c] = acc
      cursor[c] = acc
      acc += counts[c]
    }
    start[this.cellCount] = acc

    for (let i = 0; i < count; i++) items[cursor[cellOf[i]]++] = i
  }
}
