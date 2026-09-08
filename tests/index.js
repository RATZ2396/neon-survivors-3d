import { describe, test, expect, resumen } from './run.js'

import { CONFIG } from '../src/config/GameConfig.js'
import { puestoDe } from '../src/player/Squad.js'
import { Progression } from '../src/progression/Progression.js'
import { PlayerProfile } from '../src/meta/PlayerProfile.js'
import { META_TREES, costOfLevel, modifiersFor } from '../src/config/MetaDefs.js'
import { WEAPON_DEFS, WEAPON } from '../src/config/WeaponDefs.js'
import { SpatialGrid } from '../src/enemies/SpatialGrid.js'
import { EnemyManager } from '../src/enemies/EnemyManager.js'
import { ENEMY_DEFS, ENEMY_TYPE } from '../src/config/EnemyDefs.js'
import { WaveManager, WAVE_STAGES } from '../src/enemies/WaveManager.js'
import { rollUpgrades, UPGRADE_DEFS } from '../src/config/UpgradeDefs.js'
import { SKILL_DEFS, SKILL, SKILL_KIND } from '../src/config/SkillDefs.js'
import { SkillSystem } from '../src/skills/SkillSystem.js'
import { ProjectileManager } from '../src/combat/ProjectileManager.js'
import { createWeaponMods, resetWeaponMods } from '../src/combat/WeaponMods.js'
import { PickupManager } from '../src/progression/PickupManager.js'
import { PICKUP_KIND, PICKUP_DEFS } from '../src/config/PickupDefs.js'
import { SoundManager } from '../src/audio/SoundManager.js'
import { SOUND_DEFS } from '../src/config/SoundDefs.js'
import { ParticleSystem } from '../src/vfx/ParticleSystem.js'
import { VFX_DEFS } from '../src/config/VfxDefs.js'
import { FrameEvents } from '../src/core/FrameEvents.js'
import { BossController } from '../src/enemies/BossController.js'
import {
  BOSS_DEFS,
  BOSS,
  ELITE_TIER,
  ELITE_SCHEDULE,
  eliteAt,
} from '../src/config/BossDefs.js'
import { WeaponSystem } from '../src/combat/WeaponSystem.js'

/** Escena de mentira: los sistemas solo le piden add(). */
const escena = { add() {} }

/**
 * localStorage de mentira, para no depender de un navegador.
 *
 * Guarda POR CLAVE y no un solo valor. Empezó guardando uno solo, que alcanzaba
 * mientras el juego usaba una sola clave; al renombrarse hizo falta que
 * conviviera la vieja con la nueva, y un almacén de un solo casillero no puede
 * probar una mudanza.
 */
function almacenFalso(inicial = null, clave = 'rtzblood.profile.v1') {
  const datos = new Map()
  if (inicial !== null) datos.set(clave, inicial)
  return {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, x) => datos.set(k, x),
    removeItem: (k) => datos.delete(k),
    get raw() {
      return datos.get('rtzblood.profile.v1') ?? null
    },
    claves: () => [...datos.keys()],
  }
}

