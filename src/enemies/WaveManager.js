import { CONFIG } from '../config/GameConfig.js'
import { ENEMY_DEFS, ENEMY_TYPE } from '../config/EnemyDefs.js'

/**
 * WAVE_STAGES — la curva de dificultad completa, en una tabla.
 *
 * `at` es el segundo en que empieza la etapa. `interval` es cada cuánto se
 * dispara una tanda y `batch` cuántos enemigos trae. `weights` es la
 * probabilidad relativa de cada tipo (no hace falta que sumen 1).
 *
 * Balancear el juego = editar esta tabla. Agregar una etapa = agregar una fila.
 * En la versión anterior la progresión estaba dispersa en condicionales dentro
 * de WaveManager y por eso nadie podía decir qué pasaba en el minuto 3.
 */
export const WAVE_STAGES = [
  { at: 0, interval: 1.4, batch: 2, weights: { NORMAL: 1, RUNNER: 0, TANK: 0 } },
  { at: 20, interval: 1.15, batch: 2, weights: { NORMAL: 1, RUNNER: 0.35, TANK: 0 } },
  { at: 45, interval: 0.95, batch: 3, weights: { NORMAL: 1, RUNNER: 0.5, TANK: 0.12 } },
  { at: 90, interval: 0.75, batch: 3, weights: { NORMAL: 1, RUNNER: 0.7, TANK: 0.25 } },
  { at: 150, interval: 0.6, batch: 4, weights: { NORMAL: 1, RUNNER: 0.9, TANK: 0.4 } },
  { at: 240, interval: 0.45, batch: 5, weights: { NORMAL: 1, RUNNER: 1.1, TANK: 0.6 } },
]

/**
 * WaveManager — decide QUÉ aparece, CUÁNDO y DÓNDE.
 *
 * No sabe cómo se mueve ni cómo se dibuja un enemigo: solo llama a
 * EnemyManager.spawn(). Esa separación es la que permite balancear oleadas sin
 * riesgo de tocar la simulación.
 */
export class WaveManager {
  constructor(enemies) {
    this.enemies = enemies
    this.elapsed = 0
    this.stageIndex = 0
    this._timer = 0
    /**
     * Estira el intervalo entre tandas. Lo mueve el BossController durante el
     * duelo. 1 = ritmo normal.
     */
    this.spawnMultiplier = 1

    // Pesos acumulados precalculados: elegir un tipo es un solo recorrido corto,
    // sin construir arrays temporales dentro del loop.
    this._cumulative = WAVE_STAGES.map((stage) => {
      const cum = new Array(ENEMY_DEFS.length).fill(0)
      let acc = 0
      for (const key in stage.weights) {
        acc += stage.weights[key]
        cum[ENEMY_TYPE[key]] = acc
      }
      return { cum, total: acc }
    })
  }

  reset() {
    this.elapsed = 0
    this.stageIndex = 0
    this._timer = 0
    this.spawnMultiplier = 1
  }

  get stage() {
    return WAVE_STAGES[this.stageIndex]
  }

  /** Multiplicador de vida por tiempo transcurrido. Única palanca de escalado. */
  get hpMultiplier() {
    return 1 + this.elapsed / CONFIG.WAVES.HP_DOUBLE_EVERY
  }

  update(delta, playerPos) {
    this.elapsed += delta

    while (
      this.stageIndex < WAVE_STAGES.length - 1 &&
      this.elapsed >= WAVE_STAGES[this.stageIndex + 1].at
    ) {
      this.stageIndex++
    }

    const stage = this.stage
    this._timer -= delta

    // `while` y no `if`: si un frame largo se comió dos intervalos, salen las
    // dos tandas. Con `if` la dificultad bajaría justo cuando el juego va lento.
    while (this._timer <= 0) {
      this._timer += stage.interval * this.spawnMultiplier
      this._spawnBatch(stage, playerPos)
    }
  }

  _spawnBatch(stage, playerPos) {
    const { SPAWN_DISTANCE, SPAWN_JITTER } = CONFIG.WAVES
    const limit = CONFIG.WORLD.ARENA_SIZE / 2 - 1
    const mult = this.hpMultiplier

    for (let i = 0; i < stage.batch; i++) {
      if (this.enemies.count >= this.enemies.max) return

      // Aparecen en un anillo alrededor del jugador: nunca delante de sus ojos,
      // nunca tan lejos que tarden medio minuto en llegar.
      const angle = Math.random() * Math.PI * 2
      const dist = SPAWN_DISTANCE + Math.random() * SPAWN_JITTER

      let x = playerPos.x + Math.cos(angle) * dist
      let z = playerPos.z + Math.sin(angle) * dist

      // Contra el borde de la arena el anillo se recorta; sin esto aparecerían
      // fuera del mapa y entrarían todos por la misma esquina.
      if (x > limit) x = limit
      else if (x < -limit) x = -limit
      if (z > limit) z = limit
      else if (z < -limit) z = -limit

      this.enemies.spawn(this._pickType(), x, z, mult)
    }
  }

  _pickType() {
    const { cum, total } = this._cumulative[this.stageIndex]
    const r = Math.random() * total
    for (let t = 0; t < cum.length; t++) {
      if (cum[t] > 0 && r <= cum[t]) return t
    }
    return 0
  }
}
