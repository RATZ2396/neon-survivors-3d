/**
 * MetaDefs — árboles de mejora permanente, uno por arma base.
 *
 * Estas mejoras se compran ENTRE partidas con la moneda ganada y no se pierden
 * al morir. Son lo contrario de las de UpgradeDefs, que se eligen adentro y
 * duran un run.
 *
 * REGLA DE ARQUITECTURA (GDD Parte L): nada de acá modifica WEAPON_DEFS. Esa
 * tabla son datos compartidos; si una partida la mutara, la siguiente arrancaría
 * con los números cambiados y el bug sería imposible de rastrear. Las mejoras se
 * traducen a un objeto de modificadores que el arma lee, igual que las mejoras
 * de partida leen Progression.stats.
 *
 * Los cuatro tipos de modificador son los únicos que existen. Agregar un quinto
 * es tocar código; agregar un nivel, una rama o un arma entera es tocar solo
 * esta tabla.
 */
const MOD = {
  /** Multiplica el daño de cada impacto. */
  DAMAGE: 'DAMAGE',
  /** Multiplica la recarga. Menor = dispara más seguido. */
  COOLDOWN: 'COOLDOWN',
  /** Suma unidades al alcance del auto-apuntado. */
  RANGE: 'RANGE',
  /** Suma proyectiles por disparo. */
  COUNT: 'COUNT',
}

/**
 * Una rama del árbol.
 *
 *   mod     cuál de los cuatro modificadores toca
 *   max     cuántos niveles tiene
 *   step    cuánto aporta cada nivel (multiplicativo en DAMAGE/COOLDOWN,
 *           aditivo en RANGE/COUNT)
 *   cost    costo del primer nivel
 *   growth  cuánto se encarece el siguiente
 */
function track(key, name, mod, max, step, cost, growth, desc) {
  return { key, name, mod, max, step, cost, growth, desc }
}

/**
 * Cada arma tiene SU árbol, no el mismo con otro nombre: elegir escopeta o
 * metralleta tiene que importar a largo plazo y no solo en el primer minuto.
 *
 *   Pistola     mejora parejo; el segundo cañón es carísimo pero la reinventa.
 *   Escopeta    crece a lo ancho (perdigones) y el alcance es su punto débil,
 *               así que subirlo cuesta caro a propósito.
 *   Metralleta  crece en cadencia; no suma proyectiles porque su identidad es
 *               una bala tras otra, no un abanico.
 */
export const META_TREES = {
  PISTOL: [
    track('DMG', 'Munición pesada', MOD.DAMAGE, 5, 0.12, 40, 1.55, '+12% de daño por nivel'),
    track('RATE', 'Gatillo liviano', MOD.COOLDOWN, 4, 0.93, 55, 1.6, '-7% de recarga por nivel'),
    track('RANGE', 'Cañón largo', MOD.RANGE, 3, 2.0, 45, 1.5, '+2 u de alcance por nivel'),
    track('COUNT', 'Segundo cañón', MOD.COUNT, 1, 1, 420, 1, 'Dispara dos balas en vez de una'),
  ],
  SHOTGUN: [
    track('DMG', 'Perdigón de acero', MOD.DAMAGE, 5, 0.12, 40, 1.55, '+12% de daño por nivel'),
    track('RATE', 'Recámara doble', MOD.COOLDOWN, 3, 0.9, 70, 1.7, '-10% de recarga por nivel'),
    track('COUNT', 'Carga ampliada', MOD.COUNT, 3, 1, 90, 1.75, '+1 perdigón por nivel'),
    track('RANGE', 'Choke', MOD.RANGE, 2, 2.5, 130, 1.8, '+2.5 u de alcance por nivel'),
  ],
  SMG: [
    track('RATE', 'Muelle reforzado', MOD.COOLDOWN, 5, 0.93, 50, 1.55, '-7% de recarga por nivel'),
    track('DMG', 'Punta perforante', MOD.DAMAGE, 5, 0.11, 45, 1.6, '+11% de daño por nivel'),
    track('RANGE', 'Compensador', MOD.RANGE, 4, 1.5, 40, 1.5, '+1.5 u de alcance por nivel'),
  ],
}

/** Costo del nivel `level` (0 = comprar el primero). */
export function costOfLevel(t, level) {
  return Math.round(t.cost * Math.pow(t.growth, level))
}

/**
 * Traduce niveles comprados a los modificadores que el arma lee.
 *
 * @param {string} weaponKey
 * @param {Record<string, number>} levels  clave de rama -> nivel comprado
 */
export function modifiersFor(weaponKey, levels) {
  const mods = { damageMult: 1, cooldownMult: 1, rangeAdd: 0, countAdd: 0 }
  const tree = META_TREES[weaponKey]
  if (!tree) return mods

  for (const t of tree) {
    const n = levels[t.key] || 0
    if (n <= 0) continue

    if (t.mod === MOD.DAMAGE) mods.damageMult *= 1 + t.step * n
    else if (t.mod === MOD.COOLDOWN) mods.cooldownMult *= Math.pow(t.step, n)
    else if (t.mod === MOD.RANGE) mods.rangeAdd += t.step * n
    else if (t.mod === MOD.COUNT) mods.countAdd += t.step * n
  }

  return mods
}
