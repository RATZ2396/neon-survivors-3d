/**
 * GameConfig — única fuente de verdad para balance y tuning.
 *
 * Regla del proyecto (GDD_v2 §1): ningún valor mágico vive dentro de una clase.
 * Si querés cambiar cómo se siente el juego, se cambia acá y en ningún otro lado.
 */

export const CONFIG = {
  PLAYER: {
    /**
     * Modelo de movimiento: ARCADE PURO.
     *
     * Decisión de diseño explícita (GDD_v2 Parte A). El historial del proyecto
     * anterior muestra 6 archivos "*-fix.js" persiguiendo esta misma sensación
     * por prueba y error. Acá queda definida de entrada:
     *
     *   - Sin inercia: al soltar la tecla, la velocidad es 0 en ese mismo frame.
     *   - Sin suavizado de entrada: input 1.0 = velocidad máxima inmediata.
     *   - Vector normalizado: la diagonal NO es más rápida que la ortogonal.
     *
     * Si algún día se quiere peso/deslizamiento, se agrega ACCEL/FRICTION acá
     * y se implementa en Player.update() — no con un script que parchee desde afuera.
     */
    SPEED: 6.0, // unidades / segundo
    RADIUS: 0.4,
    HEIGHT: 1.6,
    /** Velocidad de giro del mesh hacia la dirección de movimiento (rad/s aprox). */
    TURN_SMOOTHING: 14.0,
    MAX_HP: 100,
    /**
     * Invulnerabilidad tras recibir un golpe. Sin esto, veinte enemigos
     * tocándote en el mismo frame te matan instantáneamente y la horda deja de
     * ser un desafío para ser una pared.
     */
    INVULN_TIME: 0.7,
  },

  CAMERA: {
    /**
     * Cámara en 3ra persona ANGULADA y WORLD-LOCKED: sigue la posición del
     * jugador pero NO rota con él. En un survivor la legibilidad manda —
     * si la cámara girase con el personaje, perderías la noción de dónde
     * viene la horda. El input WASD es relativo al mundo, no a la cámara,
     * lo que elimina toda una clase de bugs de control.
     */
    OFFSET: { x: 0, y: 11, z: 9 }, // desplazamiento respecto del jugador
    LOOK_HEIGHT: 1.0, // mira un poco por encima de los pies del jugador
    FOV: 55,
    /** Suavizado del seguimiento; mayor = más pegada al jugador. */
    SMOOTHING: 9.0,
  },

  WORLD: {
    ARENA_SIZE: 120,
    GROUND_COLOR: 0x1b2430,
    GRID_COLOR: 0x2f3f52,
    FOG_COLOR: 0x0d1117,
    FOG_NEAR: 35,
    FOG_FAR: 95,
  },

  INPUT: {
    /** Por debajo de esto, el joystick se considera centrado. */
    DEADZONE: 0.15,
  },

  TIME: {
    /**
     * Techo de delta. Si la pestaña estuvo en segundo plano, el primer frame
     * al volver traería un delta enorme y teletransportaría a todo el mundo.
     */
    MAX_DELTA: 0.1,
  },

  ENEMIES: {
    /**
     * Techo duro de enemigos vivos. Dimensiona TODOS los Float32Array de
     * EnemyManager, que se reservan una sola vez al arrancar: durante la
     * partida no se asigna memoria por enemigo, ni al aparecer ni al morir.
     */
    MAX_ALIVE: 400,
    /**
     * Lado de la celda de la rejilla espacial. Debe ser >= al diámetro del
     * enemigo más grande (TANK: 0.8 * 2 = 1.6), o dos enemigos vecinos podrían
     * quedar a más de una celda de distancia y atravesarse sin ser comparados.
     */
    GRID_CELL: 2.0,
    /**
     * Fracción del solapamiento que se corrige en cada pasada (1 = resolución
     * completa: cada uno se corre la mitad del solape).
     *
     * Medido con la horda al techo (400) convergiendo sobre el jugador: con 0.7
     * quedaban 221 pares con más de 15% de solape, porque la persecución
     * comprime más rápido de lo que la separación resuelve.
     */
    SEPARATION: 1.0,
    /**
     * Pasadas de relajación por frame. Con una sola, en un amontonamiento denso
     * el empuje tarda un frame en propagarse a cada anillo de vecinos y los del
     * centro quedan aplastados. Dos pasadas alcanzan; más no cambia el resultado
     * y sí cuesta.
     */
    SEPARATION_PASSES: 2,
    /**
     * Margen para considerar que el de adelante "me está tocando" (1.0 = contacto
     * exacto). Un pelo por encima de 1 evita que el anillo vibre entre bloqueado
     * y libre frame a frame.
     */
    BLOCK_MARGIN: 1.04,
    /**
     * Coseno del semiángulo del cono "tengo a alguien adelante". 0.5 = 60°.
     * Más alto = cono más angosto = se bloquean menos y aprietan más.
     */
    BLOCK_CONE: 0.5,
    /** Velocidad de un enemigo bloqueado, como fracción de la suya. */
    BLOCKED_SPEED: 0.12,
    /** Balanceo vertical del mesh. Cosmético: cuesta un seno por enemigo. */
    BOB_AMPLITUDE: 0.09,
    BOB_SPEED: 7.0,
  },

  WAVES: {
    /** Radio de aparición alrededor del jugador; debe quedar fuera de cámara. */
    SPAWN_DISTANCE: 30,
    SPAWN_JITTER: 6,
    /**
     * Cada cuántos segundos se duplica la vida base de los enemigos. Junto con
     * la composición de oleada (WaveManager.STAGES) es la ÚNICA palanca de
     * escalado: así no aparecen multiplicadores mágicos repartidos por el código.
     */
    HP_DOUBLE_EVERY: 120,
  },

  COMBAT: {
    /**
     * Techo del pool de proyectiles. Si se llena, el disparo se pierde: el pool
     * NO crece. Un pool que crece bajo presión es un pool que no sirve — el pico
     * de memoria llega justo en el peor momento del juego.
     */
    MAX_PROJECTILES: 600,
    /** Altura a la que vuelan las balas (a la altura del pecho del jugador). */
    PROJECTILE_HEIGHT: 0.9,
    /** Holgura extra para el contacto enemigo-jugador; sin ella el golpe se
     *  siente injusto porque hay que estar exactamente encima. */
    CONTACT_MARGIN: 0.1,
    /**
     * Abanico mínimo cuando una mejora permanente le suma proyectiles a un arma
     * que dispara recto (la pistola con segundo cañón). Sin esto las dos balas
     * salen exactamente superpuestas y la mejora más cara del juego se ve como
     * si no hiciera nada.
     */
    IMPLIED_SPREAD_DEG: 6,
  },

  PROGRESSION: {
    /** Techo del pool de gemas. Si se llena, la XP se acredita directa (ver GemManager). */
    MAX_GEMS: 600,
    /** Radio de atracción base. Las mejoras lo agrandan. */
    MAGNET_RADIUS: 2.6,
    /** Velocidad a la que la gema vuela hacia el jugador una vez atraída. */
    MAGNET_SPEED: 16,
    /** Distancia a la que se recoge. */
    PICKUP_RADIUS: 0.7,

    /**
     * Curva de nivel: XP_BASE * XP_GROWTH^(nivel-1).
     * 1.32 da niveles rápidos al principio (5, 7, 9, 11...) y espaciados
     * después, que es el ritmo del género: mejoras seguidas al arrancar para
     * que la partida agarre forma, y decisiones más pesadas hacia el final.
     */
    XP_BASE: 5,
    XP_GROWTH: 1.32,

    /** Cuántas opciones se ofrecen al subir de nivel. */
    UPGRADE_CHOICES: 4,
    /** Techo de habilidades distintas: sin límite, a los 20 niveles tenés todo y no hay decisión. */
    MAX_SKILLS: 4,
  },

  BOSS: {
    /** Segundo en que aparece el primero (GDD v1: 60s). */
    FIRST_AT: 60,
    /** Y cada cuánto vuelve a aparecer otro después de ese. */
    REPEAT_EVERY: 120,
    /** Aparece a esta distancia: lo suficientemente lejos para verlo venir. */
    SPAWN_DISTANCE: 22,
    /** Vida extra por cada boss ya aparecido (+80% el segundo, +160% el tercero...). */
    HP_SCALE_PER_BOSS: 0.8,
    /**
     * Cuánto se estira el intervalo del spawner durante el duelo. Pelear al boss
     * adentro de una oleada entera no es difícil, es ruido visual.
     */
    SPAWN_SLOWDOWN: 2.5,
  },

  /**
   * Meta-progresión: lo que sobrevive al final de la partida.
   *
   * La recompensa premia las tres cosas que el juego pide: aguantar, matar y
   * ganarle al boss. Sobrevivir pesa más que matar porque matar ya se premia
   * solo (XP, niveles, habilidades) adentro de la partida.
   */
  META: {
    /** Moneda por segundo sobrevivido. */
    REWARD_PER_SECOND: 1.2,
    /** Moneda por baja. */
    REWARD_PER_KILL: 0.6,
    /** Moneda por boss derrotado. */
    REWARD_PER_BOSS: 60,
    /** Piso: una partida de diez segundos igual deja algo. */
    REWARD_MIN: 5,
  },

  DEV: {
    SHOW_DEBUG_PANEL: true,
  },
}
