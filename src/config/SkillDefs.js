/**
 * SkillDefs — habilidades pasivas, en una tabla.
 *
 * Mismo criterio que WeaponDefs: no hay una clase por skill. Las tres se
 * reducen a "hacer daño en un área", y lo que cambia es DÓNDE está esa área:
 *
 *   ORBIT  — orbes girando alrededor del jugador (el escudo orbital del GDD v1)
 *   AURA   — un círculo fijo pegado al jugador
 *   STRIKE — un golpe puntual cada N segundos sobre un enemigo (el rayo del v1)
 *
 * ORBIT y AURA hacen daño por segundo mientras tocan; STRIKE hace daño de golpe.
 *
 * `levels` es explícito nivel por nivel, no una fórmula base+incremento. Es más
 * texto pero se lee de un vistazo qué pasa en cada nivel, y balancear no obliga
 * a resolver una progresión geométrica en la cabeza.
 */

export const SKILL_KIND = {
  ORBIT: 'ORBIT',
  AURA: 'AURA',
  STRIKE: 'STRIKE',
}

export const SKILL_DEFS = [
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
    key: 'AURA',
    name: 'Campo de fuerza',
    desc: 'Daña constantemente a todo lo que esté cerca tuyo.',
    kind: SKILL_KIND.AURA,
    color: 0x8b5cf6,
    levels: [
      { dps: 10, radius: 2.5 },
      { dps: 14, radius: 2.8 },
      { dps: 19, radius: 3.2 },
      { dps: 25, radius: 3.6 },
      { dps: 32, radius: 4.2 },
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
]

export const SKILL = {}
for (let i = 0; i < SKILL_DEFS.length; i++) SKILL[SKILL_DEFS[i].key] = i

// Adrede NO hay un MAX_SKILL_LEVEL global: el tope es `def.levels.length`,
// por habilidad, y lo aplica SkillSystem. Un techo global tendria que salir
// de una habilidad cualquiera y valdria solo mientras todas tengan la misma
// cantidad de niveles — o sea, hasta la primera que no.
