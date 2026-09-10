/**
 * SkillDefs — habilidades, en una tabla.
 *
 * Mismo criterio que WeaponDefs: no hay una clase por skill. Hay `kind`s, y
 * cada uno lo resuelve un método de SkillSystem:
 *
 *   ORBIT  — cuerpos girando alrededor del jugador que dañan al tocar
 *   STRIKE — un golpe puntual cada N segundos sobre un enemigo (el rayo del v1)
 *   FROST  — un campo pegado al jugador que FRENA y desgasta
 *   LURE   — un señuelo que la horda persigue en vez de a vos
 *   SWEEP  — un barrido en cono hacia donde te estás moviendo
 *   WEAPON — no hace daño por su cuenta: cambia cómo dispara TU arma
 *
 * DOS FAMILIAS, y la diferencia es el campo `weapon`:
 *
 *   Sin `weapon`   base compartida. La ve cualquier personaje.
 *   Con `weapon`   propia de ese arma. Solo aparece en el menú de nivel si
 *                  estás jugando con ella. Es lo que hace que elegir Pistola o
 *                  Escopeta cambie la partida entera y no solo cómo disparás.
 *
 * Las de `kind: WEAPON` no dibujan nada ni recorren la horda: publican
 * modificadores en el objeto de WeaponMods.js, que leen WeaponSystem y
 * ProjectileManager. Misma regla de siempre — NUNCA se muta WEAPON_DEFS.
 *
 * TRES QUE SE SACARON, las tres por decisión de diseño y no porque fallaran:
 * AURA ("Campo de fuerza", un círculo pegado al jugador), DRONE
 * (acompañantes que disparaban solos) y PULSE ("Onda expansiva", que dañaba
 * y empujaba). El dron chocaba con la regla que ordena todo esto: un
 * personaje, un arma — un acompañante que dispara por su cuenta es una
 * segunda arma con otro nombre.
 *
 * La onda se fue por una razón medida: su empuje NO mueve a los `heavy`, y
 * hoy hay siete —el Cazador y las seis élites—, o sea que su rasgo distintivo
 * no funcionaba contra ninguna de las cosas que te matan. La reemplaza
 * `Escarcha`, que frena en vez de empujar: frenar sí les funciona.
 *
 * `levels` es explícito nivel por nivel, no una fórmula base+incremento. Es más
 * texto pero se lee de un vistazo qué pasa en cada nivel, y balancear no obliga
 * a resolver una progresión geométrica en la cabeza.
 */

export const SKILL_KIND = {
  ORBIT: 'ORBIT',
  STRIKE: 'STRIKE',
  FROST: 'FROST',
  LURE: 'LURE',
  SWEEP: 'SWEEP',
  WEAPON: 'WEAPON',
}