// ═══════════════════════════════════════════════════════════════════════════
describe('Progression', () => {
  test('la curva de XP crece como dice la config', () => {
    const p = new Progression()
    const { XP_BASE, XP_GROWTH } = CONFIG.PROGRESSION
    expect(p.xpToNext).toBe(Math.round(XP_BASE))
    p.addXp(p.xpToNext)
    expect(p.level).toBe(2)
    expect(p.xpToNext).toBe(Math.round(XP_BASE * XP_GROWTH))
  })

  test('una gema grande puede subir varios niveles de una', () => {
    const p = new Progression()
    const subidos = p.addXp(500)
    expect(subidos).toBeGreaterThan(1)
    expect(p.level).toBe(1 + subidos)
  })

  test('el sobrante de XP no se pierde al subir', () => {
    const p = new Progression()
    const falta = p.xpToNext
    p.addXp(falta + 3)
    expect(p.xp).toBe(3)
  })

  test('XP cero o negativa no hace nada', () => {
    const p = new Progression()
    expect(p.addXp(0)).toBe(0)
    expect(p.addXp(-50)).toBe(0)
    expect(p.level).toBe(1)
  })

  test('reset borra los multiplicadores de la partida anterior', () => {
    const p = new Progression()
    p.stats.damageMult = 3
    p.markTaken('DMG')
    p.reset()
    expect(p.stats.damageMult).toBe(1)
    expect(p.stacks('DMG')).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('PlayerProfile', () => {
  test('un perfil nuevo arranca sin moneda y sin nada comprado', () => {
    const p = new PlayerProfile(almacenFalso())
    expect(p.currency).toBe(0)
    expect(p.levelOf('PISTOL', 'DMG')).toBe(0)
  })

  test('comprar descuenta y sube un nivel', () => {
    const p = new PlayerProfile(almacenFalso())
    p.currency = 1000
    const rama = META_TREES.SHOTGUN.find((t) => t.key === 'COUNT')
    const costo = p.costOf('SHOTGUN', rama)
    expect(p.buy('SHOTGUN', rama)).toBe(true)
    expect(p.currency).toBe(1000 - costo)
    expect(p.levelOf('SHOTGUN', 'COUNT')).toBe(1)
  })

  test('sin moneda no se compra nada', () => {
    const p = new PlayerProfile(almacenFalso())
    p.currency = 1
    const rama = META_TREES.PISTOL[0]
    expect(p.canBuy('PISTOL', rama)).toBe(false)
    expect(p.buy('PISTOL', rama)).toBe(false)
    expect(p.levelOf('PISTOL', rama.key)).toBe(0)
  })

  test('una rama al máximo no se puede seguir comprando', () => {
    const p = new PlayerProfile(almacenFalso())
    p.currency = 1e9
    const rama = META_TREES.PISTOL.find((t) => t.key === 'COUNT')
    for (let i = 0; i < rama.max; i++) p.buy('PISTOL', rama)
    expect(p.levelOf('PISTOL', 'COUNT')).toBe(rama.max)
    expect(p.costOf('PISTOL', rama)).toBe(-1)
    expect(p.buy('PISTOL', rama)).toBe(false)
  })

  test('cada nivel cuesta más que el anterior', () => {
    const rama = META_TREES.SHOTGUN.find((t) => t.key === 'DMG')
    for (let n = 1; n < rama.max; n++) {
      expect(costOfLevel(rama, n)).toBeGreaterThan(costOfLevel(rama, n - 1))
    }
  })

  test('guarda y vuelve a leer lo mismo', () => {
    const store = almacenFalso()
    const a = new PlayerProfile(store)
    a.currency = 777
    a.weapon = 'SMG'
    a.muted = true
    a.upgrades.SMG.RATE = 3
    a.save()

    const b = new PlayerProfile(store)
    expect(b.currency).toBe(777)
    expect(b.weapon).toBe('SMG')
    expect(b.muted).toBe(true)
    expect(b.levelOf('SMG', 'RATE')).toBe(3)
  })

  // Lo que vuelve de localStorage lo escribió otra versión del juego, o alguien
  // con la consola abierta. Es dato sucio y no puede tumbar el arranque.
  const corruptos = {
    'json inválido': 'no soy json {{{',
    nulo: 'null',
    'un número': '42',
    'un arreglo': '[1,2,3]',
    'campos ausentes': '{}',
    'moneda negativa': JSON.stringify({ currency: -9999 }),
    'moneda que no es número': JSON.stringify({ currency: 'mucha' }),
    'nivel imposible': JSON.stringify({ upgrades: { PISTOL: { DMG: 99 } } }),
    'rama inexistente': JSON.stringify({ upgrades: { PISTOL: { NO_EXISTE: 5 } } }),
    'arma inventada': JSON.stringify({ weapon: 'BAZOOKA' }),
    'upgrades que no es objeto': JSON.stringify({ upgrades: 'nada' }),
  }

  for (const [nombre, raw] of Object.entries(corruptos)) {
    test(`sobrevive a un perfil con ${nombre}`, () => {
      const p = new PlayerProfile(almacenFalso(raw))
      expect(p.currency).toBeGreaterThan(-1)
      expect(WEAPON[p.weapon]).toBeGreaterThan(-1)
      const nivel = p.levelOf('PISTOL', 'DMG')
      const max = META_TREES.PISTOL.find((t) => t.key === 'DMG').max
      expect(nivel).toBeLessThan(max + 1)
    })
  }

  test('sin almacenamiento el juego igual arranca', () => {
    const p = new PlayerProfile(null)
    expect(p.currency).toBe(0)
    p.save() // no debe lanzar
  })

  test('un almacenamiento que lanza excepciones no rompe nada', () => {
    const roto = {
      getItem() {
        throw new Error('bloqueado')
      },
      setItem() {
        throw new Error('cuota llena')
      },
      removeItem() {},
    }
    const p = new PlayerProfile(roto)
    expect(p.currency).toBe(0)
    p.currency = 10
    p.save()
    p.wipe()
  })

  test('la recompensa premia tiempo y moneda juntada, con piso', () => {
    const { REWARD_PER_SECOND, REWARD_MIN } = CONFIG.META
    expect(PlayerProfile.rewardFor(0, 0)).toBe(REWARD_MIN)
    expect(PlayerProfile.rewardFor(100, 0)).toBe(Math.round(100 * REWARD_PER_SECOND))
    // La moneda entra tal cual: ya la juntaste del piso, no se vuelve a escalar.
    expect(PlayerProfile.rewardFor(0, 300)).toBe(300)
  })

  test('matar sin juntar no paga', () => {
    // Es la diferencia entera del cambio: antes se cobraba por baja al
    // terminar, ahora la baja deja una moneda en el piso y hay que ir.
    const solo = CONFIG.META.REWARD_PER_SECOND * 100
    expect(PlayerProfile.rewardFor(100, 0)).toBe(Math.round(solo))
  })

  test('terminar una partida acredita y persiste', () => {
    const store = almacenFalso()
    const p = new PlayerProfile(store)
    const premio = p.finishRun(60, 30)
    expect(p.currency).toBe(premio)
    expect(p.runs).toBe(1)
    expect(p.bestSeconds).toBe(60)
    expect(JSON.parse(store.raw).currency).toBe(premio)
  })

  test('el mejor tiempo solo sube', () => {
    const p = new PlayerProfile(almacenFalso())
    p.finishRun(120, 0)
    p.finishRun(30, 0)
    expect(p.bestSeconds).toBe(120)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Mejoras permanentes', () => {
  test('sin nada comprado, no modifican nada', () => {
    const m = modifiersFor('PISTOL', {})
    expect(m).toEqual({ damageMult: 1, cooldownMult: 1, rangeAdd: 0, countAdd: 0 })
  })

  test('el daño se acumula por nivel', () => {
    const rama = META_TREES.PISTOL.find((t) => t.key === 'DMG')
    const m = modifiersFor('PISTOL', { DMG: 3 })
    expect(m.damageMult).toBeCloseTo(1 + rama.step * 3, 1e-9)
  })

  test('la cadencia es multiplicativa y siempre baja el enfriamiento', () => {
    const m = modifiersFor('SMG', { RATE: 5 })
    expect(m.cooldownMult).toBeLessThan(1)
    expect(m.cooldownMult).toBeGreaterThan(0)
  })

  test('un arma inventada devuelve modificadores neutros', () => {
    expect(modifiersFor('BAZOOKA', { DMG: 5 }).damageMult).toBe(1)
  })

  // La regla de arquitectura del GDD Parte L: la tabla de armas son DATOS
  // compartidos. Si una partida la mutara, la siguiente arrancaría distinta.
  test('NINGUNA mejora toca WEAPON_DEFS', () => {
    const antes = JSON.stringify(WEAPON_DEFS)
    const p = new PlayerProfile(almacenFalso())
    p.currency = 1e9
    for (const clave of Object.keys(META_TREES)) {
      for (const rama of META_TREES[clave]) {
        for (let i = 0; i < rama.max; i++) p.buy(clave, rama)
      }
      p.effectiveStats(WEAPON_DEFS[WEAPON[clave]])
    }
    expect(JSON.stringify(WEAPON_DEFS)).toBe(antes)
  })

  test('las estadísticas efectivas reflejan lo comprado', () => {
    const p = new PlayerProfile(almacenFalso())
    const def = WEAPON_DEFS[WEAPON.SHOTGUN]
    const base = p.effectiveStats(def)
    expect(base.upgraded).toBe(false)

    p.currency = 1e9
    p.buy('SHOTGUN', META_TREES.SHOTGUN.find((t) => t.key === 'COUNT'))
    const mejorada = p.effectiveStats(def)
    expect(mejorada.count).toBe(base.count + 1)
    expect(mejorada.dps).toBeGreaterThan(base.dps)
    expect(mejorada.upgraded).toBe(true)
  })

  test('cada arma tiene su propio árbol y ninguno está vacío', () => {
    for (const def of WEAPON_DEFS) {
      expect(META_TREES[def.key].length).toBeGreaterThan(0)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('SpatialGrid', () => {
  test('dos puntos cercanos caen en la misma celda', () => {
    const g = new SpatialGrid(120, 2, 100)
    expect(g.cellX(0)).toBe(g.cellX(0.5))
  })

  test('puntos separados por más de una celda no comparten celda', () => {
    const g = new SpatialGrid(120, 2, 100)
    expect(g.cellX(0)).toBeLessThan(g.cellX(10))
  })

  test('fuera de la arena queda recortado adentro, no fuera de rango', () => {
    const g = new SpatialGrid(120, 2, 100)
    expect(g.cellX(-9999)).toBe(0)
    expect(g.cellX(9999)).toBe(g.dim - 1)
  })

  test('build indexa a todos exactamente una vez', () => {
    const g = new SpatialGrid(120, 2, 100)
    const n = 50
    const x = new Float32Array(n)
    const z = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      x[i] = (i % 10) * 3 - 15
      z[i] = Math.floor(i / 10) * 3 - 7
    }
    g.build(x, z, n)

    let total = 0
    for (let c = 0; c < g.cellCount; c++) total += g.counts[c]
    expect(total).toBe(n)

    const vistos = new Set()
    for (let c = 0; c < g.cellCount; c++) {
      for (let k = g.start[c]; k < g.start[c] + g.counts[c]; k++) vistos.add(g.items[k])
    }
    expect(vistos.size).toBe(n)
  })

  test('los vecinos de un punto están en su celda', () => {
    const g = new SpatialGrid(120, 2, 100)
    const x = Float32Array.from([0, 0.4, 30])
    const z = Float32Array.from([0, 0.4, 30])
    g.build(x, z, 3)

    const c = g.cellZ(0) * g.dim + g.cellX(0)
    const enCelda = []
    for (let k = g.start[c]; k < g.start[c] + g.counts[c]; k++) enCelda.push(g.items[k])
    expect(enCelda.length).toBe(2)
    expect(enCelda).toContain(0)
    expect(enCelda).toContain(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('EnemyManager', () => {
  function crear() {
    return new EnemyManager(escena)
  }

  test('spawn agrega y clear vacía', () => {
    const e = crear()
    e.spawn(ENEMY_TYPE.NORMAL, 1, 2)
    e.spawn(ENEMY_TYPE.RUNNER, 3, 4)
    expect(e.count).toBe(2)
    e.clear()
    expect(e.count).toBe(0)
  })

  // El bug real que encontró la Parte L: las bajas se arrastraban de una
  // partida a la siguiente, y desde que la recompensa se calcula con ellas,
  // reintentar sin recargar pagaba de más cada vez.
  test('clear reinicia el contador de bajas', () => {
    const e = crear()
    e.spawn(ENEMY_TYPE.NORMAL, 0, 0)
    e.damage(0, 99999)
    expect(e.killCount).toBe(1)
    e.clear()
    expect(e.killCount).toBe(0)
  })

  test('el daño mata solo cuando la vida llega a cero', () => {
    const e = crear()
    e.spawn(ENEMY_TYPE.NORMAL, 0, 0)
    const hp = ENEMY_DEFS[ENEMY_TYPE.NORMAL].hp
    expect(e.damage(0, hp - 1)).toBe(0)
    expect(e.count).toBe(1)
    expect(e.damage(0, 1)).toBe(ENEMY_DEFS[ENEMY_TYPE.NORMAL].xp)
    expect(e.count).toBe(0)
  })

  test('al morir anota dónde cayó y de qué color', () => {
    const e = crear()
    e.spawn(ENEMY_TYPE.TANK, 7, -3)
    e.damage(0, 99999)
    expect(e.deathCount).toBe(1)
    expect(e.deathX[0]).toBe(7)
    expect(e.deathZ[0]).toBe(-3)
    expect(e.deathColor[0]).toBe(ENEMY_DEFS[ENEMY_TYPE.TANK].color)
  })

  // Es LA trampa del borrado por intercambio: al morir uno, el último de la
  // lista ocupa su índice. Resolver el daño hacia adelante le pegaría al que
  // acaba de mudarse.
  test('el daño diferido le pega a quien corresponde, no al que se mudó', () => {
    const e = crear()
    for (let i = 0; i < 5; i++) e.spawn(ENEMY_TYPE.NORMAL, i, 0)
    const idDeCadaUno = Array.from({ length: 5 }, (_, i) => e.id[i])

    // Matar al primero y herir al último, en el mismo frame.
    e.queueDamage(0, 99999)
    e.queueDamage(4, 5)
    e.resolveDamage()

    expect(e.count).toBe(4)
    const iUltimo = e.indexOfId(idDeCadaUno[4])
    expect(iUltimo).toBeGreaterThan(-1)
    expect(e.hp[iUltimo]).toBe(ENEMY_DEFS[ENEMY_TYPE.NORMAL].hp - 5)
    expect(e.indexOfId(idDeCadaUno[0])).toBe(-1)
  })

  test('varias muertes en el mismo frame se resuelven todas', () => {
    const e = crear()
    for (let i = 0; i < 20; i++) e.spawn(ENEMY_TYPE.NORMAL, i, 0)
    for (let i = 0; i < 20; i++) e.queueDamage(i, 99999)
    const xp = e.resolveDamage()
    expect(e.count).toBe(0)
    expect(e.deathCount).toBe(20)
    expect(xp).toBe(20 * ENEMY_DEFS[ENEMY_TYPE.NORMAL].xp)
  })

  test('resolveDamage sin daño pendiente no hace nada', () => {
    const e = crear()
    e.spawn(ENEMY_TYPE.NORMAL, 0, 0)
    expect(e.resolveDamage()).toBe(0)
    expect(e.count).toBe(1)
  })

  test('un índice fuera de rango no rompe', () => {
    const e = crear()
    e.spawn(ENEMY_TYPE.NORMAL, 0, 0)
    e.queueDamage(-1, 10)
    e.queueDamage(999, 10)
    e.resolveDamage()
    expect(e.count).toBe(1)
  })

  test('no se pasa del tope de vivos', () => {
    const e = crear()
    for (let i = 0; i < CONFIG.ENEMIES.MAX_ALIVE + 50; i++) e.spawn(ENEMY_TYPE.NORMAL, 0, 0)
    expect(e.count).toBe(CONFIG.ENEMIES.MAX_ALIVE)
  })

  test('los ids no se reciclan mientras dura la partida', () => {
    const e = crear()
    e.spawn(ENEMY_TYPE.NORMAL, 0, 0)
    const primero = e.id[0]
    e.damage(0, 99999)
    e.spawn(ENEMY_TYPE.NORMAL, 0, 0)
    expect(e.id[0]).toBeGreaterThan(primero)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('WaveManager', () => {
  function crear() {
    const enemigos = new EnemyManager(escena)
    return { w: new WaveManager(enemigos), enemigos }
  }

  test('las etapas están ordenadas en el tiempo', () => {
    for (let i = 1; i < WAVE_STAGES.length; i++) {
      expect(WAVE_STAGES[i].at).toBeGreaterThan(WAVE_STAGES[i - 1].at)
    }
  })

  test('la dificultad sube: más seguido y de a más', () => {
    const primera = WAVE_STAGES[0]
    const ultima = WAVE_STAGES[WAVE_STAGES.length - 1]
    expect(ultima.interval).toBeLessThan(primera.interval)
    expect(ultima.batch).toBeGreaterThan(primera.batch)
  })

  test('avanza de etapa al llegar su segundo', () => {
    const { w } = crear()
    expect(w.stageIndex).toBe(0)
    w.elapsed = WAVE_STAGES[2].at + 1
    w.update(0, { x: 0, z: 0 })
    expect(w.stageIndex).toBeGreaterThan(1)
  })

  test('reset devuelve todo al principio', () => {
    const { w } = crear()
    w.elapsed = 300
    w.update(0.1, { x: 0, z: 0 })
    w.reset()
    expect(w.elapsed).toBe(0)
    expect(w.stageIndex).toBe(0)
    expect(w.spawnMultiplier).toBe(1)
  })

  test('spawnea dentro de la arena aunque el jugador esté contra el borde', () => {
    const { w, enemigos } = crear()
    const limite = CONFIG.WORLD.ARENA_SIZE / 2
    for (let i = 0; i < 40; i++) w._spawnBatch({ x: limite, z: limite })

    // Que aparezca ALGUIEN es parte del test: durante un tiempo esta llamada
    // no spawneaba nada (la firma era (stage, playerPos) y se le pasaba un
    // solo argumento), el bucle de abajo recorría cero elementos y el test
    // pasaba sin comprobar una sola posición.
    expect(enemigos.count).toBeGreaterThan(0)

    for (let i = 0; i < enemigos.count; i++) {
      expect(Math.abs(enemigos.posX[i])).toBeLessThan(limite + 0.001)
      expect(Math.abs(enemigos.posZ[i])).toBeLessThan(limite + 0.001)
    }
  })

  test('la vida escala con el tiempo', () => {
    const { w } = crear()
    w.elapsed = 0
    expect(w.hpMultiplier).toBeCloseTo(1, 0.001)
    w.elapsed = CONFIG.WAVES.HP_DOUBLE_EVERY
    expect(w.hpMultiplier).toBeCloseTo(2, 0.001)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Mazo de mejoras de partida', () => {
  function contexto() {
    const progression = new Progression()
    return {
      progression,
      player: { maxHp: 100, hp: 100, speedMult: 1 },
      // Con un arma de verdad: sin ella no se puede saber qué habilidades de
      // personaje corresponden, y el mazo se quedaría solo con la base.
      weapons: { def: WEAPON_DEFS[WEAPON.PISTOL] },
      skills: {
        owned: [],
        levelOf: () => 0,
        grant() {},
      },
    }
  }

  test('no salen repetidas en la misma tirada', () => {
    for (let intento = 0; intento < 200; intento++) {
      const opciones = rollUpgrades(contexto(), 4)
      const claves = new Set(opciones.map((o) => o.key))
      expect(claves.size).toBe(opciones.length)
    }
  })

  test('devuelve como mucho lo que se le pide', () => {
    expect(rollUpgrades(contexto(), 4).length).toBeLessThan(5)
  })

  // Con el arma elegida antes de la partida, el mazo de nivel es SOLO
  // habilidades y estadísticas. Que se cuele un arma sería volver al modelo viejo.
  test('no hay armas en el mazo de subir de nivel', () => {
    for (const up of UPGRADE_DEFS) {
      expect(up.key.startsWith('W_')).toBe(false)
    }
  })

  test('una mejora agotada deja de salir', () => {
    const ctx = contexto()
    const objetivo = UPGRADE_DEFS.find((u) => !u.available)
    for (let i = 0; i < objetivo.stacks; i++) ctx.progression.markTaken(objetivo.key)
    for (let intento = 0; intento < 100; intento++) {
      const claves = rollUpgrades(ctx, 9).map((o) => o.key)
      expect(claves.includes(objetivo.key)).toBe(false)
    }
  })

  test('curarse no aparece con la vida llena', () => {
    const ctx = contexto()
    const claves = rollUpgrades(ctx, 20).map((o) => o.key)
    expect(claves.includes('HEAL')).toBe(false)
    ctx.player.hp = 10
    let apareceAlgunaVez = false
    for (let i = 0; i < 60; i++) {
      if (rollUpgrades(ctx, 20).some((o) => o.key === 'HEAL')) apareceAlgunaVez = true
    }
    expect(apareceAlgunaVez).toBe(true)
  })

  test('cuando no queda nada, devuelve lista vacía y no se cuelga', () => {
    const ctx = contexto()
    ctx.player.hp = 100
    for (const up of UPGRADE_DEFS) {
      for (let i = 0; i < up.stacks; i++) ctx.progression.markTaken(up.key)
    }
    expect(rollUpgrades(ctx, 4).length).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Habilidades', () => {
  test('todas tienen los mismos 5 niveles', () => {
    for (const def of SKILL_DEFS) expect(def.levels.length).toBe(5)
  })

  test('cada nivel es mejor que el anterior', () => {
    for (const def of SKILL_DEFS) {
      for (let n = 1; n < def.levels.length; n++) {
        const a = def.levels[n - 1]
        const b = def.levels[n]
        // Cada habilidad mejora en lo suyo, pero ninguna empeora.
        if (a.dps !== undefined) expect(b.dps).toBeGreaterThan(a.dps - 0.001)
        if (a.radius !== undefined) expect(b.radius).toBeGreaterThan(a.radius - 0.001)
        if (a.damage !== undefined) expect(b.damage).toBeGreaterThan(a.damage - 0.001)
        if (a.interval !== undefined) expect(b.interval).toBeLessThan(a.interval + 0.001)
      }
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('SoundManager', () => {
  /**
   * Contexto de audio de mentira.
   *
   * Node no tiene WebAudio, y tampoco hace falta: lo que hay que probar acá es
   * la POLÍTICA — el intervalo mínimo y el presupuesto de voces —, no que el
   * navegador sepa hacer sonar un oscilador. Se falsea lo mínimo para que
   * play() llegue hasta esa política, y se corta la síntesis reemplazando
   * _buildLayer, que es la parte que sí necesita un navegador de verdad.
   */
  function conContextoFalso() {
    const s = new SoundManager()
    let t = 0
    const param = () => ({
      value: 0,
      setValueAtTime() {},
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {},
    })
    s.ctx = {
      get currentTime() {
        return t
      },
      state: 'running',
      createGain: () => ({ gain: param(), connect() {}, disconnect() {} }),
      avanzar(dt) {
        t += dt
      },
    }
    s.master = { connect() {} }
    // La capa de audio real necesita un navegador; acá solo importa que la voz
    // se reserve y que alguien reciba el onended.
    s._buildLayer = () => ({ onended: null })
    return s
  }

  test('todos los sonidos tienen las claves que el motor espera', () => {
    for (const def of SOUND_DEFS) {
      expect(typeof def.key).toBe('string')
      expect(def.layers.length).toBeGreaterThan(0)
      expect(def.duration).toBeGreaterThan(0)
      expect(def.minInterval).toBeGreaterThan(-0.001)
    }
  })

  test('no hay dos sonidos con la misma clave', () => {
    const claves = new Set(SOUND_DEFS.map((d) => d.key))
    expect(claves.size).toBe(SOUND_DEFS.length)
  })

  test('lo que te mata suena más fuerte que lo que disparás', () => {
    const dic = Object.fromEntries(SOUND_DEFS.map((d) => [d.key, d]))
    expect(dic.PLAYER_HIT.gain).toBeGreaterThan(dic.SHOT_PISTOL.gain)
    expect(dic.PLAYER_HIT.priority).toBeGreaterThan(dic.SHOT_PISTOL.priority)
    expect(dic.BOSS_SLAM.priority).toBeGreaterThan(dic.ENEMY_HIT.priority)
  })

  test('sin contexto no suena y no lanza', () => {
    const s = new SoundManager()
    expect(s.ready).toBe(false)
    expect(s.play('SHOT_PISTOL')).toBe(false)
  })

  test('una clave que no existe no rompe', () => {
    const s = conContextoFalso()
    expect(s.play('NO_EXISTE')).toBe(false)
  })

  test('silenciado no suena', () => {
    const s = conContextoFalso()
    s.muted = true
    expect(s.play('SHOT_PISTOL')).toBe(false)
  })

  // Sin este tope, 400 enemigos muriendo el mismo frame piden 400 voces.
  test('el intervalo mínimo corta la repetición', () => {
    const s = conContextoFalso()
    let sonaron = 0
    for (let i = 0; i < 400; i++) if (s.play('ENEMY_DEATH')) sonaron++
    expect(sonaron).toBe(1)
  })

  test('pasado el intervalo, vuelve a sonar', () => {
    const s = conContextoFalso()
    expect(s.play('ENEMY_DEATH')).toBe(true)
    s.ctx.avanzar(1)
    expect(s.play('ENEMY_DEATH')).toBe(true)
  })

  test('con las voces llenas, lo importante entra y lo flojo no', () => {
    const s = conContextoFalso()
    for (let i = 0; i < 20; i++) s._voices.push({ priority: 5 })
    expect(s._claimVoice(0)).toBe(false)
    expect(s._claimVoice(7)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('ParticleSystem', () => {
  test('emitir agrega tantas como dice la tabla', () => {
    const p = new ParticleSystem(escena)
    p.emit('DEATH', 0, 0, 0, 0xffffff)
    expect(p.count).toBe(VFX_DEFS.DEATH.count)
  })

  test('una clave inexistente no hace nada', () => {
    const p = new ParticleSystem(escena)
    p.emit('NO_EXISTE', 0, 0, 0)
    expect(p.count).toBe(0)
  })

  // El pool NO crece: pedir memoria justo cuando mueren 400 enemigos es
  // exactamente el momento en que el juego no puede permitirse una pausa.
  test('el pool descarta en vez de crecer', () => {
    const p = new ParticleSystem(escena)
    const porTanda = VFX_DEFS.DEATH.count
    const tandas = Math.ceil(CONFIG.VFX.MAX_PARTICLES / porTanda) + 40
    for (let i = 0; i < tandas; i++) p.emit('DEATH', 0, 1, 0, 0xffffff)
    expect(p.count).toBeLessThan(CONFIG.VFX.MAX_PARTICLES + 1)
    expect(p.dropped).toBeGreaterThan(0)
  })

  test('se vacía solo cuando se acaba la vida', () => {
    const p = new ParticleSystem(escena)
    p.emit('MUZZLE', 0, 1, 0, 0xffffff)
    expect(p.count).toBeGreaterThan(0)
    for (let i = 0; i < 200; i++) p.update(0.05)
    expect(p.count).toBe(0)
  })

  test('ninguna partícula atraviesa el piso', () => {
    const p = new ParticleSystem(escena)
    p.emit('BOSS_SLAM', 0, 2, 0)
    for (let paso = 0; paso < 40; paso++) {
      p.update(0.016)
      for (let i = 0; i < p.count; i++) expect(p.posY[i]).toBeGreaterThan(0.0499)
    }
  })

  test('clear vacía y olvida las descartadas', () => {
    const p = new ParticleSystem(escena)
    p.emit('DEATH', 0, 1, 0, 0xffffff)
    p.clear()
    expect(p.count).toBe(0)
    expect(p.dropped).toBe(0)
  })

  test('todos los efectos de la tabla se pueden emitir', () => {
    const p = new ParticleSystem(escena)
    for (const clave of Object.keys(VFX_DEFS)) {
      p.clear()
      p.emit(clave, 1, 1, 1)
      expect(p.count).toBe(VFX_DEFS[clave].count)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('FrameEvents', () => {
  function sistemas() {
    return {
      player: { hp: 100, invulnTimer: 0, isDead: false },
      enemies: { deathCount: 0 },
      weapons: { shotsFired: 0, def: { key: 'PISTOL' } },
      projectiles: { hitCount: 0 },
      boss: { active: false, defeated: 0, hp: 0, chargePhase: '', slamWarning: false },
    }
  }

  test('un disparo de escopeta con 6 balas es UN disparo', () => {
    const s = sistemas()
    const ev = new FrameEvents(s)
    s.weapons.shotsFired += 6
    ev.update(0, 0)
    expect(ev.shot).toBe(true)
    ev.update(0, 0)
    expect(ev.shot).toBe(false)
  })

  test('detecta que te pegaron por el salto de invulnerabilidad', () => {
    const s = sistemas()
    const ev = new FrameEvents(s)
    s.player.invulnTimer = 0.7
    s.player.hp = 90
    ev.update(0, 0)
    expect(ev.playerHit).toBe(true)
    expect(ev.playerDamage).toBe(10)

    s.player.invulnTimer = 0.6
    ev.update(0, 0)
    expect(ev.playerHit).toBe(false)
  })

  test('curarse no cuenta como daño', () => {
    const s = sistemas()
    const ev = new FrameEvents(s)
    s.player.hp = 130
    ev.update(0, 0)
    expect(ev.playerDamage).toBe(0)
  })

  test('la muerte del jugador se reporta una sola vez', () => {
    const s = sistemas()
    const ev = new FrameEvents(s)
    s.player.isDead = true
    ev.update(0, 0)
    expect(ev.playerDied).toBe(true)
    ev.update(0, 0)
    expect(ev.playerDied).toBe(false)
  })

  test('el daño al boss sale de mirarle la vida', () => {
    const s = sistemas()
    const ev = new FrameEvents(s)
    s.boss.active = true
    s.boss.hp = 5000
    ev.update(0, 0)
    expect(ev.bossSpawned).toBe(true)
    expect(ev.bossDamage).toBe(0)

    s.boss.hp = 4850
    ev.update(0, 0)
    expect(ev.bossDamage).toBe(150)
    expect(ev.bossSpawned).toBe(false)
  })

  test('las fases del boss se reportan al cambiar, no todos los frames', () => {
    const s = sistemas()
    const ev = new FrameEvents(s)
    s.boss.active = true
    ev.update(0, 0)

    s.boss.chargePhase = 'TELEGRAPH'
    ev.update(0, 0)
    expect(ev.bossPhase).toBe('TELEGRAPH')
    ev.update(0, 0)
    expect(ev.bossPhase).toBe(null)
  })

  test('el golpe de área cuenta cuando el anillo se apaga', () => {
    const s = sistemas()
    const ev = new FrameEvents(s)
    s.boss.active = true
    ev.update(0, 0)

    s.boss.slamWarning = true
    ev.update(0, 0)
    expect(ev.bossSlam).toBe(false)

    s.boss.slamWarning = false
    ev.update(0, 0)
    expect(ev.bossSlam).toBe(true)
  })

  test('reset olvida el frame anterior', () => {
    const s = sistemas()
    const ev = new FrameEvents(s)
    s.weapons.shotsFired = 100
    ev.reset()
    ev.update(0, 0)
    expect(ev.shot).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Tablas de datos', () => {
  test('las tres armas base existen y no se repiten', () => {
    expect(WEAPON_DEFS.length).toBe(3)
    expect(new Set(WEAPON_DEFS.map((d) => d.key)).size).toBe(3)
  })

  test('ningún arma tiene números imposibles', () => {
    for (const d of WEAPON_DEFS) {
      expect(d.cooldown).toBeGreaterThan(0)
      expect(d.damage).toBeGreaterThan(0)
      expect(d.range).toBeGreaterThan(0)
      expect(d.count).toBeGreaterThan(0)
    }
  })

  test('los enemigos tienen vida, velocidad y radio positivos', () => {
    for (const d of ENEMY_DEFS) {
      expect(d.hp).toBeGreaterThan(0)
      expect(d.speed).toBeGreaterThan(0)
      expect(d.radius).toBeGreaterThan(0)
    }
  })

  test('el pool de proyectiles alcanza para la peor arma', () => {
    // La metralleta a máxima cadencia con la vida más larga de bala.
    const peor = WEAPON_DEFS.reduce((a, d) => Math.max(a, (d.count * d.lifetime) / d.cooldown), 0)
    expect(CONFIG.COMBAT.MAX_PROJECTILES).toBeGreaterThan(peor)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Élites: minijefes y jefes', () => {
  function crear() {
    const enemies = new EnemyManager(escena)
    const waves = { elapsed: 0, spawnMultiplier: 1 }
    const player = { position: { x: 0, y: 0, z: 0 } }
    return { boss: new BossController(enemies, waves, player, escena), enemies, waves, player }
  }

  const defDe = (key) => BOSS_DEFS[BOSS[key]]

  /** Hace aparecer y morir élites hasta que hayan salido `n`. */
  function saltarA(ctx, n) {
    while (ctx.boss.spawned < n) {
      ctx.waves.elapsed = ctx.boss.nextAt
      ctx.boss.update(0.016)
      ctx.enemies.resolveDamage() // por si limpió la arena
      const i = ctx.enemies.indexOfId(ctx.boss.bossId)
      if (i !== -1) ctx.enemies.damage(i, 1e9)
      ctx.boss.update(0.016)
    }
  }

  // ── la tabla ───────────────────────────────────────────────────────────
  test('el calendario está ordenado en el tiempo', () => {
    for (let i = 1; i < ELITE_SCHEDULE.length; i++) {
      expect(ELITE_SCHEDULE[i].at).toBeGreaterThan(ELITE_SCHEDULE[i - 1].at)
    }
  })

  test('todo lo que nombra el calendario existe en la tabla de élites', () => {
    for (const fila of ELITE_SCHEDULE) expect(defDe(fila.key)).toBeTruthy()
  })

  test('el calendario cumple la forma acordada: primero un minijefe, después un jefe', () => {
    // horda → minijefe CON la horda → jefe casi solo. Si el primer evento de
    // la partida fuera un jefe, el escalón intermedio no existiría.
    expect(defDe(ELITE_SCHEDULE[0].key).tier).toBe(ELITE_TIER.MINI)
    const primerJefe = ELITE_SCHEDULE.findIndex((f) => defDe(f.key).tier === ELITE_TIER.BOSS)
    expect(primerJefe).toBeGreaterThan(0)
  })

  test('cada élite tiene al menos una habilidad', () => {
    // Una sin embestida ni golpe de área sería un saco de vida caminando.
    for (const def of BOSS_DEFS) expect(!!(def.charge || def.slam)).toBe(true)
  })

  test('cada élite apunta a un arquetipo pesado y que no sale por oleada', () => {
    const porOleada = new Set()
    for (const etapa of WAVE_STAGES) for (const k in etapa.weights) porOleada.add(k)

    for (const def of BOSS_DEFS) {
      const enemigo = ENEMY_DEFS[def.enemyType]
      expect(enemigo).toBeTruthy()
      // Pesado: no lo empuja la separación ni lo bloquea la multitud.
      expect(enemigo.heavy).toBe(true)
      // Y ninguna oleada puede escupirlo: para eso está el calendario.
      expect(porOleada.has(enemigo.key)).toBe(false)
    }
  })

  test('el Cube King no embiste; el Segador sí', () => {
    // La embestida es de los cuerpos rápidos y angostos. Ver BossDefs.
    expect(defDe('CUBE_KING').charge).toBeFalsy()
    expect(defDe('CUBE_KING').slam).toBeTruthy()
    expect(defDe('REAPER').charge).toBeTruthy()
    expect(defDe('REAPER').slam).toBeTruthy()
  })

  // ── aparición ──────────────────────────────────────────────────────────
  test('aparece cuando toca y no antes', () => {
    const { boss, waves } = crear()
    waves.elapsed = ELITE_SCHEDULE[0].at - 1
    boss.update(0.016)
    expect(boss.active).toBe(false)

    waves.elapsed = ELITE_SCHEDULE[0].at
    boss.update(0.016)
    expect(boss.active).toBe(true)
  })

  test('el minijefe NO limpia la arena ni afloja el spawner', () => {
    // Es todo su sentido: sale ENTRE la horda, que sigue apareciendo igual.
    const ctx = crear()
    for (let i = 0; i < 30; i++) ctx.enemies.spawn(ENEMY_TYPE.NORMAL, i, 0)

    ctx.waves.elapsed = ELITE_SCHEDULE[0].at
    ctx.boss.update(0.016)
    ctx.enemies.resolveDamage()

    expect(ctx.boss.isBoss).toBe(false)
    expect(ctx.enemies.count).toBe(31) // los 30 de antes, más el minijefe
    expect(ctx.waves.spawnMultiplier).toBe(1)
  })

  test('el jefe sí limpia la arena, y la basura suelta sus gemas', () => {
    const ctx = crear()
    saltarA(ctx, 1) // el primero es minijefe: se lo saltea
    for (let i = 0; i < 30; i++) ctx.enemies.spawn(ENEMY_TYPE.NORMAL, i, 0)

    ctx.waves.elapsed = ctx.boss.nextAt
    ctx.boss.update(0.016)
    ctx.enemies.resolveDamage()

    expect(ctx.boss.isBoss).toBe(true)
    expect(ctx.enemies.deathCount).toBe(30)
    expect(ctx.enemies.count).toBe(1) // queda solo el jefe
  })

  test('el duelo del jefe afloja el spawner y al morir lo normaliza', () => {
    const ctx = crear()
    saltarA(ctx, 1)
    ctx.waves.elapsed = ctx.boss.nextAt
    ctx.boss.update(0.016)
    expect(ctx.waves.spawnMultiplier).toBe(CONFIG.BOSS.SPAWN_SLOWDOWN)

    ctx.enemies.damage(ctx.enemies.indexOfId(ctx.boss.bossId), 1e9)
    ctx.boss.update(0.016)
    expect(ctx.boss.active).toBe(false)
    expect(ctx.boss.defeated).toBe(2)
    expect(ctx.waves.spawnMultiplier).toBe(1)
  })

  test('nunca hay dos élites a la vez: la siguiente espera a que caiga', () => {
    // Sin esta regla, un jugador lento juntaría minijefes hasta volver la
    // pantalla ilegible, y peor: un jefe podría aparecer arriba de uno, y
    // "el jefe pelea solo" dejaría de ser cierto.
    const ctx = crear()
    ctx.waves.elapsed = ELITE_SCHEDULE[0].at
    ctx.boss.update(0.016)
    ctx.enemies.resolveDamage()

    // Pasa muchísimo tiempo sin que la maten.
    ctx.waves.elapsed = 10000
    for (let f = 0; f < 200; f++) ctx.boss.update(0.016)
    expect(ctx.boss.spawned).toBe(1)
    expect(ctx.enemies.count).toBe(1)

    // Cae, y la siguiente sale enseguida: la espera no se pierde.
    ctx.enemies.damage(ctx.enemies.indexOfId(ctx.boss.bossId), 1e9)
    ctx.boss.update(0.016)
    expect(ctx.boss.active).toBe(false)
    ctx.boss.update(0.016)
    expect(ctx.boss.spawned).toBe(2)
  })

  // ── escalado ───────────────────────────────────────────────────────────
  test('la vida NO escala dentro de la primera vuelta', () => {
    // Los números de ENEMY_DEFS son una curva diseñada. Multiplicarlos por
    // "cuántos ya salieron" la borraría: el cuarto minijefe pegaría más que
    // el primer jefe.
    const ctx = crear()
    for (let n = 0; n < ELITE_SCHEDULE.length; n++) {
      ctx.waves.elapsed = ctx.boss.nextAt
      ctx.boss.update(0.016)
      ctx.enemies.resolveDamage()

      const base = ENEMY_DEFS[defDe(ELITE_SCHEDULE[n].key).enemyType].hp
      expect(ctx.boss.maxHp).toBeCloseTo(base, 0.01)

      ctx.enemies.damage(ctx.enemies.indexOfId(ctx.boss.bossId), 1e9)
      ctx.boss.update(0.016)
    }
  })

  test('y sí escala al dar la vuelta al calendario', () => {
    const ctx = crear()
    saltarA(ctx, ELITE_SCHEDULE.length)

    ctx.waves.elapsed = ctx.boss.nextAt
    ctx.boss.update(0.016)
    ctx.enemies.resolveDamage()

    const base = ENEMY_DEFS[defDe(ELITE_SCHEDULE[0].key).enemyType].hp
    expect(ctx.boss.maxHp).toBeCloseTo(base * (1 + CONFIG.BOSS.HP_SCALE_PER_LOOP), 0.01)
  })

  test('agotada la tabla, el reloj sigue parejo cada LOOP_EVERY', () => {
    const largo = ELITE_SCHEDULE.length
    const ultimo = ELITE_SCHEDULE[largo - 1].at
    expect(eliteAt(largo).at).toBeCloseTo(ultimo + CONFIG.BOSS.LOOP_EVERY, 0.001)
    expect(eliteAt(largo).loop).toBe(1)
    expect(eliteAt(largo).key).toBe(ELITE_SCHEDULE[0].key)
  })

  // ── estado ─────────────────────────────────────────────────────────────
  test('un golpe a medio cargar no sobrevive a la muerte', () => {
    // Si sobreviviera, se resolvería sobre la élite siguiente, en el lugar
    // donde había marcado el anillo la anterior.
    const ctx = crear()
    ctx.waves.elapsed = ELITE_SCHEDULE[0].at
    ctx.boss.update(0.016)
    ctx.enemies.resolveDamage()

    ctx.boss._slamWindup = 0.4
    ctx.boss.slamRing.visible = true
    ctx.enemies.damage(ctx.enemies.indexOfId(ctx.boss.bossId), 1e9)
    ctx.boss.update(0.016)

    expect(ctx.boss._slamWindup).toBe(0)
    expect(ctx.boss.slamWarning).toBe(false)
    expect(ctx.boss.tier).toBe('')
  })

  test('reset deja el calendario en la primera entrada', () => {
    const ctx = crear()
    saltarA(ctx, 3)
    ctx.boss.reset()
    expect(ctx.boss.spawned).toBe(0)
    expect(ctx.boss.nextAt).toBe(ELITE_SCHEDULE[0].at)
    expect(ctx.boss.active).toBe(false)
  })

  test('la embestida funciona para cualquiera que la declare', () => {
    const { boss, enemies } = crear()
    const def = defDe('BRUTE')
    const i = enemies.spawn(def.enemyType, 0, 0)
    boss._chargeTimer = 0.1
    boss._chargeState = ''

    // Se cumple el temporizador: entra en aviso y SE FRENA.
    boss._updateCharge(0.2, i, def)
    expect(boss.chargePhase).toBe('TELEGRAPH')
    boss._updateCharge(0.1, i, def)
    expect(enemies.speed[i]).toBe(0)

    // Se cumple el aviso: arranca la embestida a la velocidad de la tabla.
    boss._updateCharge(def.charge.telegraph, i, def)
    expect(boss.chargePhase).toBe('CHARGING')
    expect(enemies.speed[i]).toBe(def.charge.speed)

    // Se acaba: vuelve a su velocidad normal.
    boss._updateCharge(def.charge.duration + 0.01, i, def)
    expect(boss.chargePhase).toBe('')
    // speed es un Float32Array: 2.9 no existe exacto en 32 bits.
    expect(enemies.speed[i]).toBeCloseTo(ENEMY_DEFS[def.enemyType].speed, 1e-5)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Elección de blanco', () => {
  function armar() {
    const enemies = new EnemyManager(escena)
    const player = { position: { x: 0, y: 0, z: 0 }, isMoving: false, faceTowards() {}, recoil() {} }
    const disparos = []
    const projectiles = { fire: (x, z, dx, dz) => disparos.push({ dx, dz }) }
    const w = new WeaponSystem(player, enemies, projectiles)
    w.equip('PISTOL')
    return { w, enemies, player, disparos }
  }

  const LEJOS = CONFIG.COMBAT.PRIORITY_GUARD_RADIUS + 4

  test('sin prioritarios le pega al más cercano', () => {
    const { w, enemies } = armar()
    const lejano = enemies.spawn(ENEMY_TYPE.NORMAL, 0, 15)
    const cerca = enemies.spawn(ENEMY_TYPE.NORMAL, 0, 3)
    expect(w._findTarget(w.range)).toBe(cerca)
    expect(lejano).toBe(0)
  })

  test('con el boss lejos y nada encima, le apunta al boss', () => {
    const { w, enemies } = armar()
    enemies.spawn(ENEMY_TYPE.NORMAL, 0, LEJOS)
    const boss = enemies.spawn(ENEMY_TYPE.CUBE_KING, 0, LEJOS + 3)
    // El boss está MÁS LEJOS que la basura y aun así gana.
    expect(w._findTarget(w.range)).toBe(boss)
  })

  test('pero lo que tenés encima manda sobre el boss', () => {
    const { w, enemies } = armar()
    enemies.spawn(ENEMY_TYPE.CUBE_KING, 0, LEJOS)
    const pegado = enemies.spawn(ENEMY_TYPE.NORMAL, 0, 2)
    expect(w._findTarget(w.range)).toBe(pegado)
  })

  test('el radio de amenaza es el límite exacto', () => {
    const g = CONFIG.COMBAT.PRIORITY_GUARD_RADIUS
    const a = armar()
    a.enemies.spawn(ENEMY_TYPE.CUBE_KING, 0, LEJOS)
    const dentro = a.enemies.spawn(ENEMY_TYPE.NORMAL, 0, g - 0.5)
    expect(a.w._findTarget(a.w.range)).toBe(dentro)

    const b = armar()
    const boss = b.enemies.spawn(ENEMY_TYPE.CUBE_KING, 0, LEJOS)
    b.enemies.spawn(ENEMY_TYPE.NORMAL, 0, g + 0.5)
    expect(b.w._findTarget(b.w.range)).toBe(boss)
  })

  test('nada a tiro devuelve -1', () => {
    const { w, enemies } = armar()
    enemies.spawn(ENEMY_TYPE.NORMAL, 0, w.range + 5)
    expect(w._findTarget(w.range)).toBe(-1)
  })

  test('en manual dispara hacia el mouse aunque no haya nadie', () => {
    const { w, disparos } = armar()
    w.aimActive = true
    w.aimX = 10
    w.aimZ = 0
    expect(w._fire()).toBe(true)
    expect(disparos.length).toBe(1)
    // El eje X del disparo tiene que apuntar a +X, que es donde puse el mouse.
    expect(disparos[0].dx).toBeCloseTo(1, 1e-6)
  })

  test('en automático sin blanco no dispara', () => {
    const { w, disparos } = armar()
    expect(w._fire()).toBe(false)
    expect(disparos.length).toBe(0)
  })
})


// ═══════════════════════════════════════════════════════════════════════════
describe('Tabla de habilidades de personaje', () => {
  test('cada una nombra un arma que existe', () => {
    for (const def of SKILL_DEFS) {
      if (!def.weapon) continue
      expect(typeof WEAPON[def.weapon]).toBe('number')
    }
  })

  test('ningún personaje se queda sin habilidades propias', () => {
    // Eran tres por arma. La pistola y la escopeta bajaron a dos cuando se
    // borraron `Cañón trasero` y `Abanico trasero`: lo que hacían —cubrirte
    // la espalda— ahora lo hace un compañero de verdad. Lo que sigue
    // importando es que nadie quede con menos que la metralleta menos una.
    for (const w of WEAPON_DEFS) {
      expect(SKILL_DEFS.filter((d) => d.weapon === w.key).length).toBeGreaterThan(1)
    }
  })

  test('la espalda ya no se cubre disparando para atrás', () => {
    // El modificador entero se fue, no solo las filas que lo usaban. Si
    // quedara la clave, alguien podría volver a escribir la habilidad falsa
    // sin enterarse de que se sacó a propósito.
    expect('backfire' in createWeaponMods()).toBe(false)
    for (const def of SKILL_DEFS) {
      if (def.kind !== SKILL_KIND.WEAPON) continue
      for (const l of def.levels) expect('backfire' in l.mods).toBe(false)
    }
  })

  test('todos los modificadores que declaran existen de verdad', () => {
    // Este es el test que justifica el archivo WeaponMods. Un typo en una clave
    // ('ricochett') no rompe nada: la habilidad se equipa, sube de nivel, se ve
    // en el HUD y no hace absolutamente nada. Es el peor bug posible acá.
    const validas = createWeaponMods()
    for (const def of SKILL_DEFS) {
      if (def.kind !== SKILL_KIND.WEAPON) continue
      for (const l of def.levels) {
        expect(l.mods).toBeTruthy()
        for (const k in l.mods) expect(k in validas).toBe(true)
      }
    }
  })

  test('el neutro no es todo cero, y reset lo respeta', () => {
    const m = createWeaponMods()
    expect(m.burstCooldown).toBe(1)
    expect(m.ricochetKeep).toBe(1)

    m.ramp = 0.5
    m.burstCooldown = 2
    m.ricochetKeep = 0.1
    resetWeaponMods(m)
    expect(m.ramp).toBe(0)
    expect(m.burstCooldown).toBe(1)
    expect(m.ricochetKeep).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('El mazo filtra por arma', () => {
  function disponibles(armaKey) {
    const ctx = {
      progression: new Progression(),
      player: { maxHp: 100, hp: 100, speedMult: 1 },
      weapons: { def: WEAPON_DEFS[WEAPON[armaKey]] },
      skills: { owned: [], levelOf: () => 0, grant() {} },
    }
    return UPGRADE_DEFS.filter((u) => !u.available || u.available(ctx)).map((u) => u.key)
  }

  test('con la pistola no aparecen las de escopeta ni metralleta', () => {
    const claves = disponibles('PISTOL')
    expect(claves).toContain('S_PISTOL_RICOCHET')
    expect(claves.includes('S_SHOTGUN_KNOCK')).toBe(false)
    expect(claves.includes('S_SMG_RAMP')).toBe(false)
  })

  test('cada arma ve las tres suyas', () => {
    for (const w of WEAPON_DEFS) {
      const claves = disponibles(w.key)
      const propias = SKILL_DEFS.filter((d) => d.weapon === w.key)
      for (const d of propias) expect(claves).toContain('S_' + d.key)
    }
  })

  test('la base compartida la ven todas', () => {
    for (const w of WEAPON_DEFS) {
      expect(disponibles(w.key)).toContain('S_ORBIT')
      expect(disponibles(w.key)).toContain('S_PULSE')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Habilidades que cambian el arma', () => {
  function armar(armaKey = 'PISTOL') {
    const enemies = new EnemyManager(escena)
    const player = { position: { x: 0, y: 0, z: 0 }, isMoving: false, faceTowards() {}, recoil() {} }
    const disparos = []
    const projectiles = {
      fire: (x, z, dx, dz, def, dmg, boomR = 0, boomD = 0) =>
        disparos.push({ x, z, dx, dz, dmg, boomR, boomD }),
    }
    const mods = createWeaponMods()
    const w = new WeaponSystem(player, enemies, projectiles, mods)
    w.equip(armaKey)
    return { w, enemies, disparos, mods }
  }

  test('el que dispara mira al blanco, no le da la espalda', () => {
    // Bug real y viejo: con un enemigo justo adelante, el soldado quedaba
    // girado 180° y le disparaba por encima del hombro. El muñeco mira hacia
    // su -Z local, así que su rotación tiene que ser atan2(-dx,-dz).
    const enemies = new EnemyManager(escena)
    let rot = null
    const player = {
      position: { x: 0, y: 0, z: 0 },
      isMoving: false,
      faceTowards(a) {
        rot = a
      },
      recoil() {},
    }
    const w = new WeaponSystem(player, enemies, { fire: () => {} })
    w.equip('PISTOL')
    enemies.spawn(ENEMY_TYPE.NORMAL, 0, -6) // justo al norte

    w._fire()

    // Su -Z local llevado al mundo tiene que apuntar al enemigo.
    const mira = { x: -Math.sin(rot), z: -Math.cos(rot) }
    expect(mira.x).toBeCloseTo(0, 1e-6)
    expect(mira.z).toBeCloseTo(-1, 1e-6) // el enemigo está en -Z
  })

  test('un arma dispara una sola andanada, y para adelante', () => {
    // Reemplaza al test de `Cañón trasero`. Que NO salga nada hacia atrás es
    // ahora parte del diseño: la espalda la cubre un compañero.
    const { w, enemies, disparos } = armar()
    enemies.spawn(ENEMY_TYPE.NORMAL, 0, 5)

    w._fire()
    expect(disparos.length).toBe(1)
    expect(disparos[0].dz).toBeGreaterThan(0) // hacia el enemigo, que está en +Z
  })

  test('Doble línea sale al costado y en paralelo, no en abanico', () => {
    const { w, enemies, disparos, mods } = armar('SMG')
    enemies.spawn(ENEMY_TYPE.NORMAL, 0, 5)
    mods.parallel = 2
    mods.parallelGap = 0.5
    mods.parallelDamage = 0.8

    w._fire()

    expect(disparos.length).toBe(3)
    // Mismo rumbo las tres: si se abrieran, sería un abanico y ya existe uno.
    expect(disparos[1].dx).toBeCloseTo(disparos[0].dx, 1e-6)
    expect(disparos[2].dx).toBeCloseTo(disparos[0].dx, 1e-6)
    // Y salen de puntos distintos, uno a cada lado.
    expect(disparos[1].x).toBeCloseTo(0.5, 1e-6)
    expect(disparos[2].x).toBeCloseTo(-0.5, 1e-6)
  })

  test('Bala explosiva sale cada N balas y solo esa', () => {
    const { w, enemies, disparos, mods } = armar('SMG')
    enemies.spawn(ENEMY_TYPE.NORMAL, 0, 5)
    mods.boomEvery = 3
    mods.boomRadius = 2
    mods.boomDamage = 40

    for (let i = 0; i < 6; i++) w._fire()

    expect(disparos.length).toBe(6)
    expect(disparos.filter((d) => d.boomR > 0).length).toBe(2)
    expect(disparos[2].boomR).toBe(2)
    expect(disparos[5].boomD).toBe(40)
  })

  test('Doble cañón encarece la recarga y suelta la ráfaga después', () => {
    const { w, enemies, disparos, mods } = armar('SHOTGUN')
    enemies.spawn(ENEMY_TYPE.NORMAL, 0, 5)
    const recargaBase = w.def.cooldown * w.cooldownMult

    mods.burst = 1
    mods.burstDelay = 0.1
    mods.burstCooldown = 1.5
    expect(w.def.cooldown * w.cooldownMult).toBeCloseTo(recargaBase * 1.5, 1e-6)

    w.update(0.016)
    const primera = disparos.length
    expect(primera).toBe(w.shotCount)

    w.update(0.05) // todavía no
    expect(disparos.length).toBe(primera)
    w.update(0.06) // ahora sí
    expect(disparos.length).toBe(primera * 2)
  })

  test('Calentamiento acelera con fuego sostenido y se va al parar', () => {
    const { w, enemies, mods } = armar('SMG')
    enemies.spawn(ENEMY_TYPE.NORMAL, 0, 5)
    mods.ramp = 0.4
    mods.rampTime = 1

    const frio = w.cooldownMult
    for (let i = 0; i < 60; i++) w.update(1 / 60)
    expect(w.cooldownMult).toBeLessThan(frio)
    expect(w._heat).toBeCloseTo(1, 0.02)

    // Sin nadie a tiro no dispara, y el arma se enfría.
    enemies.clear()
    for (let i = 0; i < 60; i++) w.update(1 / 60)
    expect(w._heat).toBe(0)
    expect(w.cooldownMult).toBeCloseTo(frio, 1e-6)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Balas con habilidades', () => {
  const PISTOLA = WEAPON_DEFS[WEAPON.PISTOL]

  function armar() {
    const enemies = new EnemyManager(escena)
    const mods = createWeaponMods()
    return { enemies, p: new ProjectileManager(escena, enemies, mods), mods }
  }

  /** Una bala saliendo del origen hacia +Z, con la rejilla al día. */
  function tirar(p, enemies, def = PISTOLA) {
    enemies.grid.build(enemies.posX, enemies.posZ, enemies.count)
    p.fire(0, 0, 0, 1, def)
  }

  test('sin Perforación total, un tanque frena la bala', () => {
    const { enemies, p } = armar()
    enemies.spawn(ENEMY_TYPE.TANK, 0, 1)
    tirar(p, enemies)
    p.update(0.05)
    expect(p.count).toBe(0)
  })

  test('con Perforación total, la atraviesa', () => {
    const { enemies, p, mods } = armar()
    mods.pierceAll = 1
    enemies.spawn(ENEMY_TYPE.TANK, 0, 1)
    tirar(p, enemies)
    p.update(0.05)
    expect(p.count).toBe(1)
  })

  test('Impacto empuja al que recibe', () => {
    const { enemies, p, mods } = armar()
    mods.knockback = 1
    const i = enemies.spawn(ENEMY_TYPE.NORMAL, 0, 1)
    tirar(p, enemies)
    p.update(0.05)
    expect(enemies.posZ[i]).toBeCloseTo(2, 1e-6)
  })

  test('pero al boss no lo mueve', () => {
    const { enemies, p, mods } = armar()
    mods.knockback = 1
    const i = enemies.spawn(ENEMY_TYPE.CUBE_KING, 0, 1)
    tirar(p, enemies)
    p.update(0.05)
    expect(enemies.posZ[i]).toBe(1)
  })

  test('Rebote reapunta la bala en vez de gastarla', () => {
    const { enemies, p, mods } = armar()
    mods.ricochet = 1
    mods.ricochetKeep = 0.5

    enemies.spawn(ENEMY_TYPE.NORMAL, 0, 1)
    enemies.spawn(ENEMY_TYPE.NORMAL, 4, 1)

    // Sin penetración: el rebote tiene que entrar justo cuando la bala moriría.
    tirar(p, enemies, { ...PISTOLA, pierce: 0 })
    const inicial = p.damage[0]

    p.update(0.05)

    expect(p.count).toBe(1)
    expect(p.velX[0]).toBeGreaterThan(0)
    expect(p.damage[0]).toBeCloseTo(inicial * 0.5, 1e-6)
    expect(p.bounces[0]).toBe(0)
  })

  test('sin nadie a quien saltar, la bala muere igual', () => {
    const { enemies, p, mods } = armar()
    mods.ricochet = 1
    enemies.spawn(ENEMY_TYPE.NORMAL, 0, 1)
    tirar(p, enemies, { ...PISTOLA, pierce: 0 })
    p.update(0.05)
    expect(p.count).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('SkillSystem', () => {
  function armar() {
    const enemies = new EnemyManager(escena)
    const player = { position: { x: 0, y: 0, z: 0 } }
    const mods = createWeaponMods()
    const s = new SkillSystem(player, enemies, new Progression(), escena, mods)
    return { s, enemies, mods }
  }

  test('una habilidad de arma se traduce a modificadores', () => {
    const { s, mods } = armar()
    const def = SKILL_DEFS[SKILL.SMG_RAMP]

    s.grant('SMG_RAMP')
    expect(mods.ramp).toBe(def.levels[0].mods.ramp)

    s.grant('SMG_RAMP')
    expect(mods.ramp).toBe(def.levels[1].mods.ramp)

    s.reset()
    expect(mods.ramp).toBe(0)
  })

  test('las que no son de arma no tocan los modificadores', () => {
    const { s, mods } = armar()
    s.grant('ORBIT')
    s.grant('STRIKE')
    expect(mods).toEqual(createWeaponMods())
  })

  test('la onda expansiva empuja a la horda y no al boss', () => {
    const { s, enemies } = armar()
    const lvl = SKILL_DEFS[SKILL.PULSE].levels[0]
    const drone = enemies.spawn(ENEMY_TYPE.NORMAL, 0, 1)
    const boss = enemies.spawn(ENEMY_TYPE.CUBE_KING, 0, 2)

    s._pulse(lvl)

    expect(enemies.posZ[drone]).toBeCloseTo(1 + lvl.push, 1e-6)
    expect(enemies.posZ[boss]).toBe(2)
  })

})


// ═══════════════════════════════════════════════════════════════════════════
describe('Recolección', () => {
  /** Enemigos ya muertos: se falsea el buffer de muertos del frame. */
  function muertos(...filas) {
    const e = {
      deathCount: filas.length,
      deathX: filas.map((f) => f[0]),
      deathZ: filas.map((f) => f[1]),
      deathXp: filas.map((f) => f[2]),
      deathCoin: filas.map((f) => f[3]),
    }
    return e
  }

  test('cada enemigo deja una gema Y una moneda', () => {
    const p = new PickupManager(escena)
    p.spawnFromDeaths(muertos([3, 4, 1, 1], [5, 6, 5, 3]))

    expect(p.count).toBe(4)
    const gemas = [...p.kind.slice(0, 4)].filter((k) => k === PICKUP_KIND.XP).length
    const monedas = [...p.kind.slice(0, 4)].filter((k) => k === PICKUP_KIND.COIN).length
    expect(gemas).toBe(2)
    expect(monedas).toBe(2)
  })

  test('la tabla de enemigos dice cuánta moneda suelta cada uno', () => {
    for (const def of ENEMY_DEFS) expect(def.coin > 0).toBe(true)
  })

  test('lo que se junta se reparte por tipo', () => {
    const p = new PickupManager(escena)
    // Encima del jugador: se recoge en el primer update.
    p._add(PICKUP_KIND.XP, 0, 0, 7)
    p._add(PICKUP_KIND.COIN, 0, 0, 4)
    p._add(PICKUP_KIND.HEART, 0, 0, 35)

    p.update(0.016, { x: 0, z: 0 }, 3)

    expect(p.gotXp).toBe(7)
    expect(p.gotCoins).toBe(4)
    expect(p.gotHeal).toBe(35)
    expect(p.count).toBe(0)
  })

  test('el botín se atrae, el bonus del mapa no', () => {
    const p = new PickupManager(escena)
    p._add(PICKUP_KIND.XP, 2, 0, 1) // indice 0
    p._add(PICKUP_KIND.HEART, -2, 0, 35) // indice 1

    p.update(0.1, { x: 0, z: 0 }, 5)

    // La gema se acercó (sin llegar); el corazón sigue exactamente donde estaba.
    expect(p.posX[0]).toBeLessThan(2)
    expect(p.posX[0]).toBeGreaterThan(0)
    expect(p.posX[1]).toBe(-2)
  })

  test('el imán agarrado atrae TODO, incluido lo del mapa', () => {
    const p = new PickupManager(escena)
    p._add(PICKUP_KIND.HEART, -20, 0, 35)
    p._add(PICKUP_KIND.MAGNET, 0, 0, 0) // encima: se agarra ya

    p.update(0.016, { x: 0, z: 0 }, 3)
    expect(p.gotMagnets).toBe(1)
    expect(p.magnetTimer).toBeGreaterThan(0)

    // Ahora el corazón, que estaba a 20 unidades, viene solo.
    const antes = p.posX[0]
    p.update(0.1, { x: 0, z: 0 }, 3)
    expect(p.posX[0]).toBeGreaterThan(antes)
  })

  test('el imán no se acumula agarrando dos', () => {
    const p = new PickupManager(escena)
    p._add(PICKUP_KIND.MAGNET, 0, 0, 0)
    p._add(PICKUP_KIND.MAGNET, 0, 0, 0)
    p.update(0.016, { x: 0, z: 0 }, 3)
    expect(p.gotMagnets).toBe(2)
    expect(p.magnetTimer).toBe(CONFIG.PROGRESSION.MAGNET_PICKUP_TIME)
  })

  test('con el pool lleno, lo que no entra se acredita igual', () => {
    const p = new PickupManager(escena)
    p.count = p.max // lleno a mano: llenarlo de verdad son 1200 spawns
    const sobra = p.spawnFromDeaths(muertos([0, 0, 9, 4]))
    expect(sobra.xp).toBe(9)
    expect(sobra.coins).toBe(4)
  })

  test('el mapa siembra bonus cada tanto, con tope', () => {
    const p = new PickupManager(escena)
    const pos = { x: 0, z: 0 }
    const { BONUS_FIRST_AT, BONUS_EVERY, BONUS_MAX_ON_MAP, BONUS_MIN_DIST } = CONFIG.PROGRESSION

    // Antes del primero no hay nada.
    p.update(BONUS_FIRST_AT - 1, pos, 0)
    expect(p.count).toBe(0)

    // Y no se acumulan más del tope, por mucho que pase el tiempo.
    for (let n = 0; n < 20; n++) p.update(BONUS_EVERY, pos, 0)
    expect(p.count).toBe(BONUS_MAX_ON_MAP)

    // Ninguno cae encima del jugador: hay que ir a buscarlo.
    for (let i = 0; i < p.count; i++) {
      const d = Math.hypot(p.posX[i], p.posZ[i])
      expect(d).toBeGreaterThan(BONUS_MIN_DIST - 0.001)
    }
  })

  test('clear deja el sistema como recién arrancado', () => {
    const p = new PickupManager(escena)
    p.spawnFromDeaths(muertos([1, 1, 1, 1]))
    p.magnetTimer = 2
    p.clear()

    expect(p.count).toBe(0)
    expect(p.magnetTimer).toBe(0)
    expect(p.bonusTimer).toBe(CONFIG.PROGRESSION.BONUS_FIRST_AT)
  })

  test('las siluetas del mapa son distintas de las del botín', () => {
    // De lejos y chiquitas, la forma se lee antes que el color.
    const formas = new Set(PICKUP_DEFS.map((d) => d.shape))
    expect(formas.size).toBe(PICKUP_DEFS.length)
  })
})


// ═══════════════════════════════════════════════════════════════════════════
describe('Mudanza del perfil al renombrar el juego', () => {
  const VIEJA = 'neon-survivors.profile.v1'
  const NUEVA = 'rtzblood.profile.v1'
  const perfilViejo = JSON.stringify({
    currency: 1826,
    weapon: 'SHOTGUN',
    runs: 8,
    bestSeconds: 143.5,
    upgrades: { SHOTGUN: { COUNT: 2 } },
  })

  test('un perfil con el nombre viejo no se pierde', () => {
    // Es lo único que el renombre podía romper de verdad: la moneda y las
    // armas mejoradas de alguien que ya venía jugando.
    const store = almacenFalso(perfilViejo, VIEJA)
    const p = new PlayerProfile(store)

    expect(p.currency).toBe(1826)
    expect(p.weapon).toBe('SHOTGUN')
    expect(p.runs).toBe(8)
    expect(p.upgrades.SHOTGUN.COUNT).toBe(2)
  })

  test('y queda reescrito bajo el nombre nuevo', () => {
    // Si no, cada arranque volvería a leer el viejo y la mudanza no terminaría.
    const store = almacenFalso(perfilViejo, VIEJA)
    new PlayerProfile(store)
    expect(JSON.parse(store.getItem(NUEVA)).currency).toBe(1826)
  })

  test('si existen las dos, gana la nueva', () => {
    const store = almacenFalso()
    store.setItem(VIEJA, JSON.stringify({ currency: 999 }))
    store.setItem(NUEVA, JSON.stringify({ currency: 50 }))
    expect(new PlayerProfile(store).currency).toBe(50)
  })

  test('borrar el perfil se lleva las dos claves', () => {
    // Si quedara la vieja, el arranque siguiente la resucitaría por la mudanza
    // y el botón "Borrar perfil" sería mentira.
    const store = almacenFalso(perfilViejo, VIEJA)
    const p = new PlayerProfile(store)
    p.wipe()

    expect(store.getItem(VIEJA)).toBe(null)
    expect(store.getItem(NUEVA)).toBe(null)
    expect(new PlayerProfile(store).currency).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Ajustes', () => {
  test('un perfil nuevo trae los ajustes de fábrica', () => {
    const p = new PlayerProfile(almacenFalso())
    expect(p.volume).toBe(0.9)
    expect(p.bloom).toBe(CONFIG.VFX.BLOOM)
    expect(p.quality).toBe('high')
    expect(p.aimManual).toBe(false)
  })

  test('se guardan y vuelven tal cual', () => {
    const store = almacenFalso()
    const p = new PlayerProfile(store)
    p.volume = 0.35
    p.bloom = false
    p.quality = 'low'
    p.aimManual = true
    p.save()

    const otro = new PlayerProfile(store)
    expect(otro.volume).toBe(0.35)
    expect(otro.bloom).toBe(false)
    expect(otro.quality).toBe('low')
    expect(otro.aimManual).toBe(true)
  })

  test('un volumen fuera de rango se recorta, no se descarta', () => {
    // Lo que vuelve de localStorage lo pudo escribir cualquiera con la
    // consola abierta. Un 8 acá sería un golpe de audio a todo lo que da.
    const alto = new PlayerProfile(almacenFalso(JSON.stringify({ volume: 8 })))
    expect(alto.volume).toBe(1)

    const bajo = new PlayerProfile(almacenFalso(JSON.stringify({ volume: -3 })))
    expect(bajo.volume).toBe(0)
  })

  test('una calidad inventada no entra', () => {
    const p = new PlayerProfile(almacenFalso(JSON.stringify({ quality: 'ultra' })))
    expect(p.quality).toBe('high')
  })

  test('borrar el perfil devuelve los ajustes a fábrica', () => {
    // El botón promete dejar el juego como recién abierto. Un volumen al 10%
    // sobreviviendo al borrado haría pensar que el sonido está roto.
    const store = almacenFalso()
    const p = new PlayerProfile(store)
    p.volume = 0.1
    p.quality = 'low'
    p.save()
    p.wipe()

    expect(p.volume).toBe(0.9)
    expect(p.quality).toBe('high')
  })

  test('el volumen y el silencio son dos cosas distintas', () => {
    // Si bajar el volumen silenciara, subirlo tendría que acordarse de
    // des-silenciar — y el que además apretó M se quedaría mudo sin saber
    // por qué. El mezclador los aplica en cascada, no mezclados.
    const s = new SoundManager()
    s.master = { gain: { value: 0 } } // mezclador de mentira: no hace falta WebAudio

    s.setVolume(0.5)
    expect(s.master.gain.value).toBe(0.5)

    s.setMuted(true)
    expect(s.master.gain.value).toBe(0)

    // Mover el volumen mientras está silenciado NO devuelve el sonido...
    s.setVolume(0.8)
    expect(s.master.gain.value).toBe(0)

    // ...pero al des-silenciar aparece el volumen nuevo, no el viejo.
    s.setMuted(false)
    expect(s.master.gain.value).toBe(0.8)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('El enemigo que se parte', () => {
  test('al morir deja dos larvas donde estaba', () => {
    const e = new EnemyManager(escena)
    e.spawn(ENEMY_TYPE.SPLITTER, 5, -3)
    e.queueDamage(0, 1e6)
    e.resolveDamage()

    expect(e.count).toBe(2)
    for (let i = 0; i < e.count; i++) {
      expect(e.type[i]).toBe(ENEMY_TYPE.SWARM)
      // Cerca de donde cayó el padre, no encima: si salieran en el mismo
      // punto la separación tendría que desapilarlas a empujones.
      expect(Math.abs(e.posX[i] - 5)).toBeLessThan(1)
      expect(Math.abs(e.posZ[i] + 3)).toBeLessThan(1)
    }
  })

  test('las crías heredan el multiplicador de vida del padre', () => {
    // Sin esto, un Mitosis del minuto seis dejaría dos larvas de juguete y
    // partirse dejaría de significar nada.
    const e = new EnemyManager(escena)
    e.spawn(ENEMY_TYPE.SPLITTER, 0, 0, 4)
    e.queueDamage(0, 1e6)
    e.resolveDamage()

    const larva = ENEMY_DEFS[ENEMY_TYPE.SWARM].hp
    for (let i = 0; i < e.count; i++) expect(e.maxHp[i]).toBeCloseTo(larva * 4, 0.01)
  })

  test('la limpieza de arena del jefe no lo hace partirse', () => {
    // Partirse es la recompensa por matarlo, no algo que pase por decreto:
    // si no, el duelo del jefe empezaría con la arena sembrada de larvas.
    const e = new EnemyManager(escena)
    for (let i = 0; i < 5; i++) e.spawn(ENEMY_TYPE.SPLITTER, i, 0)
    e.queueWipe()
    e.resolveDamage()

    expect(e.count).toBe(0)
    expect(e.deathCount).toBe(5)
  })

  test('y la bandera de limpieza no queda encendida para el frame siguiente', () => {
    const e = new EnemyManager(escena)
    e.queueWipe() // sobre una arena vacía: no deja nada pendiente
    e.resolveDamage()

    e.spawn(ENEMY_TYPE.SPLITTER, 0, 0)
    e.queueDamage(0, 1e6)
    e.resolveDamage()
    expect(e.count).toBe(2)
  })

  test('en lo que se parte no puede partirse a su vez', () => {
    // Un ciclo acá llenaría la horda hasta el techo con una sola muerte.
    for (const def of ENEMY_DEFS) {
      if (!def.splits) continue
      const cria = ENEMY_DEFS[ENEMY_TYPE[def.splits.into]]
      expect(cria).toBeTruthy()
      expect(cria.splits).toBeFalsy()
    }
  })

  test('con la horda al tope no se parte, y no se pasa del techo', () => {
    const e = new EnemyManager(escena)
    while (e.count < e.max) e.spawn(ENEMY_TYPE.SPLITTER, 0, 0)

    e.queueDamage(0, 1e6)
    e.resolveDamage()
    expect(e.count).toBeLessThan(e.max + 1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Composición de las oleadas', () => {
  test('cada peso nombra un tipo que existe', () => {
    for (const etapa of WAVE_STAGES) {
      for (const key in etapa.weights) expect(ENEMY_TYPE[key] !== undefined).toBe(true)
    }
  })

  test('un tipo con peso cero nunca sale', () => {
    // Es lo que rompía acumular los pesos en el orden en que están
    // escritos: con los acumulados desordenados, _pickType devolvía tipos
    // que la etapa no nombraba.
    const e = new EnemyManager(escena)
    const w = new WaveManager(e)
    w.stageIndex = 0 // la primera etapa solo nombra NORMAL

    for (let i = 0; i < 3000; i++) expect(w._pickType()).toBe(ENEMY_TYPE.NORMAL)
  })

  test('las proporciones son las de la tabla, no las del orden de escritura', () => {
    const e = new EnemyManager(escena)
    const w = new WaveManager(e)
    const etapa = WAVE_STAGES.length - 1
    w.stageIndex = etapa

    const pesos = WAVE_STAGES[etapa].weights
    let total = 0
    for (const k in pesos) total += pesos[k]

    const cuenta = new Array(ENEMY_DEFS.length).fill(0)
    const N = 40000
    for (let i = 0; i < N; i++) cuenta[w._pickType()]++

    for (const k in pesos) {
      const esperado = pesos[k] / total
      const real = cuenta[ENEMY_TYPE[k]] / N
      expect(real).toBeCloseTo(esperado, 0.02)
    }
  })

  test('ninguna oleada puede escupir una élite', () => {
    const elites = new Set(BOSS_DEFS.map((d) => ENEMY_DEFS[d.enemyType].key))
    for (const etapa of WAVE_STAGES) {
      for (const key in etapa.weights) expect(elites.has(key)).toBe(false)
    }
  })

  test('la horda tardía no es la misma horda más grande', () => {
    // La proporción de drones baja mientras sube todo lo demás: si el peso
    // del drone se mantuviera, agregar tipos nuevos sería decoración.
    const primera = WAVE_STAGES[0].weights
    const ultima = WAVE_STAGES[WAVE_STAGES.length - 1].weights
    expect(ultima.NORMAL).toBeLessThan(primera.NORMAL)
    expect(Object.keys(ultima).length).toBeGreaterThan(Object.keys(primera).length)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Escuadrón', () => {
  /**
   * Escuadrón de mentira.
   *
   * El de verdad construye soldados y anillos, o sea WebGL y un canvas, y
   * esto corre en Node. Lo que se prueba acá es la REGLA —a quién se puede
   * sumar y cuándo—, que es lo que decide el mazo del menú de nivel y lo
   * único que puede regalarte dos veces el mismo personaje.
   */
  function escuadronFalso(...iniciales) {
    const dentro = [...iniciales]
    return {
      get size() {
        return 1 + dentro.length
      },
      get full() {
        return this.size >= CONFIG.SQUAD.MAX
      },
      get keys() {
        return [...dentro]
      },
      has: (k) => dentro.includes(k),
      add(k) {
        if (this.full || this.has(k)) return false
        dentro.push(k)
        return true
      },
    }
  }

  function contexto(squad, armaPropia = WEAPON_DEFS[0].key) {
    return {
      squad,
      weapons: { def: { key: armaPropia } },
      skills: { owned: [], levelOf: () => 0 },
      progression: new Progression(),
      player: { position: { x: 0, z: 0 } },
    }
  }

  const compañeros = () => UPGRADE_DEFS.filter((u) => u.tag === 'COMPAÑERO')

  test('hay una opción por personaje del juego', () => {
    // Derivadas de WEAPON_DEFS: agregar un personaje lo hace aparecer solo
    // en el menú de nivel, sin tocar el mazo.
    expect(compañeros().length).toBe(WEAPON_DEFS.length)
  })

  test('no te ofrece el personaje que ya estás jugando', () => {
    const ctx = contexto(escuadronFalso(), WEAPON_DEFS[0].key)
    const ofrecidos = compañeros().filter((u) => u.available(ctx))
    expect(ofrecidos.length).toBe(WEAPON_DEFS.length - 1)
    expect(ofrecidos.some((u) => u.key === 'C_' + WEAPON_DEFS[0].key)).toBe(false)
  })

  test('ni uno que ya tenés', () => {
    const otro = WEAPON_DEFS[1].key
    const ctx = contexto(escuadronFalso(otro), WEAPON_DEFS[0].key)
    expect(compañeros().some((u) => u.key === 'C_' + otro)).toBe(true)
    expect(compañeros().find((u) => u.key === 'C_' + otro).available(ctx)).toBe(false)
  })

  test('con el escuadrón lleno no se ofrece ninguno', () => {
    const ctx = contexto(escuadronFalso(WEAPON_DEFS[1].key, WEAPON_DEFS[2].key))
    expect(ctx.squad.full).toBe(true)
    for (const u of compañeros()) expect(u.available(ctx)).toBe(false)
  })

  test('el máximo cuenta al principal', () => {
    // MAX 3 son vos y DOS compañeros, no tres compañeros.
    const s = escuadronFalso()
    expect(s.size).toBe(1)
    expect(s.add(WEAPON_DEFS[1].key)).toBe(true)
    expect(s.add(WEAPON_DEFS[2].key)).toBe(true)
    expect(s.full).toBe(true)
    expect(s.size).toBe(CONFIG.SQUAD.MAX)
  })

  test('tomar la mejora suma al personaje', () => {
    const ctx = contexto(escuadronFalso())
    const otro = WEAPON_DEFS[1].key
    compañeros().find((u) => u.key === 'C_' + otro).apply(ctx)
    expect(ctx.squad.has(otro)).toBe(true)
  })

  test('el compañero pega menos que vos con la misma arma', () => {
    // Un arma entera que llega completa por UNA elección tiene que costar
    // algo: la habilidad que reemplaza llegaba al 100% recién en su quinto
    // nivel.
    const enemies = new EnemyManager(escena)
    const jugador = { position: { x: 0, y: 0, z: 0 }, isMoving: false, faceTowards() {}, recoil() {} }
    const proyectiles = { fire: () => {} }

    const mia = new WeaponSystem(jugador, enemies, proyectiles)
    const suya = new WeaponSystem(jugador, enemies, proyectiles)
    mia.equip('PISTOL')
    suya.equip('PISTOL')
    suya.damageScale = CONFIG.SQUAD.DAMAGE_MULT

    expect(suya.damageMult).toBeCloseTo(mia.damageMult * CONFIG.SQUAD.DAMAGE_MULT, 1e-6)
    expect(suya.damageMult).toBeLessThan(mia.damageMult)
  })

  test('hay un puesto por cada lugar del escuadrón', () => {
    // Si alguien sube MAX sin agregar un ángulo, el tercer compañero no
    // tendría dónde pararse y la mejora se aplicaría sin que aparezca nadie.
    expect(CONFIG.SQUAD.ANGLES.length).toBe(CONFIG.SQUAD.MAX - 1)
  })

  test('todos los puestos caen sobre el mismo círculo', () => {
    // Es la forma que pide el diseño: un círculo alrededor del jugador, no
    // dos posiciones sueltas que se fueron corriendo de a poco.
    for (let i = 0; i < CONFIG.SQUAD.ANGLES.length; i++) {
      const p = puestoDe(i)
      expect(Math.hypot(p.x, p.z)).toBeCloseTo(CONFIG.SQUAD.RADIUS, 1e-6)
    }
  })

  test('nadie se para delante del jugador', () => {
    // Delante taparía lo único que hay que ver: de dónde viene la horda.
    // +Z es hacia la cámara, o sea detrás.
    for (let i = 0; i < CONFIG.SQUAD.ANGLES.length; i++) {
      expect(puestoDe(i).z).toBeGreaterThan(0)
    }
  })

  test('están cerca: el escuadrón se tiene que leer como un grupo', () => {
    // Estaban a 2.56 y se veían como tres personas sueltas. El radio manda,
    // y tiene que dejar aire entre cuerpos sin abrir la formación: el jugador
    // y cada compañero miden 0.4 de radio.
    const aire = CONFIG.SQUAD.RADIUS - CONFIG.PLAYER.RADIUS * 2
    expect(aire).toBeGreaterThan(0.3)
    expect(CONFIG.SQUAD.RADIUS).toBeLessThan(2)
  })
})

process.exit(resumen() > 0 ? 1 : 0)
