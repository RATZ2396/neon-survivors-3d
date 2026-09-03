import { describe, test, expect, resumen } from './run.js'

import { CONFIG } from '../src/config/GameConfig.js'
import { Progression } from '../src/progression/Progression.js'
import { PlayerProfile } from '../src/meta/PlayerProfile.js'
import { META_TREES, costOfLevel, modifiersFor } from '../src/config/MetaDefs.js'
import { WEAPON_DEFS, WEAPON } from '../src/config/WeaponDefs.js'
import { SpatialGrid } from '../src/enemies/SpatialGrid.js'
import { EnemyManager } from '../src/enemies/EnemyManager.js'
import { ENEMY_DEFS, ENEMY_TYPE } from '../src/config/EnemyDefs.js'
import { WaveManager, WAVE_STAGES } from '../src/enemies/WaveManager.js'
import { rollUpgrades, UPGRADE_DEFS } from '../src/config/UpgradeDefs.js'
import { SKILL_DEFS } from '../src/config/SkillDefs.js'
import { SoundManager } from '../src/audio/SoundManager.js'
import { SOUND_DEFS } from '../src/config/SoundDefs.js'
import { ParticleSystem } from '../src/vfx/ParticleSystem.js'
import { VFX_DEFS } from '../src/config/VfxDefs.js'
import { FrameEvents } from '../src/core/FrameEvents.js'

/** Escena de mentira: los sistemas solo le piden add(). */
const escena = { add() {} }

/** localStorage de mentira, para no depender de un navegador. */
function almacenFalso(inicial = null) {
  let v = inicial
  return {
    getItem: () => v,
    setItem: (_k, x) => {
      v = x
    },
    removeItem: () => {
      v = null
    },
    get raw() {
      return v
    },
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

  test('la recompensa premia tiempo, bajas y bosses, con piso', () => {
    const { REWARD_PER_SECOND, REWARD_PER_KILL, REWARD_PER_BOSS, REWARD_MIN } = CONFIG.META
    expect(PlayerProfile.rewardFor(0, 0, 0)).toBe(REWARD_MIN)
    expect(PlayerProfile.rewardFor(100, 0, 0)).toBe(Math.round(100 * REWARD_PER_SECOND))
    expect(PlayerProfile.rewardFor(0, 100, 0)).toBe(Math.round(100 * REWARD_PER_KILL))
    expect(PlayerProfile.rewardFor(0, 0, 2)).toBe(Math.round(2 * REWARD_PER_BOSS))
  })

  test('terminar una partida acredita y persiste', () => {
    const store = almacenFalso()
    const p = new PlayerProfile(store)
    const premio = p.finishRun(60, 30, 1)
    expect(p.currency).toBe(premio)
    expect(p.runs).toBe(1)
    expect(p.bestSeconds).toBe(60)
    expect(JSON.parse(store.raw).currency).toBe(premio)
  })

  test('el mejor tiempo solo sube', () => {
    const p = new PlayerProfile(almacenFalso())
    p.finishRun(120, 0, 0)
    p.finishRun(30, 0, 0)
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
      weapons: {},
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

process.exit(resumen() > 0 ? 1 : 0)
