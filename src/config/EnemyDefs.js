/**
 * EnemyDefs — tabla de arquetipos de enemigo.
 *
 * Data-driven a propósito (GDD_v2 §4 Parte D aplica el mismo criterio a las
 * armas): agregar un tipo de enemigo nuevo es agregar una fila acá, no escribir
 * una subclase. La versión anterior del proyecto tenía la lógica de cada tipo
 * repartida en condicionales dentro de Enemy.js, y por eso cada balanceo
 * implicaba tocar código.
 *
 * El orden del array define el ID numérico que se guarda en el Uint8Array de
 * tipos dentro de EnemyManager. No reordenar sin razón.
 */
export const ENEMY_DEFS = [
  {
    key: 'NORMAL',
    name: 'Drone',
    hp: 30,
    speed: 3.2,
    radius: 0.45,
    damage: 10, // lo consume la Parte D (combate); acá solo se transporta
    xp: 1,
    color: 0xff4d6d,
  },
  {
    key: 'RUNNER',
    name: 'Runner',
    hp: 15,
    // Por debajo de CONFIG.PLAYER.SPEED (6.0) a propósito: tiene que ser
    // amenazante pero siempre esquivable corriendo en línea recta.
    speed: 5.2,
    radius: 0.33,
    damage: 6,
    xp: 2,
    color: 0xffd166,
  },
  {
    key: 'TANK',
    /**
     * Frena las balas sin ser blanco prioritario: eso lo convierte en un
     * escudo andante para la horda, que es lo único interesante que puede
     * aportar un enemigo gordo y lento.
     */
    blocksShots: true,
    name: 'Tank',
    hp: 80,
    speed: 1.9,
    radius: 0.8,
    damage: 20,
    xp: 5,
    color: 0x8b5cf6,
  },
  {
    /**
     * El boss es un arquetipo de enemigo más, NO una entidad aparte.
     *
     * Es la decisión de fondo de la Parte F. La alternativa — una clase Boss
     * propia — obligaba a enseñarle su existencia al apuntado de las armas, a la
     * colisión de los proyectiles, a las tres skills y al daño por contacto:
     * cinco lugares distintos, cada uno una oportunidad de que el boss quede
     * inmune a algo por olvido. Viviendo acá, todo eso funciona sin escribir una
     * sola línea nueva.
     *
     * Lo que no se puede expresar como número (embestidas, golpes de área) está
     * en BossDefs.js y lo ejecuta BossController.
     *
     * No puede salir en una oleada normal: WAVE_STAGES solo nombra NORMAL,
     * RUNNER y TANK.
     */
    key: 'BOSS',
    /** Blanco prioritario: el arma le apunta aunque no sea el más cercano. */
    priorityTarget: true,
    /** Frena las balas. La basura no; él sí. Ver ProjectileManager. */
    blocksShots: true,
    name: 'The Cube King',
    hp: 5000,
    speed: 2.3,
    radius: 2.6,
    damage: 35,
    xp: 120,
    color: 0xffd166,
    /** Nadie lo empuja y la multitud nunca lo bloquea. */
    heavy: true,
  },
]

/** Índice por clave, para no buscar por string en el loop. */
export const ENEMY_TYPE = {}
for (let i = 0; i < ENEMY_DEFS.length; i++) ENEMY_TYPE[ENEMY_DEFS[i].key] = i
