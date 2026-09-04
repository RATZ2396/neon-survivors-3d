/**
 * SkillDefs — habilidades, en una tabla.
 *
 * Mismo criterio que WeaponDefs: no hay una clase por skill. Hay `kind`s, y
 * cada uno lo resuelve un método de SkillSystem:
 *
 *   ORBIT  — orbes girando alrededor del jugador (el escudo orbital del GDD v1)
 *   STRIKE — un golpe puntual cada N segundos sobre un enemigo (el rayo del v1)
 *   PULSE  — una onda que sale del jugador: daña y EMPUJA
 *   DRONE  — acompañantes que disparan solos al más cercano
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
 * Hubo un tercer kind, AURA — "Campo de fuerza": un círculo fijo pegado al
 * jugador que dañaba todo lo que tuviera cerca. Se sacó por decisión de
 * diseño, no porque fallara.
 *
 * `levels` es explícito nivel por nivel, no una fórmula base+incremento. Es más
 * texto pero se lee de un vistazo qué pasa en cada nivel, y balancear no obliga
 * a resolver una progresión geométrica en la cabeza.
 */

export const SKILL_KIND = {
  ORBIT: 'ORBIT',
  STRIKE: 'STRIKE',
  PULSE: 'PULSE',
  DRONE: 'DRONE',
  WEAPON: 'WEAPON',
}

export const SKILL_DEFS = [
  // ═══════════════════════════════════════════════════════════════════════
  // BASE — las ve cualquier personaje
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: 'ORBIT',
    name: 'Escudo orbital',
    desc: 'Orbes que giran a tu alrededor y dañan lo que tocan.',
    kind: SKILL_KIND.ORBIT,
    color: 0x39d0ff,
    // count: orbes · dps: daño por segundo de contacto · radius: órbita
    // spin: vueltas por segundo · size: radio del orbe
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
    key: 'PULSE',
    name: 'Onda expansiva',
    desc: 'Cada pocos segundos, una onda que daña y empuja todo lo que te rodea.',
    kind: SKILL_KIND.PULSE,
    color: 0xff6bd6,
    /**
     * `push` son unidades de mundo que retrocede cada enemigo alcanzado. Es la
     * razón de ser de esta habilidad: es la única respuesta a "me rodearon"
     * que no exige apretar nada, y descartar la acción manual dejó ese hueco
     * abierto. A los `heavy` (el boss) no los mueve, a propósito.
     */
    levels: [
      { damage: 30, radius: 4.0, interval: 3.2, push: 1.6 },
      { damage: 42, radius: 4.5, interval: 2.9, push: 1.9 },
      { damage: 58, radius: 5.0, interval: 2.6, push: 2.2 },
      { damage: 78, radius: 5.6, interval: 2.3, push: 2.6 },
      { damage: 105, radius: 6.2, interval: 2.0, push: 3.0 },
    ],
  },
  {
    key: 'DRONE',
    name: 'Dron',
    desc: 'Acompañantes que giran a tu alrededor y disparan solos.',
    kind: SKILL_KIND.DRONE,
    color: 0xa78bfa,
    /**
     * Dispara balas de verdad, por el mismo pool que el arma. `interval` es
     * por dron, no del conjunto: tres drones a 0.6 s tiran cinco balas por
     * segundo entre los tres.
     */
    levels: [
      { count: 1, damage: 10, interval: 0.9, range: 12 },
      { count: 1, damage: 14, interval: 0.75, range: 13 },
      { count: 2, damage: 14, interval: 0.75, range: 14 },
      { count: 2, damage: 18, interval: 0.65, range: 15 },
      { count: 3, damage: 20, interval: 0.6, range: 16 },
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
  {
    key: 'PISTOL_BACKFIRE',
    weapon: 'PISTOL',
    name: 'Cañón trasero',
    desc: 'Dispara también hacia atrás, al mismo tiempo. Dejás de tener espalda.',
    kind: SKILL_KIND.WEAPON,
    color: 0x39d0ff,
    levels: [
      { mods: { backfire: 1, backfireDamage: 0.5 } },
      { mods: { backfire: 1, backfireDamage: 0.62 } },
      { mods: { backfire: 1, backfireDamage: 0.75 } },
      { mods: { backfire: 1, backfireDamage: 0.87 } },
      { mods: { backfire: 1, backfireDamage: 1.0 } },
    ],
  },
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

  // ═══════════════════════════════════════════════════════════════════════
  // ESCOPETA — encima, ancho, empuje
  // ═══════════════════════════════════════════════════════════════════════
  {
    key: 'SHOTGUN_KNOCK',
    weapon: 'SHOTGUN',
    name: 'Impacto',
    desc: 'Cada perdigón empuja. Un disparo de cerca abre un pasillo.',
    kind: SKILL_KIND.WEAPON,
    color: 0xffd166,
    // Es por perdigón: seis impactos encima suman seis empujones.
    levels: [
      { mods: { knockback: 0.3 } },
      { mods: { knockback: 0.45 } },
      { mods: { knockback: 0.62 } },
      { mods: { knockback: 0.8 } },
      { mods: { knockback: 1.0 } },
    ],
  },
  {
    key: 'SHOTGUN_BACKFAN',
    weapon: 'SHOTGUN',
    name: 'Abanico trasero',
    desc: 'El mismo abanico, también hacia atrás.',
    kind: SKILL_KIND.WEAPON,
    color: 0xffd166,
    levels: [
      { mods: { backfire: 1, backfireDamage: 0.5 } },
      { mods: { backfire: 1, backfireDamage: 0.62 } },
      { mods: { backfire: 1, backfireDamage: 0.75 } },
      { mods: { backfire: 1, backfireDamage: 0.87 } },
      { mods: { backfire: 1, backfireDamage: 1.0 } },
    ],
  },
  {
    key: 'SHOTGUN_DOUBLE',
    weapon: 'SHOTGUN',
    name: 'Doble cañón',
    desc: 'Dispara en ráfaga y después recarga más lento. Ritmo, no cadencia.',
    kind: SKILL_KIND.WEAPON,
    color: 0xffd166,
    /**
     * `burstCooldown` multiplica la recarga a propósito: sin ese costo esto no
     * sería un ritmo distinto, sería cadencia gratis. La ganancia real son
     * andanadas por segundo, y va de +29% en el nivel 1 a +94% en el 5.
     */
    levels: [
      { mods: { burst: 1, burstDelay: 0.14, burstCooldown: 1.55 } },
      { mods: { burst: 1, burstDelay: 0.13, burstCooldown: 1.42 } },
      { mods: { burst: 1, burstDelay: 0.12, burstCooldown: 1.3 } },
      { mods: { burst: 2, burstDelay: 0.12, burstCooldown: 1.75 } },
      { mods: { burst: 2, burstDelay: 0.11, burstCooldown: 1.55 } },
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
