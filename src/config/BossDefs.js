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
 * Las habilidades son OPCIONALES. Un boss sin `charge` o sin `slam` en su fila
 * simplemente no usa esa habilidad: el BossController lo consulta antes de
 * ejecutarla. Quitarle un ataque a un boss es borrar una clave de esta tabla,
 * no tocar código.
 *
 * EL PROBLEMA DEL GÉNERO, que estas habilidades atacan: un enemigo lento y
 * grande es trivial, alcanza con caminar hacia atrás. El golpe de área castiga
 * al que se queda pegado disparando. La embestida castigaba al que camina en
 * línea recta — pero se le sacó al Cube King por decisión de diseño: que algo
 * te salte encima a seis veces su velocidad se siente injusto aunque avise, y
 * en un juego donde lo único que controlás es moverte, el ataque que te
 * persigue a más velocidad de la que podés correr no deja jugar, deja aguantar.
 *
 * El bloque `charge` sigue soportado y probado (ver tests/index.js): un boss
 * futuro puede volver a activarlo agregando la clave.
 */
export const BOSS_DEFS = [
  {
    key: 'CUBE_KING',
    enemyType: ENEMY_TYPE.BOSS,

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
]

export const BOSS = {}
for (let i = 0; i < BOSS_DEFS.length; i++) BOSS[BOSS_DEFS[i].key] = i
