/**
 * VfxDefs — las explosiones de partículas del juego.
 *
 * Igual que los sonidos y las armas: una fila por efecto, ninguna clase. El
 * ParticleSystem sabe emitir *una* forma de explosión y todo lo demás sale de
 * acá, así que agregar un efecto nuevo es agregar una fila.
 *
 * GRAMÁTICA DE UNA FILA
 *
 *   count       cuántas partículas
 *   speed       velocidad inicial, en u/s
 *   speedVar    cuánto varía esa velocidad (0.4 = ±40%)
 *   up          empuje vertical extra; 0 = explosión plana, pegada al piso
 *   life        segundos que dura cada partícula
 *   lifeVar     variación de esa duración
 *   size        lado del cubo, en unidades
 *   sizeVar     variación del tamaño
 *   gravity     si le pega la gravedad (las chispas sí, el fogonazo no)
 *   color       color base; si falta, lo pone quien la dispara
 *   fade        'shrink' se achica hasta desaparecer, 'none' se apaga entero
 *
 * NOTA DE ESTILO: los colores son brillantes a propósito. El estilo definido en
 * el GDD §6.1 es neón oscuro, y el bloom solo florece lo que pasa el umbral —
 * una partícula apagada no produce luz, produce basura visual.
 */
export const VFX_DEFS = {
  /** Muerte de un enemigo. Es el efecto más frecuente del juego. */
  DEATH: {
    count: 7,
    speed: 5.5,
    speedVar: 0.5,
    up: 3.2,
    life: 0.45,
    lifeVar: 0.35,
    size: 0.26,
    sizeVar: 0.4,
    gravity: true,
    fade: 'shrink',
  },

  /** Fogonazo del arma. Corto, brillante y sin gravedad: es luz, no material. */
  MUZZLE: {
    count: 4,
    speed: 7,
    speedVar: 0.45,
    up: 0.6,
    life: 0.09,
    lifeVar: 0.3,
    size: 0.2,
    sizeVar: 0.35,
    gravity: false,
    fade: 'shrink',
  },

  /** Impacto de bala. Mínimo: suena decenas de veces por segundo. */
  HIT: {
    count: 3,
    speed: 4,
    speedVar: 0.5,
    up: 2,
    life: 0.22,
    lifeVar: 0.3,
    size: 0.13,
    sizeVar: 0.4,
    gravity: true,
    fade: 'shrink',
  },

  /** Te pegaron. Rojo y hacia arriba: tiene que verse aunque mires otra cosa. */
  PLAYER_HIT: {
    count: 14,
    speed: 6,
    speedVar: 0.5,
    up: 5,
    life: 0.6,
    lifeVar: 0.3,
    size: 0.24,
    sizeVar: 0.35,
    gravity: true,
    color: 0xff2244,
    fade: 'shrink',
  },

  /** Golpe de área del boss: anillo de escombros ancho y pesado. */
  BOSS_SLAM: {
    count: 34,
    speed: 13,
    speedVar: 0.35,
    up: 6.5,
    life: 0.9,
    lifeVar: 0.35,
    size: 0.42,
    sizeVar: 0.45,
    gravity: true,
    color: 0xff8a3d,
    fade: 'shrink',
  },

  /** Muerte del boss. El más grande del juego, y el único que se ve venir. */
  BOSS_DEATH: {
    count: 60,
    speed: 15,
    speedVar: 0.5,
    up: 11,
    life: 1.5,
    lifeVar: 0.4,
    size: 0.55,
    sizeVar: 0.5,
    gravity: true,
    color: 0xff5577,
    fade: 'shrink',
  },

  /** Subiste de nivel: columna de chispas desde tus pies. */
  LEVEL_UP: {
    count: 26,
    speed: 3.4,
    speedVar: 0.6,
    up: 9,
    life: 0.85,
    lifeVar: 0.35,
    size: 0.2,
    sizeVar: 0.4,
    gravity: true,
    color: 0x8bffb0,
    fade: 'shrink',
  },
}
