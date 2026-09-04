/**
 * WeaponMods — lo que las habilidades le cambian al arma.
 *
 * POR QUÉ EXISTE ESTE OBJETO Y NO UN FLAG POR SISTEMA.
 *
 * Las habilidades de personaje (`kind: WEAPON` en SkillDefs) no dibujan nada
 * ni recorren la horda: lo único que hacen es cambiar cómo dispara tu arma.
 * Quien las aplica son dos sistemas distintos —WeaponSystem decide qué balas
 * salen, ProjectileManager decide qué hace cada bala al pegar— y no se
 * conocen entre sí. Este objeto es el único lugar donde se encuentran.
 *
 * ES LA MISMA REGLA DE SIEMPRE: los modificadores viven en un objeto de
 * estado, nunca en la tabla. WEAPON_DEFS no se toca ni una vez. Si una partida
 * mutara la tabla, la siguiente arrancaría con los números cambiados y el bug
 * sería imposible de rastrear (ver MetaDefs, misma nota).
 *
 * SE ESCRIBE EN UN SOLO LUGAR: `SkillSystem._recomputeMods()`, cuando cambia
 * lo que tenés equipado. Todos los demás lo leen. Y se muta EN EL LUGAR, nunca
 * se reemplaza: los tres sistemas guardan la misma referencia desde el
 * arranque, así que reasignarlo dejaría a dos de ellos leyendo un objeto viejo.
 */

/**
 * Todos los modificadores en cero, que es "el arma tal como sale de la tabla".
 *
 * Los valores neutros no son todos 0: `burstCooldown` y `ricochetKeep` son
 * multiplicadores, y su neutro es 1.
 */
export function createWeaponMods() {
  return {
    // ── WeaponSystem: qué balas salen ───────────────────────────────────
    /** 1 = repite la andanada entera 180° hacia atrás. */
    backfire: 0,
    /** Fracción del daño con la que sale la andanada trasera. */
    backfireDamage: 0,
    /** Balas paralelas extra por andanada (no en abanico: al costado). */
    parallel: 0,
    /** Separación entre las balas paralelas, en unidades. */
    parallelGap: 0,
    /** Fracción del daño de cada bala paralela. */
    parallelDamage: 0,
    /** Andanadas extra disparadas en ráfaga después de la primera. */
    burst: 0,
    /** Segundos entre las andanadas de una ráfaga. */
    burstDelay: 0,
    /** Cuánto se encarece la recarga por tirar en ráfaga. */
    burstCooldown: 1,
    /** Reducción máxima de recarga por fuego sostenido (0.42 = -42%). */
    ramp: 0,
    /** Segundos de fuego sostenido hasta llegar a esa reducción máxima. */
    rampTime: 1,
    /** Cada cuántas balas sale una explosiva. 0 = ninguna. */
    boomEvery: 0,
    /** Radio y daño de esa explosión. */
    boomRadius: 0,
    boomDamage: 0,

    // ── ProjectileManager: qué hace la bala al pegar ────────────────────
    /** Saltos a otro enemigo una vez agotada la penetración. */
    ricochet: 0,
    /** Fracción del daño que conserva en cada salto. */
    ricochetKeep: 1,
    /** Penetración extra sobre la de la tabla. */
    pierceAdd: 0,
    /** 1 = atraviesa a los que frenan balas (tanque, boss). */
    pierceAll: 0,
    /** Unidades que retrocede el enemigo por impacto. */
    knockback: 0,
  }
}

/**
 * Devuelve `m` a los valores neutros, en el lugar.
 *
 * Escrito como una copia campo por campo desde un molde recién creado en vez
 * de a mano: así agregar un modificador nuevo es tocar `createWeaponMods()` y
 * nada más. Se llama cuando cambian las habilidades, no por frame.
 */
export function resetWeaponMods(m) {
  const limpio = createWeaponMods()
  for (const k in limpio) m[k] = limpio[k]
  return m
}
