import { ENEMY_TYPE } from './EnemyDefs.js'
import { CONFIG } from './GameConfig.js'

/**
 * Los dos escalones de una élite.
 *
 * No es una etiqueta decorativa: es lo único que decide si al aparecer se
 * limpia la arena y si el spawner afloja. Ver BossController._spawn().
 */
export const ELITE_TIER = {
  /** Sale ADENTRO de la horda, que sigue apareciendo igual. */
  MINI: 'MINI',
  /** Sale casi solo: limpia la arena y el spawner baja a un goteo. */
  BOSS: 'BOSS',
}

/**
 * BOSS_DEFS — lo que una élite HACE, que no se puede escribir como un número
 * suelto.
 *
 * Sus estadísticas (vida, velocidad, radio, daño de contacto, XP, color) NO
 * están acá: viven en ENEMY_DEFS, porque una élite ES un enemigo. Acá está solo
 * su comportamiento. Dos tablas, una misma clave.
 *
 * Una élite nueva son dos filas: el arquetipo en ENEMY_DEFS y el comportamiento
 * acá. No una clase.
 *
 * Las habilidades son OPCIONALES. Una fila sin `charge` o sin `slam` no usa esa
 * habilidad: el BossController lo consulta antes de ejecutarla. Quitarle un
 * ataque a un jefe es borrar una clave de esta tabla, no tocar código. Hoy hay
 * dos habilidades y seis élites; la variedad sale de combinarlas y de los
 * números de cada una, no de escribir un ataque nuevo por jefe.
 *
 * EL PROBLEMA DEL GÉNERO, que estas habilidades atacan: un enemigo lento y
 * grande es trivial, alcanza con caminar hacia atrás. El golpe de área castiga
 * al que se queda pegado disparando. La embestida castiga al que camina en
 * línea recta.
 *
 * POR QUÉ EL CUBE KING NO EMBISTE. Que algo te salte encima a seis veces su
 * velocidad se siente injusto aunque avise, y en un juego donde lo único que
 * controlás es moverte, un ataque que te persigue más rápido de lo que podés
 * correr no deja jugar, deja aguantar. La embestida es de los cuerpos rápidos y
 * angostos —el Bruto, el Acechador, el Segador—, donde se lee como lo que el
 * bicho evidentemente hace. En un cubo de 2.6 de radio no se leía.
 */
export const BOSS_DEFS = [
  // ── Minijefes ────────────────────────────────────────────────────────────
  {
    key: 'BRUTE',
    tier: ELITE_TIER.MINI,
    enemyType: ENEMY_TYPE.BRUTE,

    charge: {
      /** Segundos entre embestidas. */
      every: 5.5,
      /** Aviso: se queda quieto y cambia de color antes de arrancar. */
      telegraph: 0.7,
      speed: 11,
      duration: 0.9,
      warnColor: 0xffd166,
    },
  },
  {
    key: 'WARDEN',
    tier: ELITE_TIER.MINI,
    enemyType: ENEMY_TYPE.WARDEN,

    slam: {
      every: 4.5,
      range: 7.0,
      windup: 0.6,
      radius: 6.0,
      damage: 26,
      color: 0x60a5fa,
    },
  },
  {
    key: 'STALKER',
    tier: ELITE_TIER.MINI,
    enemyType: ENEMY_TYPE.STALKER,

    // Avisa menos y va más rápido que el Bruto, pero se muere antes. Es el
    // mismo ataque con otros números: eso es lo que compra tener la tabla.
    charge: {
      every: 4.0,
      telegraph: 0.5,
      speed: 13,
      duration: 0.8,
      warnColor: 0xffd166,
    },
  },

  // ── Jefes ────────────────────────────────────────────────────────────────
  {
    key: 'CUBE_KING',
    tier: ELITE_TIER.BOSS,
    enemyType: ENEMY_TYPE.CUBE_KING,

    // Sin `charge`: el Cube King no embiste. Ver el comentario de arriba.

    slam: {
      /** Segundos entre golpes de área. */
      every: 5.0,
      /** Solo golpea si el jugador está a esta distancia o menos. */
      range: 6.0,
      windup: 0.55,
      radius: 5.5,
      damage: 30,
      color: 0xffd166,
    },
  },
  {
    key: 'REAPER',
    tier: ELITE_TIER.BOSS,
    enemyType: ENEMY_TYPE.REAPER,

    /** El único que hace las dos cosas. Por eso tiene menos vida que el Coloso. */
    charge: {
      every: 6.0,
      telegraph: 0.8,
      speed: 14,
      duration: 1.0,
      warnColor: 0xffd166,
    },

    slam: {
      every: 6.0,
      range: 6.5,
      windup: 0.5,
      radius: 5.5,
      damage: 34,
      color: 0xef4444,
    },
  },
  {
    key: 'COLOSSUS',
    tier: ELITE_TIER.BOSS,
    enemyType: ENEMY_TYPE.COLOSSUS,

    /**
     * El golpe más grande y más seguido del juego, y el único con un aviso
     * largo. Es toda su pelea: es tan lento que caminar hacia atrás lo esquiva
     * siempre, así que lo único que puede castigarte es quedarte quieto.
     */
    slam: {
      every: 3.6,
      range: 9.0,
      windup: 0.7,
      radius: 8.5,
      damage: 45,
      color: 0x94a3b8,
    },
  },
]

