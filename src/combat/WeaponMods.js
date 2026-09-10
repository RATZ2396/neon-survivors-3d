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
    //
    // ACÁ ESTABAN `backfire` y `backfireDamage`, que repetían la andanada
    // 180° hacia atrás. Se fueron con las habilidades que los usaban: un
    // solo tipo disparando por la espalda sin darse vuelta se veía falso, y
    // ahora la espalda la cubre un compañero de verdad (ver Squad.js).
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
    /** Grados que se corre cada andanada de la ráfaga respecto de la anterior. */
    burstSpread: 0,
    /** 1 = los proyectiles salen en paralelo en vez de en abanico (Muro). */
    wall: 0,
    /** Separación entre ellos, en unidades. */
    wallGap: 0,
    /** Multiplicador de daño de cada uno. */
    wallDamage: 1,
    /** Reducción máxima de recarga por fuego sostenido (0.42 = -42%). */
    ramp: 0,
    /** Segundos de fuego sostenido hasta llegar a esa reducción máxima. */
    rampTime: 1,
    /** En cuántas crías se parte cada proyectil en el aire. 0 = ninguna. */
    cluster: 0,
    /** Fracción del daño del padre que lleva cada cría. */
    clusterDamage: 0,
    /** A qué fracción de su vuelo se parte. 0.6 = pasado el 60%. */
    clusterAt: 0,
    /** Cada cuántas balas sale una explosiva. 0 = ninguna. */
    boomEvery: 0,
    /** Radio y daño de esa explosión. */
    boomRadius: 0,
    boomDamage: 0,
    /** 1 = llevás dos pistolas y se turnan para disparar (Dual). */
    dual: 0,
    /** Fracción del daño que hace la segunda mano. */
    dualDamage: 0,

    // ── ProjectileManager: qué hace la bala al pegar ────────────────────
    /** Saltos a otro enemigo una vez agotada la penetración. */
    ricochet: 0,
    /** Fracción del daño que conserva en cada salto. */
    ricochetKeep: 1,
    /** Penetración extra sobre la de la tabla. */
    pierceAdd: 0,
    /** 1 = atraviesa a los que frenan balas (tanque, boss). */
    pierceAll: 0,
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
