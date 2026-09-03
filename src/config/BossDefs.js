import { ENEMY_TYPE } from './EnemyDefs.js'

/**
 * BossDefs — lo que un boss hace, que no se puede escribir como un número suelto.
 *
 * Sus estadísticas (vida, velocidad, radio, daño de contacto, XP, color) NO
 * están acá: viven en ENEMY_DEFS, porque el boss ES un enemigo. Acá está solo
 * su comportamiento. Dos tablas, una misma clave.
 *
 * Un boss nuevo son dos filas: el arquetipo en ENEMY_DEFS y el comportamiento
 * acá. No una clase.
 *
 * Las dos habilidades están pensadas contra el problema real del género: un
 * enemigo lento y grande es trivial, alcanza con caminar hacia atrás. La
 * embestida castiga al que camina en línea recta; el golpe de área castiga al
 * que se queda pegado disparando.
 */
export const BOSS_DEFS = [
  {
    key: 'CUBE_KING',
    enemyType: ENEMY_TYPE.BOSS,

    charge: {
      /** Segundos entre embestidas. */
      every: 6.5,
      /** Aviso previo: se frena y parpadea. Sin esto la embestida es injusta. */
      telegraph: 0.85,
      /** Velocidad durante la embestida (la normal es 2.3). */
      speed: 15,
      duration: 1.0,
      /** Color del parpadeo de aviso. */
      warnColor: 0xff4d6d,
    },

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
]

export const BOSS = {}
for (let i = 0; i < BOSS_DEFS.length; i++) BOSS[BOSS_DEFS[i].key] = i
