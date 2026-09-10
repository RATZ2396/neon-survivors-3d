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
    /**
     * APUNTADO DEL MODELO. Cuánto tiempo sigue mirando a lo que le disparó
     * después del disparo, como múltiplo de la recarga del arma, con un piso.
     *
     * Sin esto el muñeco solo miraba al blanco en el frame exacto del
     * disparo y volvía a mirar hacia donde caminaba: con la metralleta eso
     * es un temblor ocho veces por segundo. El múltiplo hace que se ajuste
     * solo a cada arma — la escopeta tarda 0.95s entre disparos y necesita
     * mantener la mira mucho más que la metralleta.
     */
    AIM_HOLD_FACTOR: 1.6,
    AIM_HOLD_MIN: 0.35,
    /**
     * Cuánto puede girar el torso sobre las caderas antes de que el cuerpo
     * entero acompañe, en radianes (~69°).
     *
     * Es lo que permite CAMINAR EN UNA DIRECCIÓN Y DISPARAR EN OTRA sin que
     * el muñeco patine de espaldas: las piernas van a donde te movés y el
     * torso, los brazos y el arma van al blanco. Pasado este ángulo la
     * cintura no da más y giran también las caderas.
     */
    AIM_TWIST_MAX: 1.2,
    /** Velocidad de giro del mesh hacia la dirección de movimiento (rad/s aprox). */
    TURN_SMOOTHING: 14.0,
    MAX_HP: 100,
    /**
     * Invulnerabilidad tras recibir un golpe. Sin esto, veinte enemigos
     * tocándote en el mismo frame te matan instantáneamente y la horda deja de
     * ser un desafío para ser una pared.
     */
    INVULN_TIME: 0.7,

    /**
     * REGENERACIÓN. Segundos sin recibir daño antes de empezar a curarse, y a
     * qué ritmo.
     *
     * La demora es lo que hace que esto no sea "más vida": es más de lo que
     * dura estar rodeado, así que no te salva de una mala pelea. Lo que arregla
     * es la otra cosa — que un raspón del minuto 2 te condene el resto de la
     * partida.
     *
     * ERAN 6 SEGUNDOS Y NO ALCANZABAN. Desde que el escuadrón comparte un solo
     * hitbox repartido en tres cuerpos te tocan mucho más seguido, y seis
     * segundos limpios casi no existen. Medido en una partida real: con 28
     * enemigos alrededor la vida quedó clavada en 30 durante seis segundos y
     * ganó UN punto. Una regeneración que nunca arranca es una regeneración que
     * no está.
     *
     * A 1.5/s, recuperar los 100 de vida completos son 67 segundos limpios.
     */
    REGEN_DELAY: 3.5,
    REGEN_PER_SECOND: 1.5,
  },

  CAMERA: {
    /**
     * Cámara en 3ra persona ANGULADA y WORLD-LOCKED: sigue la posición del
     * jugador pero NO rota con él. En un survivor la legibilidad manda —
     * si la cámara girase con el personaje, perderías la noción de dónde
     * viene la horda. El input WASD es relativo al mundo, no a la cámara,
     * lo que elimina toda una clase de bugs de control.
     *
     * El acercamiento se hizo bajando la cámara MÁS de lo que se la acercó
     * (y 11→9, z 9→8) y no las dos cosas por igual. Bajarla la inclina hacia
     * el horizonte, y eso devuelve por delante lo que el acercamiento quita:
     * medido a 16:9, el personaje se ve un 18% más grande y **se sigue viendo
     * exactamente igual de lejos hacia adelante** (20.5 u contra 20.4 antes).
     * Lo que se paga está atrás y a los costados: 6.2→5.2 u por detrás y
     * 13.7→11.8 a cada lado. Un corredor a 5.2 u/s ahora se ve venir por la
     * espalda con ~1 s de aviso en vez de ~1.2 s.
     */
    OFFSET: { x: 0, y: 9, z: 8 }, // desplazamiento respecto del jugador
    LOOK_HEIGHT: 1.0, // mira un poco por encima de los pies del jugador
    FOV: 55,
    /** Suavizado del seguimiento; mayor = más pegada al jugador. */
    SMOOTHING: 9.0,
    /**
     * Zoom con la rueda del mouse.
     *
     * Multiplica el OFFSET ENTERO —alto y profundidad juntos—, no solo la
     * distancia. Esa es la decisión: la cámara viaja por la MISMA LÍNEA, así
     * que acercarse no cambia su inclinación. Si solo se moviera en Z, acercar
     * aplastaría la perspectiva y terminarías mirando al personaje desde
     * arriba, que es justo lo que no sirve para verle el modelo.
     *
     * El mínimo llega bastante más cerca de lo que el juego necesita, a
     * propósito: es para mirarle el modelo al muñeco, no para jugar. El máximo
     * está atado a la niebla —FOG_FAR es 95—: más lejos, la arena se ve gris.
     *
     * El paso es multiplicativo y no aditivo para que un clic de rueda se
     * sienta igual de cerca que de lejos.
     */
    ZOOM: { MIN: 0.35, MAX: 1.8, STEP: 1.12 },
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

    /**
     * Separación entre las bocas de las dos pistolas de `Dual`, en unidades.
     *
     * No es decorativa: sin ella las dos manos disparan desde el mismo punto y
     * la habilidad más visible del arma se ve exactamente igual que no tenerla.
     */
    DUAL_MUZZLE_OFFSET: 0.22,

    /**
     * Apertura del racimo: en cuántos grados se abren las crías cuando un
     * perdigón se parte en el aire (`Racimo`, escopeta).
     *
     * Es fijo y no sube por nivel a propósito. Lo que se compra son crías y
     * daño; si además se abriera más, la habilidad tendría tres ejes y ninguno
     * se leería.
     */
    CLUSTER_ARC_DEG: 30,

    /**
     * Radio de amenaza para la elección de blanco.
     *
     * El arma prefiere al boss, pero NO si tenés basura pegada: dentro de este
     * radio manda lo que está encima tuyo. Sin esta condición la prioridad era
     * absoluta y el resultado, medido en una partida real, fue que el ritmo de
     * matar se caía a un tercio en cuanto aparecía el boss (de 1.37 a 0.46
     * bajas por segundo) mientras la horda trepaba de 1 a 28 enemigos. Le
     * pegabas al boss y te mataba lo que no estabas mirando.
     *
     * Un poco más grande que el alcance del cuerpo a cuerpo: lo que ya te está
     * por tocar cuenta como amenaza.
     */
    PRIORITY_GUARD_RADIUS: 6,

    /**
     * Hasta dónde busca la bala su próximo blanco al rebotar.
     *
     * Corto a propósito: si fuera el alcance del arma, una sola bala con
     * rebote barrería media arena y el precio de quedarse sin penetración
     * dejaría de existir. Nueve unidades es "el de al lado", no "el otro
     * lado del mapa".
     */
    RICOCHET_RANGE: 9,
  },

  PROGRESSION: {
    /**
     * Techo del pool de recolectables. Cada enemigo deja DOS cosas —gema y
     * moneda—, así que es el doble del que había cuando solo había gemas.
     * Si se llena, lo que no entra se acredita directo (ver PickupManager).
     */
    MAX_PICKUPS: 1200,
    /**
     * Radio de atracción base.
     *
     * Era 2.6 cuando existía la mejora `Imán`, que lo multiplicaba hasta
     * ×4 en una partida buena. Al sacarla, 2.6 fijo dejaba el piso
     * sembrado de cosas imposibles de juntar sin pasar por encima de cada
     * una. Se subió a 3.4 para compensar la mejora que ya no está: el imán
     * grande ahora aparece en el mapa y dura unos segundos, no es
     * permanente.
     */
    MAGNET_RADIUS: 3.4,
    /** Velocidad a la que lo atraído vuela hacia el jugador. */
    MAGNET_SPEED: 16,
    /** Distancia a la que se recoge. */
    PICKUP_RADIUS: 0.7,

    /** Cuánto cura el corazón que aparece en el mapa. */
    HEART_HEAL: 35,
    /**
     * El imán del mapa: cuántos segundos dura y cuánto acelera la
     * atracción mientras tanto. 2.5 s a 48 u/s alcanza para barrer una
     * arena de 120 de lado de punta a punta, que es lo que promete.
     */
    MAGNET_PICKUP_TIME: 2.5,
    MAGNET_PICKUP_BOOST: 3,

    /**
     * Bonus del mapa (corazón e imán). No los suelta nadie: aparecen solos
     * cerca tuyo pero no encima, para que ir a buscarlos sea una decisión.
     * El tope de cuántos hay a la vez evita que juntar polvo se convierta
     * en una reserva: si no vas, el mapa deja de ofrecerte.
     */
    BONUS_FIRST_AT: 20,
    BONUS_EVERY: 26,
    BONUS_MAX_ON_MAP: 3,
    BONUS_MIN_DIST: 9,
    BONUS_MAX_DIST: 24,

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

  /**
   * ÉLITES: los minijefes y los jefes.
   *
   * CUÁNDO APARECE CADA UNO YA NO ESTÁ ACÁ. Estaba: `FIRST_AT: 60` y
   * `REPEAT_EVERY: 120` alcanzaban para describir un solo jefe repetido para
   * siempre con más vida. Con seis élites distintas y una forma acordada
   * —horda, minijefe CON la horda, jefe casi solo— dos constantes no pueden
   * decir nada, así que el calendario se mudó a ELITE_SCHEDULE (BossDefs.js),
   * donde la partida entera se lee en una columna. Acá quedan los números que
   * valen para todas por igual.
   */
  /**
   * EL ESCUADRÓN: vos y hasta dos compañeros.
   *
   * Reemplaza a la habilidad `Cañón trasero`, que disparaba la misma
   * andanada 180° hacia atrás — un tipo tirando por la espalda sin darse
   * vuelta. Cubría el problema real (la horda te rodea) pero se veía falso,
   * porque lo era. Un compañero parado atrás disparando hacia atrás resuelve
   * lo mismo y es lo que el jugador ya creía estar viendo.
   */
  SQUAD: {
    /** Personajes a la vez, CONTANDO al principal. */
    MAX: 3,
    /**
     * LA FORMACIÓN ES UN CÍRCULO ALREDEDOR TUYO, y se describe en polares
     * justamente para que se lea como un círculo y no como dos puntos sueltos.
     *
     * Primero fueron dos posiciones fijas a (±2.0, 1.6) — 2.56 unidades de
     * distancia y 4 unidades de separación entre ellos. Con la cámara angulada
     * eso no se veía como un escuadrón: se veía como tres personas paradas
     * lejos una de otra, y el jugador ni las registraba como suyas.
     *
     * El radio manda sobre todo lo demás. 1.5 deja 0.7 unidades de aire entre
     * cuerpo y cuerpo (el jugador y cada compañero miden 0.4 de radio): pegados
     * sin encimarse.
     */
    RADIUS: 1.5,
    /**
     * Dónde se para cada uno sobre ese círculo, en grados. 0 es adelante (-Z,
     * hacia el fondo de la pantalla) y crece hacia la derecha, así que 180 es
     * justo detrás.
     *
     * Los dos van atrás, a los costados: nadie se para delante tuyo, porque
     * taparía lo único que necesitás ver, que es de dónde viene la horda.
     *
     * Los ángulos son DEL MUNDO, no de hacia dónde mirás. Atados a la
     * orientación, girar en el lugar los haría dar vueltas alrededor tuyo y la
     * cobertura de la espalda —que es todo el punto— cambiaría cada vez que
     * cambiás de dirección. Un puesto nuevo es un ángulo nuevo en esta lista.
     */
    ANGLES: [225, 135],
    /**
     * Qué tan pegado te sigue; mayor = menos rezagado.
     *
     * El rezago en régimen es velocidad/FOLLOW: con 6 y corriendo a 6 u/s se
     * quedaban una unidad atrás, que sobre un radio de 1.5 es casi el doble de
     * lejos. Con 10 el arrastre baja a 0.6 y siguen leyéndose como que te
     * siguen, no como que están pegados con cinta.
     */
    FOLLOW: 10.0,
    /**
     * Daño del compañero como fracción del arma.
     *
     * La habilidad que reemplaza llegaba al 100% del daño hacia atrás, pero
     * recién en su quinto nivel: cinco subidas de nivel. Un compañero es un
     * arma entera que llega completa por UNA elección, así que paga la
     * diferencia acá.
     */
    DAMAGE_MULT: 0.7,
    /**
     * ACÁ ESTABA `MAX_HP`, la vida propia de cada compañero, y se fue.
     *
     * El escuadrón tiene UN hitbox repartido en tres cuerpos y UNA sola vida:
     * la del jugador (ver ContactDamage). Tocar a un compañero es tocarte a
     * vos, y no se puede morir uno solo.
     *
     * Con vida propia se morían. Medido en una partida real: los dos duraron
     * 30 y 34 segundos, y el jugador terminó con 53 de 100. Tiene sentido —no
     * podés esquivar por ellos, te siguen a un puesto fijo—, y por eso
     * cobrarles una barra que no controlás era cobrar por algo que no se puede
     * jugar.
     */
    /** Radio del anillo de color en el piso que dice quién es cada uno. */
    RING_RADIUS: 0.55,
  },

  BOSS: {
    /** El jefe aparece a esta distancia: lejos, para verlo venir. */
    SPAWN_DISTANCE: 22,
    /**
     * El minijefe aparece mucho más cerca. Tiene que llegarte mezclado con la
     * oleada, no anunciado desde el horizonte: esa es la diferencia entre un
     * escalón intermedio y un duelo chico.
     */
    MINI_SPAWN_DISTANCE: 16,
    /** Cada cuánto sale una élite una vez agotado el calendario escrito. */
    LOOP_EVERY: 45,
    /**
     * Vida extra por VUELTA COMPLETA al calendario (+100% en la segunda).
     *
     * Antes era por élite aparecida, y con una sola no se notaba el problema:
     * con nueve, el cuarto minijefe tendría más vida que el primer jefe y la
     * curva escrita en ENEMY_DEFS no significaría nada. Solo escalan las
     * vueltas, que ya no son contenido diseñado sino tiempo extra.
     */
    HP_SCALE_PER_LOOP: 1.0,
    /**
     * Cuánto se estira el intervalo del spawner durante el duelo.
     *
     * EL BOSS PELEA SOLO. Estaba en 2.5 y no alcanzaba ni de lejos: medido en
     * partidas reales, la arena se rehacía de 1 a 68 enemigos mientras durabas
     * el duelo. Eso rompía las dos mitades del combate a la vez — el arma
     * nunca miraba al boss porque siempre tenía basura encima, y la basura te
     * mataba mientras mirabas al boss.
     *
     * Con 12 queda un goteo: alguna gema para recoger y algo de presión, pero
     * el duelo es un duelo.
     *
     * SOLO SE APLICA A LOS JEFES. El minijefe no lo toca: aparecer adentro de
     * una oleada entera es exactamente lo que hace y para lo que existe.
     */
    SPAWN_SLOWDOWN: 12,
  },

  /**
   * Meta-progresión: lo que sobrevive al final de la partida.
   *
   * La recompensa premia las tres cosas que el juego pide: aguantar, matar y
   * ganarle al boss. Sobrevivir pesa más que matar porque matar ya se premia
   * solo (XP, niveles, habilidades) adentro de la partida.
   */
  META: {
    /**
     * ACÁ FALTAN DOS CLAVES QUE EXISTÍAN: moneda por baja y moneda por boss.
     *
     * Se fueron cuando los enemigos empezaron a soltar monedas de verdad,
     * que hay que ir a juntar del piso (ver PickupDefs). Cobrar además por
     * cada baja al terminar la partida sería pagar dos veces lo mismo, y
     * peor: haría que juntarlas no importara. Lo que sueltan está en la
     * columna `coin` de ENEMY_DEFS.
     */
    /** Moneda por segundo sobrevivido. Es el único pago que no hay que juntar. */
    REWARD_PER_SECOND: 1.2,
    /** Piso: una partida de diez segundos igual deja algo. */
    REWARD_MIN: 5,
  },

  UI: {
    /**
     * Segundos que dura el cartel de controles al empezar la partida.
     *
     * Tiene que durar lo suficiente para leerlo con la horda encima y lo
     * bastante poco para no volverse parte del decorado: un cartel que no se
     * va deja de leerse a los diez segundos y a partir de ahí solo tapa.
     * Después de que se va, la tecla H y el botón "?" siguen estando.
     */
    HINTS_SECONDS: 12,

    /**
     * Números flotantes a la vez. Si se llena, se pisa el más viejo: acá lo
     * último que pasó es lo que importa (al revés que en las partículas, donde
     * lo nuevo se descarta porque son decoración).
     */
    FLOAT_MAX: 18,
    /** Segundos que dura cada número. */
    FLOAT_LIFE: 0.9,
    /** A qué velocidad sube, en u/s. */
    FLOAT_RISE: 2.2,
  },

  /**
   * VFX y post-procesado.
   *
   * PRESUPUESTO DE RENDIMIENTO, ESCRITO ANTES DE ENCENDER NADA (lo exige el
   * GDD Parte I, y con razón: en el prototipo anterior bloom + partículas sin
   * pooling fue de lo más caro en hardware modesto).
   *
   *   Objetivo:  60 fps con 400 enemigos, en la máquina de desarrollo.
   *   Piso:      si el promedio cae por debajo de DEGRADE_FPS durante
   *              DEGRADE_SECONDS seguidos, el bloom SE APAGA SOLO y no vuelve.
   *
   * NO hay un techo en milisegundos, y no es un olvido. Medir lo que cuesta el
   * bloom desde JavaScript no se puede: `performance.now()` alrededor de una
   * llamada WebGL mide el tiempo de ENVÍO en CPU, no el trabajo en GPU, que es
   * asíncrono; y lo único envolvible es `composer.render()`, que además del
   * bloom dibuja la escena entera. Un número así mentiría, y un presupuesto que
   * miente es peor que no tenerlo. Los fps sostenidos sí son observables, y son
   * además lo que el jugador siente.
   *
   * Ese apagado automático es el punto: una GPU integrada no tiene por qué
   * pagar el efecto, y el jugador no tiene por qué saber qué es un composer
   * para que el juego le ande. El juego se ve peor y se juega igual, que es el
   * orden correcto de prioridades.
   */
  VFX: {
    /** Partículas vivas a la vez. Pool fijo: si se llena, la nueva se pierde. */
    MAX_PARTICLES: 900,
    /** Gravedad de las partículas, en u/s². */
    GRAVITY: -14,
    /** Rozamiento por segundo: frena la explosión en vez de dejarla volar. */
    DRAG: 3.2,

    /**
     * Techo de densidad de píxeles por nivel de calidad (el ajuste
     * "Calidad" del menú de opciones).
     *
     * Es la palanca de rendimiento más grande y más barata que existe en un
     * juego 3D web: en una pantalla 3x, bajar el techo de 2 a 1 son cuatro
     * veces menos píxeles que sombrear, sin tocar una sola línea de la
     * simulación. El juego se ve más blando y corre igual de rápido en un
     * teléfono viejo, que es exactamente el trato que hay que ofrecer.
     */
    DPR_HIGH: 2,
    DPR_LOW: 1,

    BLOOM: true,
    /** Qué tan brillante tiene que ser un píxel para florecer (0..1). */
    BLOOM_THRESHOLD: 0.62,
    BLOOM_STRENGTH: 0.62,
    BLOOM_RADIUS: 0.45,

    /** Por debajo de estos fps sostenidos, el bloom se apaga solo. */
    DEGRADE_FPS: 45,
    DEGRADE_SECONDS: 4,
  },

  DEV: {
    /**
     * El panel de diagnóstico es una herramienta de desarrollo, no parte del
     * juego: en producción tapa la esquina de la pantalla con números que a un
     * jugador no le dicen nada. Se ata al modo de Vite en lugar de a un `true`
     * escrito a mano, porque un `true` a mano se olvida encendido y termina
     * publicado — que es exactamente lo que pasó.
     *
     * El `?.` no es decorativo: los tests corren en Node, donde
     * `import.meta.env` no existe.
     */
    SHOW_DEBUG_PANEL: import.meta.env?.DEV ?? false,
  },
}
