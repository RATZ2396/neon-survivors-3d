/**
 * RunRecorder — caja negra de una partida.
 *
 * POR QUÉ EXISTE. Un bot que juega solo no siente nada: orbita en círculos,
 * elige siempre la misma carta y no se frustra. Todo lo que importa de verdad
 * —si algo se siente lento, injusto o aburrido— solo lo ve una persona
 * jugando. Pero una persona jugando tampoco puede decir "el 0.2% de mi daño
 * llegó al boss".
 *
 * Esto junta las dos mitades: vos jugás normal, y esto anota por dentro qué
 * pasó exactamente en esa misma partida. Después los números y la sensación
 * hablan del mismo momento, en vez de que uno tenga que simular al otro.
 *
 * SOLO EN DESARROLLO. Se instancia detrás de `import.meta.env.DEV` y manda el
 * informe a un endpoint que solo existe en el servidor de Vite (ver
 * vite.config.js), que lo escribe en `grabaciones/`. En producción no se
 * carga, no corre y no manda nada a ningún lado.
 *
 * NO ES UN PROFILER. Muestrea una vez por segundo, no por frame: la idea es
 * reconstruir la forma de una partida, no medir milisegundos.
 */

const CADA = 1.0

export class RunRecorder {
  constructor() {
    this._reset()
  }

  _reset() {
    this.activo = false
    this.acum = 0
    this.linea = []
    this.decisiones = []
    this.picos = { enemigos: 0, proyectiles: 0, particulas: 0, gemas: 0 }
    this.fps = { min: Infinity, suma: 0, muestras: 0 }
    this.boss = []
    this.inicio = null
    /**
     * Segundos jugados con el apuntado manual encendido. Sin esto no se puede
     * leer un informe: si el arma le apuntó poco al boss, no hay forma de
     * saber si fue culpa de la puntería automática o porque el jugador tomó
     * el control y decidió otra cosa.
     */
    this.segManual = 0
    this.segAuto = 0
  }

  /** Arranca una grabación. Se llama al empezar la partida. */
  iniciar(g) {
    this._reset()
    this.activo = true
    this.inicio = {
      cuando: new Date().toISOString(),
      arma: g.weapons.def.name,
      armaKey: g.profile.weapon,
      mejorasPermanentes: JSON.parse(JSON.stringify(g.profile.upgrades)),
      permanentes: { ...g.weapons.perm },
      monedaInicial: g.profile.currency,
      partidasPrevias: g.profile.runs,
    }
  }

  /** Anota qué eligió el jugador al subir de nivel. */
  anotarEleccion(nivel, texto) {
    if (!this.activo) return
    this.decisiones.push({ nivel, elegido: texto })
  }

  /**
   * Una muestra por segundo. Se llama todos los frames y decide sola cuándo
   * anotar: quien la llama no tiene que saber nada de la cadencia.
   */
  muestrear(g, delta) {
    if (!this.activo) return

    const e = g.enemies
    if (e.count > this.picos.enemigos) this.picos.enemigos = e.count
    if (g.projectiles.count > this.picos.proyectiles) this.picos.proyectiles = g.projectiles.count
    if (g.particles.count > this.picos.particulas) this.picos.particulas = g.particles.count
    if (g.gems.count > this.picos.gemas) this.picos.gemas = g.gems.count

    if (g.weapons.aimActive) this.segManual += delta
    else this.segAuto += delta

    const fps = g.monitor.fps
    if (fps > 0) {
      if (fps < this.fps.min) this.fps.min = fps
      this.fps.suma += fps
      this.fps.muestras++
    }

    this.acum += delta
    if (this.acum < CADA) return
    this.acum = 0

    const t = +g.waves.elapsed.toFixed(1)
    this.linea.push({
      t,
      hp: Math.round(g.player.hp),
      hpMax: Math.round(g.player.maxHp),
      enemigos: e.count,
      bajas: e.killCount,
      nivel: g.progression.level,
      fps: Math.round(fps),
    })
    if (g.boss.active) this.boss.push({ t, hp: Math.round(g.boss.hp) })
  }

  /**
   * Cierra la grabación y manda el informe. `motivo` distingue morirse de
   * abandonar, que no son la misma partida aunque los números se parezcan.
   */
  terminar(g, motivo) {
    if (!this.activo) return null
    this.activo = false

    const e = g.enemies
    const w = g.weapons
    const totalDano = e.dmgToPriority + e.dmgToRest
    const ultima = this.linea[this.linea.length - 1]

    const informe = {
      ...this.inicio,
      motivo,
      duracion: +g.waves.elapsed.toFixed(1),
      bajas: e.killCount,
      nivelFinal: g.progression.level,
      recompensa: g._lastReward,
      habilidades: g.skills.owned.map((o) => ({ def: o.defIndex, nivel: o.level })),
      decisiones: this.decisiones,

      // La pregunta que motivó todo esto.
      dano: {
        alBoss: Math.round(e.dmgToPriority),
        aLaHorda: Math.round(e.dmgToRest),
        pctAlBoss: totalDano > 0 ? +((100 * e.dmgToPriority) / totalDano).toFixed(2) : null,
      },
      apuntado: {
        segManual: +this.segManual.toFixed(1),
        segAuto: +this.segAuto.toFixed(1),
        pctManual: +((100 * this.segManual) / (this.segManual + this.segAuto || 1)).toFixed(1),
      },
      punteria: {
        disparos: w.shotsFired,
        alBoss: w.shotsAtPriority,
        pct: w.shotsFired > 0 ? +((100 * w.shotsAtPriority) / w.shotsFired).toFixed(2) : null,
      },

      boss: {
        aparecio: g.boss.defeated > 0 || this.boss.length > 0,
        derrotados: g.boss.defeated,
        curva: this.boss,
      },

      picos: this.picos,
      fps: {
        min: this.fps.min === Infinity ? null : Math.round(this.fps.min),
        promedio: this.fps.muestras ? Math.round(this.fps.suma / this.fps.muestras) : null,
      },
      alMorir: ultima || null,
      linea: this.linea,
    }

    this._enviar(informe)
    return informe
  }

  /**
   * Manda el informe al servidor de desarrollo. Si falla no pasa nada: el
   * grabador es una herramienta, no puede ser capaz de arruinar una partida.
   */
  _enviar(informe) {
    try {
      fetch('/__grabador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(informe),
        keepalive: true,
      })
        .then((r) => r.text())
        .then((n) => console.info('[grabador] partida guardada en grabaciones/' + n))
        .catch(() => console.info('[grabador] no se pudo guardar (¿no estás en el server de Vite?)'))
    } catch {
      /* nunca romper la partida por esto */
    }
  }
}