export const BOSS = {}
for (let i = 0; i < BOSS_DEFS.length; i++) BOSS[BOSS_DEFS[i].key] = i

/**
 * ELITE_SCHEDULE — quién aparece y en qué segundo. La partida entera, en una
 * columna.
 *
 * LA FORMA ACORDADA: horda → minijefe CON la horda → jefe casi solo. Cada
 * vuelta de esa rueda sube un escalón, y la tabla lo hace visible de un
 * vistazo, que es justamente lo que no se podía hacer cuando esto eran dos
 * constantes (`FIRST_AT` y `REPEAT_EVERY`) y un solo jefe repetido para
 * siempre con más vida.
 *
 * NUNCA HAY DOS ÉLITES A LA VEZ. Si la de turno sigue viva cuando le toca a la
 * siguiente, la siguiente espera. Sin esa regla, un jugador lento acumularía
 * minijefes hasta volver la pantalla ilegible, y peor: un jefe podría aparecer
 * arriba de un minijefe, y "el jefe pelea solo" dejaría de ser cierto.
 *
 * Cuando la tabla se termina se vuelve a recorrer desde arriba, una élite cada
 * CONFIG.BOSS.LOOP_EVERY segundos, con más vida en cada vuelta. La vida NO
 * escala dentro de la primera vuelta: los números de ENEMY_DEFS son la curva
 * que alguien diseñó, y multiplicarlos ahí la borraría.
 */
export const ELITE_SCHEDULE = [
  { at: 40, key: 'BRUTE' },
  { at: 80, key: 'CUBE_KING' },
  { at: 125, key: 'STALKER' },
  { at: 165, key: 'WARDEN' },
  { at: 210, key: 'REAPER' },
  { at: 255, key: 'STALKER' },
  { at: 290, key: 'BRUTE' },
  { at: 335, key: 'WARDEN' },
  { at: 385, key: 'COLOSSUS' },
]

/**
 * La entrada número `n` de la partida, contando las vueltas.
 *
 * Devuelve un objeto nuevo, y está bien: se llama una vez por élite, no una vez
 * por frame. El BossController se guarda el resultado.
 *
 * @param {number} n cuántas élites ya aparecieron
 * @returns {{at:number, key:string, loop:number}}
 */
export function eliteAt(n) {
  const largo = ELITE_SCHEDULE.length
  const loop = Math.floor(n / largo)
  const fila = ELITE_SCHEDULE[n % largo]

  if (loop === 0) return { at: fila.at, key: fila.key, loop }

  // Pasada la tabla, el reloj deja de mirarla: se reparte parejo cada
  // LOOP_EVERY desde la última entrada escrita.
  const ultimo = ELITE_SCHEDULE[largo - 1].at
  return {
    at: ultimo + (n - largo + 1) * CONFIG.BOSS.LOOP_EVERY,
    key: fila.key,
    loop,
  }
}
