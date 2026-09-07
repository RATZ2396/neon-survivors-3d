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
 * tipos dentro de EnemyManager. Ese ID no se persiste en ningún lado —no está
 * en el perfil ni en un archivo guardado— así que reordenar es seguro, pero
 * conviene no hacerlo sin motivo: los tres bloques de abajo están agrupados
 * para poder leerlos, no por casualidad.
 *
 * TRES BLOQUES, TRES PAPELES:
 *
 *   1. HORDA. Lo que aparece por oleada. Sale de WAVE_STAGES, que nombra estos
 *      tipos y ningún otro.
 *   2. MINIJEFES. Salen ADENTRO de la horda: el resto de la oleada sigue
 *      apareciendo mientras pelean. Son el escalón intermedio.
 *   3. JEFES. Salen casi solos: al aparecer limpian la arena y el spawner
 *      afloja doce veces. Son un duelo, no una oleada.
 *
 * Quién sale y cuándo no está acá: está en ELITE_SCHEDULE (BossDefs.js) para
 * los dos últimos bloques, y en WAVE_STAGES (WaveManager.js) para el primero.
 * Esta tabla dice QUÉ es cada uno, no cuándo aparece.
 *
 * `coin` es la moneda que suelta al morir, y cae al piso como la gema: hay
 * que ir a buscarla. Reemplazó al pago por baja que antes se cobraba solo al
 * terminar la partida (ver CONFIG.META).
 */