export const SKILL_DEFS = [
  // ═══════════════════════════════════════════════════════════════════════
  // BASE — las ve cualquier personaje
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: 'SAWS',
    name: 'Sierras',
    desc: 'Sierras girando a tu alrededor. Cortan lo que se acerque.',
    kind: SKILL_KIND.ORBIT,
    color: 0x39d0ff,
    /**
     * Era `Escudo orbital` y eran orbes. Los números no cambiaron: cambió qué
     * son. Un escudo dice "esto me protege" y lo que hace es cortar al que se
     * acerca — la sierra dice la verdad, y de paso explica por qué te conviene
     * dejar que se acerquen.
     */
    // count: sierras · dps: daño por segundo de contacto · radius: órbita
    // spin: vueltas por segundo · size: radio de la sierra
    levels: [
      { count: 2, dps: 20, radius: 2.0, spin: 0.35, size: 0.3 },
      { count: 3, dps: 26, radius: 2.1, spin: 0.38, size: 0.3 },
      { count: 3, dps: 34, radius: 2.3, spin: 0.42, size: 0.34 },
      { count: 4, dps: 44, radius: 2.4, spin: 0.46, size: 0.34 },
      { count: 5, dps: 58, radius: 2.6, spin: 0.5, size: 0.38 },
    ],
  },
  {
    key: 'STRIKE',
    name: 'Rayo',
    desc: 'Cae sobre el enemigo más cercano cada pocos segundos.',
    kind: SKILL_KIND.STRIKE,
    color: 0xffd166,
    levels: [
      { damage: 45, radius: 2.6, interval: 3.0 },
      { damage: 60, radius: 2.8, interval: 2.7 },
      { damage: 80, radius: 3.0, interval: 2.4 },
      { damage: 105, radius: 3.2, interval: 2.1 },
      { damage: 140, radius: 3.5, interval: 1.8 },
    ],
  },
  {
    key: 'FROST',
    name: 'Escarcha',
    desc: 'Un campo helado te sigue: lo que entra se arrastra, y se va gastando.',
    kind: SKILL_KIND.FROST,
    color: 0xa5f3fc,
    /**
     * REEMPLAZA A `Onda expansiva`, y la razón es una sola: el empuje no mueve
     * a los `heavy`. Hoy hay siete —el Cazador y las seis élites—, así que el
     * rasgo que distinguía a la onda no servía contra nada de lo que te mata.
     *
     * Frenar sí les funciona. Esta es hoy la ÚNICA carta del juego que le hace
     * algo a un minijefe además de daño, y por eso su daño por segundo es bajo:
     * lo que comprás es el control, no la matanza.
     *
     * `slow` es un multiplicador de velocidad, no un porcentaje restado: 0.75
     * es "se mueve a tres cuartos". Se publica como ZONA (ver
     * EnemyManager.slowZones) y no como marca por enemigo, porque el
     * swap-remove mueve los índices y una marca terminaría frenando al que
     * ocupó el hueco.
     */
    levels: [
      { radius: 3.6, slow: 0.75, dps: 8 },
      { radius: 4.0, slow: 0.68, dps: 11 },
      { radius: 4.4, slow: 0.6, dps: 15 },
      { radius: 4.9, slow: 0.52, dps: 20 },
      { radius: 5.4, slow: 0.45, dps: 26 },
    ],
  },
  {
    key: 'LURE',
    name: 'Señuelo',
    desc: 'Dejás un cebo donde estás parado. La horda corre hacia él, no hacia vos.',
    kind: SKILL_KIND.LURE,
    color: 0xff6bd6,
    /**
     * La única herramienta de escape del juego, y no rompe la regla de que lo
     * único que controlás es dónde estás parado: no te mueve a vos, mueve a
     * ellos. Por eso también entra donde no entra nada — un `heavy` no se
     * empuja, pero sí persigue otra cosa.
     *
     * No hace daño, y es a propósito: si además matara, sería una bomba con
     * una ventaja escondida en vez de una decisión de posición.
     *
     * `radius` es a quién convence, no cuánto dura el cebo en el piso.
     */
    levels: [
      { interval: 9.0, duration: 2.5, radius: 7 },
      { interval: 8.0, duration: 3.0, radius: 8 },
      { interval: 7.0, duration: 3.5, radius: 9 },
      { interval: 6.2, duration: 4.0, radius: 10 },
      { interval: 5.5, duration: 4.5, radius: 11 },
    ],
  },
  {
    key: 'SWEEP',
    name: 'Guadaña',
    desc: 'Un tajo cada pocos segundos, hacia donde estás caminando.',
    kind: SKILL_KIND.SWEEP,
    color: 0xd4ff4d,
    /**
     * Es el pulso, pero direccional: en vez de premiarte por estar rodeado, te
     * premia por meterte. Apunta hacia donde CAMINA el cuerpo, no hacia donde
     * mira el torso — el torso sigue al blanco del arma (ver Player), así que
     * usar eso la volvería un segundo cañón en vez de un movimiento.
     *
     * `arc` está en grados y es el cono completo, no el semiángulo.
     */
    levels: [
      { damage: 40, radius: 4.5, arc: 100, interval: 2.6 },
      { damage: 55, radius: 5.0, arc: 105, interval: 2.4 },
      { damage: 72, radius: 5.5, arc: 110, interval: 2.2 },
      { damage: 95, radius: 6.0, arc: 115, interval: 2.0 },
      { damage: 125, radius: 6.5, arc: 120, interval: 1.8 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // PISTOLA — precisión y distancia
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: 'PISTOL_RICOCHET',
    weapon: 'PISTOL',
    name: 'Rebote',
    desc: 'Al quedarse sin penetración, la bala salta al siguiente enemigo.',
    kind: SKILL_KIND.WEAPON,
    color: 0x39d0ff,
    // ricochet: saltos por bala · ricochetKeep: qué fracción del daño conserva
    levels: [
      { mods: { ricochet: 1, ricochetKeep: 0.6 } },
      { mods: { ricochet: 1, ricochetKeep: 0.75 } },
      { mods: { ricochet: 2, ricochetKeep: 0.75 } },
      { mods: { ricochet: 2, ricochetKeep: 0.85 } },
      { mods: { ricochet: 3, ricochetKeep: 0.85 } },
    ],
  },
  // ACÁ ESTABA `Cañón trasero`, y en la escopeta `Abanico trasero`: las dos
  // repetían la andanada 180° hacia atrás. Un solo tipo disparando por la
  // espalda sin darse vuelta se veía falso, y lo era. Lo que resuelven —que
  // la horda te rodea— ahora lo hace un compañero de verdad, que se elige
  // en este mismo menú de nivel (ver Squad.js y UpgradeDefs).
  {
    key: 'PISTOL_PIERCE',
    weapon: 'PISTOL',
    name: 'Perforación total',
    desc: 'Atraviesa a los que frenan balas — tanque y boss incluidos.',
    kind: SKILL_KIND.WEAPON,
    color: 0x39d0ff,
    levels: [
      { mods: { pierceAll: 1, pierceAdd: 0 } },
      { mods: { pierceAll: 1, pierceAdd: 1 } },
      { mods: { pierceAll: 1, pierceAdd: 2 } },
      { mods: { pierceAll: 1, pierceAdd: 3 } },
      { mods: { pierceAll: 1, pierceAdd: 4 } },
    ],
  },

  {
    key: 'PISTOL_DUAL',
    weapon: 'PISTOL',
    name: 'Dual',
    desc: 'Desenfundás la segunda pistola. Disparan alternadas, al mismo blanco.',
    kind: SKILL_KIND.WEAPON,
    color: 0x39d0ff,
    /**
     * `dual` parte la recarga entre las manos (ver WeaponSystem.cooldownMult),
     * así que la derecha conserva EXACTAMENTE la cadencia de la tabla y lo que
     * se compra es la izquierda. Por eso el único número que sube por nivel es
     * `dualDamage`.
     *
     * Y por eso no llega a 1: contra un mismo blanco, una izquierda al 100%
     * sería el doble de daño sin ninguna condición, y las otras dos de la
     * pistola sí la tienen — Rebote necesita multitud y Perforación total
     * necesita algo que frene balas. Al 80% queda en +45% a +80%, en línea con
     * `Doble cañón`.
     */
    levels: [
      { mods: { dual: 1, dualDamage: 0.45 } },
      { mods: { dual: 1, dualDamage: 0.55 } },
      { mods: { dual: 1, dualDamage: 0.63 } },
      { mods: { dual: 1, dualDamage: 0.72 } },
      { mods: { dual: 1, dualDamage: 0.8 } },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ESCOPETA — encima, ancho, empuje
  // ═══════════════════════════════════════════════════════════════════════
  // ACÁ ESTABA `Impacto`, que empujaba con cada perdigón. Se fue, y con ella
  // el modificador `knockback` y el `_knockback()` del pool: no quedaba nadie
  // que los escribiera, y código que nada ejecuta es el problema que documenta
  // el GDD §0.2. Lo que la condenó es que el empuje NO MUEVE A LOS `heavy` —
  // hoy son siete, el Cazador y las seis élites—, o sea que su rasgo
  // distintivo no le hacía nada a ninguna de las cosas que te matan. Mismo
  // motivo por el que se fue `Onda expansiva` de la base.
  //
  // Las tres de la escopeta ahora cambian LA FORMA DEL DISPARO, que es lo que
  // se ve: el abanico se endereza (Muro), se multiplica en el aire (Racimo) o
  // barre a los costados (Doble cañón).
  {
    key: 'SHOTGUN_WALL',
    weapon: 'SHOTGUN',
    name: 'Muro',
    desc: 'Los perdigones dejan de abrirse: salen en paralelo, hombro con hombro.',
    kind: SKILL_KIND.WEAPON,
    color: 0xffd166,
    /**
     * Un abanico se despeina con la distancia: a 13 unidades, los 34° de la
     * escopeta son casi 8 de ancho y los perdigones llegan sueltos. Una pared
     * paralela mide lo mismo a 1 que a 13, así que la escopeta deja de perder
     * densidad sin ganar ni un metro de alcance — su punto débil sigue siendo
     * su punto débil.
     */
    levels: [
      { mods: { wall: 1, wallGap: 0.35, wallDamage: 1.0 } },
      { mods: { wall: 1, wallGap: 0.4, wallDamage: 1.03 } },
      { mods: { wall: 1, wallGap: 0.45, wallDamage: 1.08 } },
      { mods: { wall: 1, wallGap: 0.5, wallDamage: 1.14 } },
      { mods: { wall: 1, wallGap: 0.55, wallDamage: 1.22 } },
    ],
  },
  {
    key: 'SHOTGUN_CLUSTER',
    weapon: 'SHOTGUN',
    name: 'Racimo',
    desc: 'Cada perdigón revienta a mitad de camino y se abre en crías.',
    kind: SKILL_KIND.WEAPON,
    color: 0xffd166,
    /**
     * El disparo pasa a tener dos tiempos: sale como una escopeta y llega como
     * una lluvia. Y como revienta pasado el 60% del vuelo, encima te sigue
     * pegando el racimo entero SIN abrirse — la habilidad no le regala alcance,
     * le agrega una segunda mitad.
     *
     * Las crías no atraviesan ni se vuelven a partir. Con seis perdigones de
     * base, tres crías cada uno ya son 24 proyectiles por andanada.
     */
    levels: [
      { mods: { cluster: 2, clusterDamage: 0.35, clusterAt: 0.55 } },
      { mods: { cluster: 2, clusterDamage: 0.4, clusterAt: 0.56 } },
      { mods: { cluster: 2, clusterDamage: 0.45, clusterAt: 0.58 } },
      { mods: { cluster: 3, clusterDamage: 0.5, clusterAt: 0.59 } },
      { mods: { cluster: 3, clusterDamage: 0.55, clusterAt: 0.6 } },
    ],
  },
  {
    key: 'SHOTGUN_DOUBLE',
    weapon: 'SHOTGUN',
    name: 'Doble cañón',
    desc: 'Ráfaga de andanadas, y cada una barre un poco más al costado.',
    kind: SKILL_KIND.WEAPON,
    color: 0xffd166,
    /**
     * `burstCooldown` multiplica la recarga a propósito: sin ese costo esto no
     * sería un ritmo distinto, sería cadencia gratis. La ganancia real son
     * andanadas por segundo, y va de +29% en el nivel 1 a +94% en el 5.
     *
     * `burstSpread` es lo que la vuelve visible. Antes las andanadas de la
     * ráfaga salían TODAS al mismo ángulo, o sea apiladas una encima de otra:
     * se oían tres tiros y se veía uno. Ahora cada una se corre unos grados,
     * alternando lados, y la ráfaga PINTA un barrido — a nivel 5 son los 34°
     * propios del arma más ±22°, casi 80° de frente cubierto.
     */
    levels: [
      { mods: { burst: 1, burstDelay: 0.14, burstCooldown: 1.55, burstSpread: 14 } },
      { mods: { burst: 1, burstDelay: 0.13, burstCooldown: 1.42, burstSpread: 16 } },
      { mods: { burst: 1, burstDelay: 0.12, burstCooldown: 1.3, burstSpread: 18 } },
      { mods: { burst: 2, burstDelay: 0.12, burstCooldown: 1.75, burstSpread: 20 } },
      { mods: { burst: 2, burstDelay: 0.11, burstCooldown: 1.55, burstSpread: 22 } },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // METRALLETA — no parar nunca
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: 'SMG_RAMP',
    weapon: 'SMG',
    name: 'Calentamiento',
    desc: 'Mientras no dejes de disparar, recarga cada vez más rápido.',
    kind: SKILL_KIND.WEAPON,
    color: 0x8bffb0,
    // ramp: reducción máxima de recarga · rampTime: segundos hasta el máximo
    levels: [
      { mods: { ramp: 0.15, rampTime: 3.5 } },
      { mods: { ramp: 0.22, rampTime: 3.2 } },
      { mods: { ramp: 0.29, rampTime: 2.9 } },
      { mods: { ramp: 0.35, rampTime: 2.6 } },
      { mods: { ramp: 0.42, rampTime: 2.2 } },
    ],
  },
  {
    key: 'SMG_PARALLEL',
    weapon: 'SMG',
    name: 'Doble línea',
    desc: 'Balas paralelas, no en abanico. Como duplicar la cadencia.',
    kind: SKILL_KIND.WEAPON,
    color: 0x8bffb0,
    // parallel: balas extra · parallelGap: separación · parallelDamage: fracción
    levels: [
      { mods: { parallel: 1, parallelGap: 0.45, parallelDamage: 0.6 } },
      { mods: { parallel: 1, parallelGap: 0.45, parallelDamage: 0.75 } },
      { mods: { parallel: 1, parallelGap: 0.5, parallelDamage: 0.9 } },
      { mods: { parallel: 2, parallelGap: 0.5, parallelDamage: 0.75 } },
      { mods: { parallel: 2, parallelGap: 0.55, parallelDamage: 0.9 } },
    ],
  },
  {
    key: 'SMG_BOOM',
    weapon: 'SMG',
    name: 'Bala explosiva',
    desc: 'Cada tantas balas, una estalla al impactar.',
    kind: SKILL_KIND.WEAPON,
    color: 0x8bffb0,
    // El pool de proyectiles ya sabía explotar (explodeRadius): esto lo enciende.
    levels: [
      { mods: { boomEvery: 12, boomRadius: 2.0, boomDamage: 22 } },
      { mods: { boomEvery: 10, boomRadius: 2.2, boomDamage: 30 } },
      { mods: { boomEvery: 9, boomRadius: 2.4, boomDamage: 40 } },
      { mods: { boomEvery: 8, boomRadius: 2.6, boomDamage: 52 } },
      { mods: { boomEvery: 6, boomRadius: 2.8, boomDamage: 68 } },
    ],
  },
]

export const SKILL = {}
for (let i = 0; i < SKILL_DEFS.length; i++) SKILL[SKILL_DEFS[i].key] = i

// Adrede NO hay un MAX_SKILL_LEVEL global: el tope es `def.levels.length`,
// por habilidad, y lo aplica SkillSystem. Un techo global tendria que salir
// de una habilidad cualquiera y valdria solo mientras todas tengan la misma
// cantidad de niveles — o sea, hasta la primera que no.
