import { CONFIG } from './GameConfig.js'
import { SKILL_DEFS, SKILL } from './SkillDefs.js'

/**
 * UpgradeDefs — el mazo de mejoras que se ofrece al subir de nivel.
 *
 * ACÁ NO HAY ARMAS. El arma base se elige antes de la partida y no cambia
 * durante el run (ver WeaponDefs). Lo que se elige al subir de nivel son
 * habilidades y estadísticas.
 *
 * Las entradas de habilidad no están escritas a mano: se derivan de SKILL_DEFS.
 * Una habilidad nueva aparece sola en el menú de nivel sin tocar este archivo —
 * escribirlas a mano era la forma más segura de que algún día alguien agregue
 * una habilidad que nadie pueda conseguir nunca.
 *
 * Cada mejora tiene `available(ctx)` y `apply(ctx)`. Sí, son funciones dentro de
 * datos, y es a propósito: lo que hace cada mejora es genuinamente distinto, y
 * la alternativa honesta era un `switch` gigante en otro archivo que hay que
 * mantener sincronizado con esta lista. Una fila = una mejora completa.
 *
 * ctx = { player, weapons, skills, progression }
 */

/** Mejoras de estadística. `stacks` es cuántas veces se puede tomar. */
const STAT_UPGRADES = [
  {
    key: 'DMG',
    name: 'Munición pesada',
    desc: '+15% de daño con todo',
    stacks: 6,
    weight: 3,
    apply: (ctx) => {
      ctx.progression.stats.damageMult += 0.15
    },
  },
  {
    key: 'RATE',
    name: 'Gatillo rápido',
    desc: '-10% de enfriamiento en las armas',
    stacks: 6,
    weight: 3,
    apply: (ctx) => {
      // Multiplicativo, no restando 0.1 cada vez: restando, seis mejoras
      // darían enfriamiento 0.4 y la séptima lo dejaría en cero.
      ctx.progression.stats.cooldownMult *= 0.9
    },
  },
  {
    key: 'SPEED',
    name: 'Piernas frescas',
    desc: '+8% de velocidad de movimiento',
    stacks: 5,
    weight: 2,
    apply: (ctx) => {
      ctx.player.speedMult += 0.08
    },
  },
  {
    key: 'HP',
    name: 'Blindaje',
    desc: '+25 de vida máxima, y te cura eso mismo',
    stacks: 6,
    weight: 3,
    apply: (ctx) => {
      ctx.player.maxHp += 25
      ctx.player.hp = Math.min(ctx.player.maxHp, ctx.player.hp + 25)
    },
  },
  {
    key: 'MAGNET',
    name: 'Imán',
    desc: '+60% de radio de recolección',
    stacks: 3,
    weight: 2,
    apply: (ctx) => {
      ctx.progression.stats.magnetRadius *= 1.6
    },
  },
  {
    key: 'HEAL',
    name: 'Botiquín',
    desc: 'Recupera 60 de vida ahora',
    stacks: 99,
    weight: 2,
    // Solo aparece si estás herido: ofrecer curación a vida llena es regalar
    // una opción muerta justo cuando la decisión debería importar.
    available: (ctx) => ctx.player.hp < ctx.player.maxHp * 0.75,
    apply: (ctx) => {
      ctx.player.hp = Math.min(ctx.player.maxHp, ctx.player.hp + 60)
    },
  },
]

/** Skills: la misma entrada sirve para conseguirla y para subirle el nivel. */
const SKILL_UPGRADES = SKILL_DEFS.map((def) => ({
  key: 'S_' + def.key,
  name: def.name,
  desc: def.desc,
  tag: 'HABILIDAD',
  color: def.color,
  stacks: def.levels.length,
  weight: 4,
  available: (ctx) => {
    const lvl = ctx.skills.levelOf(SKILL[def.key])
    if (lvl >= def.levels.length) return false
    // Si todavía no la tenés, ocupa un espacio nuevo y hay un límite.
    if (lvl === 0 && ctx.skills.owned.length >= CONFIG.PROGRESSION.MAX_SKILLS) return false
    return true
  },
  apply: (ctx) => ctx.skills.grant(def.key),
  // El texto cambia según si es nueva o una subida de nivel.
  label: (ctx) => {
    const lvl = ctx.skills.levelOf(SKILL[def.key])
    return lvl === 0 ? 'Nueva' : `Nivel ${lvl} → ${lvl + 1}`
  },
}))

export const UPGRADE_DEFS = [...SKILL_UPGRADES, ...STAT_UPGRADES]

/**
 * Elige n mejoras distintas que se puedan tomar ahora, con peso.
 *
 * Si no hay suficientes disponibles devuelve menos: es preferible ofrecer dos
 * opciones reales que rellenar con mejoras que no hacen nada.
 */
export function rollUpgrades(ctx, n) {
  const pool = []

  for (const up of UPGRADE_DEFS) {
    if (ctx.progression.stacks(up.key) >= up.stacks) continue
    if (up.available && !up.available(ctx)) continue
    pool.push(up)
  }

  const picked = []
  let totalWeight = 0
  for (const up of pool) totalWeight += up.weight

  while (picked.length < n && pool.length > 0) {
    let r = Math.random() * totalWeight
    let idx = 0
    for (; idx < pool.length - 1; idx++) {
      r -= pool[idx].weight
      if (r <= 0) break
    }

    picked.push(pool[idx])
    totalWeight -= pool[idx].weight
    pool.splice(idx, 1) // sin repetidos en la misma tirada
  }

  return picked
}