export const ENEMY_DEFS = [
  // ═══════════════════════════════════════════════════════════════════════
  // 1. LA HORDA
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: 'NORMAL',
    name: 'Drone',
    hp: 30,
    speed: 3.2,
    radius: 0.45,
    damage: 10,
    xp: 1,
    coin: 1,
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
    coin: 1,
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
    coin: 3,
    color: 0x8b5cf6,
  },
  {
    /**
     * Larva. No es peligrosa de a una: es peligrosa porque son muchas.
     *
     * Existe para que la horda pueda crecer en CANTIDAD sin crecer en vida
     * total. Subir el `batch` de una oleada de drones hace las dos cosas a la
     * vez y llega un punto en que el arma no da abasto y la partida se cae
     * sola; con larvas la pantalla se llena, cada bala sigue matando algo, y
     * la presión viene de que te rodean, que es de donde tiene que venir.
     */
    key: 'SWARM',
    name: 'Larva',
    hp: 8,
    speed: 4.4,
    radius: 0.25,
    damage: 4,
    xp: 1,
    coin: 1,
    color: 0x7ef0a0,
  },
  {
    /**
     * Mitosis: al morir se parte en dos larvas.
     *
     * Es el único enemigo cuya muerte EMPEORA tu situación inmediata, y por eso
     * cambia a qué le disparás: matarlo mientras lo tenés encima te deja dos
     * cosas encima. El campo `splits` lo lee EnemyManager.damage().
     *
     * Las crías heredan el multiplicador de vida del padre (ver _split): si no,
     * en el minuto seis se partiría en dos larvas de juguete y la mecánica
     * dejaría de significar nada.
     */
    key: 'SPLITTER',
    name: 'Mitosis',
    hp: 60,
    speed: 2.4,
    radius: 0.62,
    damage: 14,
    xp: 4,
    coin: 2,
    color: 0xff9f43,
    /** En qué se parte y de a cuántas. `into` NO puede ser algo que también se parta. */
    splits: { into: 'SWARM', count: 2, spread: 0.55 },
  },
  {
    /**
     * Cazador. El que siempre llega.
     *
     * Es `heavy`, que hasta ahora era exclusivo del jefe: no lo empuja la
     * separación y la multitud no lo bloquea. Todos los demás enemigos se
     * atascan entre ellos cuando la horda se amontona —es lo que te da tiempo
     * a escapar—; este atraviesa el amontonamiento y te alcanza igual.
     *
     * Es el castigo a la única estrategia dominante que tenía el juego: correr
     * en círculos arrastrando a todos atrás.
     */
    key: 'HUNTER',
    name: 'Cazador',
    hp: 45,
    speed: 4.8,
    radius: 0.42,
    damage: 16,
    xp: 3,
    coin: 2,
    color: 0xe2e8f0,
    heavy: true,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 2. MINIJEFES — salen entre la horda, que no para
  // ═══════════════════════════════════════════════════════════════════════
  {
    /**
     * El Bruto: embiste.
     *
     * NO es blanco prioritario, y es a propósito. La prioridad existe para que
     * el arma no ignore al jefe durante un duelo; un minijefe pelea rodeado de
     * basura, así que la prioridad se la comería igual el radio de guardia
     * (CONFIG.COMBAT.PRIORITY_GUARD_RADIUS) y solo serviría para ensuciar la
     * contabilidad de daño. Es grande: el apuntado automático lo encuentra
     * porque suele ser lo más cercano, no porque lo prefiera.
     */
    key: 'BRUTE',
    name: 'El Bruto',
    hp: 650,
    speed: 2.9,
    radius: 1.5,
    damage: 28,
    xp: 40,
    coin: 22,
    color: 0xd97706,
    heavy: true,
  },
  {
    /**
     * El Guardián: lento, enorme y frena las balas.
     *
     * Con la horda encima, un enemigo que bloquea disparos es mucho peor que
     * uno que pega fuerte: te obliga a moverte para tener línea de tiro justo
     * cuando moverte es lo más caro.
     */
    key: 'WARDEN',
    name: 'El Guardián',
    blocksShots: true,
    hp: 950,
    speed: 1.6,
    radius: 1.9,
    damage: 32,
    xp: 55,
    coin: 30,
    color: 0x60a5fa,
    heavy: true,
  },
  {
    /** El Acechador: poca vida, mucha velocidad y una embestida que avisa poco. */
    key: 'STALKER',
    name: 'El Acechador',
    hp: 420,
    speed: 3.6,
    radius: 1.1,
    damage: 22,
    xp: 35,
    coin: 18,
    color: 0x14b8a6,
    heavy: true,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 3. JEFES — el duelo
  // ═══════════════════════════════════════════════════════════════════════
  {
    /**
     * Un jefe es un arquetipo de enemigo más, NO una entidad aparte.
     *
     * Es la decisión de fondo de la Parte F. La alternativa — una clase Boss
     * propia — obligaba a enseñarle su existencia al apuntado de las armas, a la
     * colisión de los proyectiles, a las tres skills y al daño por contacto:
     * cinco lugares distintos, cada uno una oportunidad de que el jefe quede
     * inmune a algo por olvido. Viviendo acá, todo eso funciona sin escribir una
     * sola línea nueva.
     *
     * Lo que no se puede expresar como número (embestidas, golpes de área) está
     * en BossDefs.js y lo ejecuta BossController.
     *
     * Ninguno de estos puede salir en una oleada normal: WAVE_STAGES solo nombra
     * los seis tipos del primer bloque.
     */
    key: 'CUBE_KING',
    /** Blanco prioritario: el arma le apunta aunque no sea el más cercano. */
    priorityTarget: true,
    /** Frena las balas. La basura no; él sí. Ver ProjectileManager. */
    blocksShots: true,
    name: 'The Cube King',
    /**
     * Medido con la pistola base: el jefe recibía 43 de daño por segundo, así
     * que 5000 de vida eran 116 segundos de fuego sostenido — y durante ese
     * tiempo la horda se acumula. No era una pelea difícil, era una carrera
     * perdida. Con 2500 el duelo dura ~58 segundos con el arma sin mejorar, y
     * bastante menos con el taller hecho.
     */
    hp: 2500,
    speed: 2.3,
    radius: 2.6,
    damage: 35,
    xp: 120,
    /** Lo que valía un jefe en la fórmula vieja, ahora en el piso. */
    coin: 60,
    color: 0xffd166,
    /** Nadie lo empuja y la multitud nunca lo bloquea. */
    heavy: true,
  },
  {
    /**
     * El Segador: el jefe rápido.
     *
     * Es el único que embiste Y golpea el área. El Cube King no embiste porque
     * es lento y enorme y saltarte encima se sentiría injusto; este es angosto
     * y visiblemente veloz, así que la embestida se lee como lo que hace, no
     * como una trampa. Menos vida que el Coloso a cambio de no dejarte
     * respirar.
     */
    key: 'REAPER',
    priorityTarget: true,
    blocksShots: true,
    name: 'El Segador',
    hp: 3200,
    speed: 3.0,
    radius: 2.2,
    damage: 40,
    xp: 160,
    coin: 80,
    color: 0xef4444,
    heavy: true,
  },
  {
    /**
     * El Coloso: el muro.
     *
     * Tan lento que caminar hacia atrás lo esquiva siempre — por eso su golpe
     * de área es el más grande y el más seguido del juego. Su pelea no es de
     * reflejos, es de no quedarte quieto disparando.
     */
    key: 'COLOSSUS',
    priorityTarget: true,
    blocksShots: true,
    name: 'El Coloso',
    hp: 5200,
    speed: 1.7,
    radius: 3.4,
    damage: 55,
    xp: 240,
    coin: 120,
    color: 0x94a3b8,
    heavy: true,
  },
]

/** Índice por clave, para no buscar por string en el loop. */
export const ENEMY_TYPE = {}
for (let i = 0; i < ENEMY_DEFS.length; i++) ENEMY_TYPE[ENEMY_DEFS[i].key] = i
