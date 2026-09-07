import { CONFIG } from '../config/GameConfig.js'
import { ENEMY_DEFS, ENEMY_TYPE } from '../config/EnemyDefs.js'

/**
 * WAVE_STAGES — la curva de dificultad de la HORDA, en una tabla.
 *
 * `at` es el segundo en que empieza la etapa. `interval` es cada cuánto se
 * dispara una tanda y `batch` cuántos enemigos trae. `weights` es la
 * probabilidad relativa de cada tipo (no hace falta que sumen 1, y un tipo que
 * no se nombra simplemente no sale en esa etapa).
 *
 * Balancear el juego = editar esta tabla. Agregar una etapa = agregar una fila.
 * En la versión anterior la progresión estaba dispersa en condicionales dentro
 * de WaveManager y por eso nadie podía decir qué pasaba en el minuto 3.
 *
 * ACÁ NO SALEN LOS MINIJEFES NI LOS JEFES: esos tienen su propio calendario en
 * ELITE_SCHEDULE (BossDefs.js). Esta tabla es la basura, y la basura es lo que
 * hace que un minijefe sea difícil.
 *
 * LA FORMA DE LA CURVA, que es lo que importa y no los números sueltos:
 *
 *   0-45s     drones y corredores. Se aprende a moverse.
 *   45-110s   entran las larvas: la pantalla se llena sin que suba la vida
 *             total, así que la presión pasa a ser que te rodean.
 *   110-200s  entra Mitosis, que al morir deja dos larvas: por primera vez
 *             hay que elegir CUÁNDO matar algo, no solo qué.
 *   200s+     entra el Cazador, que es `heavy`: nada lo empuja y la multitud
 *             no lo bloquea. Es el final de correr en círculos arrastrando a
 *             todos atrás, que era la única estrategia dominante que quedaba.
 *
 * La proporción de drones BAJA con el tiempo mientras sube todo lo demás: la
 * horda tardía no es la misma horda pero más grande, es otra horda.
 */
export const WAVE_STAGES = [
  { at: 0, interval: 1.4, batch: 2, weights: { NORMAL: 1 } },
  { at: 20, interval: 1.15, batch: 2, weights: { NORMAL: 1, RUNNER: 0.35 } },
  { at: 45, interval: 0.95, batch: 3, weights: { NORMAL: 1, RUNNER: 0.5, SWARM: 0.6 } },
  {
    at: 75,
    interval: 0.9,
    batch: 3,
    weights: { NORMAL: 1, RUNNER: 0.55, TANK: 0.12, SWARM: 0.8 },
  },
  {
    at: 110,
    interval: 0.8,
    batch: 4,
    weights: { NORMAL: 0.9, RUNNER: 0.7, TANK: 0.22, SWARM: 0.9, SPLITTER: 0.3 },
  },
  {
    at: 150,
    interval: 0.7,
    batch: 4,
    weights: { NORMAL: 0.8, RUNNER: 0.8, TANK: 0.3, SWARM: 1, SPLITTER: 0.45, HUNTER: 0.25 },
  },
  {
    at: 200,
    interval: 0.6,
    batch: 5,
    weights: { NORMAL: 0.7, RUNNER: 0.9, TANK: 0.4, SWARM: 1.1, SPLITTER: 0.6, HUNTER: 0.45 },
  },
  {
    at: 260,
    interval: 0.5,
    batch: 5,
    weights: { NORMAL: 0.6, RUNNER: 1, TANK: 0.5, SWARM: 1.2, SPLITTER: 0.75, HUNTER: 0.7 },
  },
  {
    at: 330,
    interval: 0.42,
    batch: 6,
    weights: { NORMAL: 0.5, RUNNER: 1.1, TANK: 0.6, SWARM: 1.3, SPLITTER: 0.9, HUNTER: 0.95 },
  },
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
     * duelo con un JEFE (no con un minijefe). 1 = ritmo normal.
     */
    this.spawnMultiplier = 1

    /**
     * Pesos acumulados precalculados: elegir un tipo es un solo recorrido
     * corto, sin construir arrays temporales dentro del loop.
     *
     * SE ACUMULA EN ORDEN DE ÍNDICE, no en el orden en que están escritos los
     * pesos en la tabla. `_pickType` recorre por índice y necesita que los
     * acumulados crezcan; acumulando en el orden del objeto, escribir SWARM
     * antes que TANK —que es el orden en que se leen bien— dejaba los
     * acumulados desordenados y la distribución real no era la de la tabla.
     * Funcionaba de casualidad mientras las tres etapas nombraban NORMAL,
     * RUNNER y TANK justo en ese orden.
     */
    this._cumulative = WAVE_STAGES.map((stage) => {
      const cum = new Float32Array(ENEMY_DEFS.length)
      let acc = 0
      for (let t = 0; t < ENEMY_DEFS.length; t++) {
        acc += stage.weights[ENEMY_DEFS[t].key] || 0
        cum[t] = acc
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

    this._timer -= delta

    // `while` y no `if`: si un frame largo se comió dos intervalos, salen las
    // dos tandas. Con `if` la dificultad bajaría justo cuando el juego va lento.
    while (this._timer <= 0) {
      this._timer += this.stage.interval * this.spawnMultiplier
      this._spawnBatch(playerPos)
    }
  }

  /**
   * Una tanda, alrededor del jugador.
   *
   * La etapa se lee de `this.stage` y no se recibe como parámetro: recibirla
   * abría la puerta a que quien llame pase otra cosa, y un `stage` equivocado
   * no rompe nada visiblemente — simplemente no aparece nadie.
   */
  _spawnBatch(playerPos) {
    const { SPAWN_DISTANCE, SPAWN_JITTER } = CONFIG.WAVES
    const stage = this.stage
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

  /**
   * Un tipo al azar según los pesos de la etapa.
   *
   * `prev` es lo que hace que un tipo con peso 0 no pueda salir: su acumulado
   * es igual al del anterior, o sea que su franja mide cero, y una franja de
   * ancho cero nunca puede contener al número sorteado.
   */
  _pickType() {
    const { cum, total } = this._cumulative[this.stageIndex]
    const r = Math.random() * total
    let prev = 0

    for (let t = 0; t < cum.length; t++) {
      if (cum[t] > prev && r <= cum[t]) return t
      prev = cum[t]
    }
    return 0
  }
}
