import { SOUND } from '../config/SoundDefs.js'

/** Voces sonando a la vez. Pasado este número, el sonido nuevo pelea por lugar. */
const MAX_VOICES = 20

/** Segundos de ruido blanco pregenerado. Se reusa para todos los sonidos. */
const NOISE_SECONDS = 1

/** Formas de onda: la tabla usa 'saw', WebAudio lo llama 'sawtooth'. */
const WAVE = { sine: 'sine', square: 'square', triangle: 'triangle', saw: 'sawtooth' }

/**
 * SoundManager — sintetiza y reproduce los sonidos de SoundDefs.
 *
 * TRES DECISIONES QUE VALEN LA PENA CONOCER:
 *
 * 1. El AudioContext NO se crea en el constructor. Los navegadores bloquean el
 *    audio hasta que hubo un gesto del usuario, y un contexto creado antes
 *    arranca 'suspended' y se queda mudo para siempre sin avisar. Se crea en
 *    unlock(), que dispara el primer clic o la primera tecla.
 *
 * 2. Presupuesto de voces. Una horda de 400 puede pedir cientos de sonidos en
 *    un frame. Hay un tope de voces y un intervalo mínimo por sonido: pasado el
 *    tope solo entra el que tiene más prioridad que la voz más floja que suena.
 *    Sin esto el audio se convierte en ruido blanco y la CPU se va al piso —
 *    exactamente el mismo razonamiento que el pool de proyectiles.
 *
 * 3. El ruido blanco se genera UNA vez, al desbloquear, y todos los sonidos lo
 *    reusan como buffer compartido. Generar un segundo de ruido por disparo
 *    sería asignar 190 KB por bala.
 */
export class SoundManager {
  constructor() {
    this.ctx = null
    this.master = null
    this.muted = false
    this.volume = 0.9

    /** Último instante en que sonó cada clave (segundos del contexto). */
    this._last = new Map()
    /** Prioridades de las voces vivas, para saber a quién sacar. */
    this._voices = []
  }

  get ready() {
    return this.ctx !== null && this.ctx.state === 'running'
  }

  /**
   * Crea el contexto (o lo reanuda). Se llama desde un gesto del usuario.
   * Es idempotente: llamarlo en cada clic no cuesta nada.
   */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return false // navegador sin WebAudio: el juego sigue, mudo

      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : this.volume
      this.master.connect(this.ctx.destination)
      this._buildNoise()
    }

    if (this.ctx.state === 'suspended') this.ctx.resume()
    return true
  }

  _buildNoise() {
    const rate = this.ctx.sampleRate
    const buf = this.ctx.createBuffer(1, rate * NOISE_SECONDS, rate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    this._noise = buf
  }

  /**
   * Apaga el audio sin tocar la preferencia del jugador.
   *
   * Es lo que hay que hacer cuando la pestaña se va a segundo plano o entra
   * una publicidad. `setMuted` no sirve para eso: pisaría lo que el jugador
   * eligió con la M y habría que acordarse de restaurarlo. Un contexto
   * suspendido no suena, no gasta CPU, y `unlock()` lo devuelve como estaba.
   */
  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend()
  }

  /**
   * Volumen maestro, 0..1.
   *
   * NO toca `muted`, y esa separación importa: si bajar el volumen a cero
   * silenciara, subirlo de vuelta tendría que acordarse de des-silenciar, y
   * el jugador que además apretó M se quedaría mudo sin entender por qué.
   * Son dos controles distintos y el mezclador los aplica en cascada.
   */
  setVolume(v) {
    this.volume = Math.min(1, Math.max(0, v))
    if (this.master && !this.muted) this.master.gain.value = this.volume
  }

  setMuted(muted) {
    this.muted = muted
    if (this.master) this.master.gain.value = muted ? 0 : this.volume
  }

  toggleMute() {
    this.setMuted(!this.muted)
    return this.muted
  }

  /** Cuántas voces suenan ahora. Lo usa la verificación. */
  get activeVoices() {
    return this._voices.length
  }

  /**
   * @param {string} key clave de SOUND_DEFS
   * @param {number} [rate] variación de tono (1 = tal cual la tabla)
   * @returns {boolean} si el sonido llegó a sonar
   */
  play(key, rate = 1) {
    if (!this.ready || this.muted) return false

    const def = SOUND[key]
    if (!def) return false

    const now = this.ctx.currentTime

    // Tope de repetición: es lo que evita que una ráfaga se vuelva un zumbido.
    const last = this._last.get(key)
    if (last !== undefined && now - last < def.minInterval) return false

    if (!this._claimVoice(def.priority)) return false
    this._last.set(key, now)

    const env = this.ctx.createGain()
    env.connect(this.master)

    // Envolvente única para todas las capas: ataque lineal corto y caída
    // exponencial. La exponencial es la que suena natural; la lineal "corta".
    const peak = def.gain
    env.gain.setValueAtTime(0.0001, now)
    env.gain.linearRampToValueAtTime(peak, now + def.attack)
    env.gain.exponentialRampToValueAtTime(0.0001, now + def.duration)

    const nodes = []
    for (const layer of def.layers) nodes.push(this._buildLayer(layer, env, now, def.duration, rate))

    // La voz se libera cuando termina la capa más larga.
    const voice = { priority: def.priority }
    this._voices.push(voice)
    const ultimo = nodes[nodes.length - 1]
    ultimo.onended = () => {
      const i = this._voices.indexOf(voice)
      if (i !== -1) this._voices.splice(i, 1)
      env.disconnect()
    }

    return true
  }

  /**
   * Reserva lugar para una voz. Si no hay, saca a la más floja — pero solo si
   * la nueva es más importante. Un disparo no puede callar al golpe recibido.
   */
  _claimVoice(priority) {
    if (this._voices.length < MAX_VOICES) return true

    let peor = 0
    for (let i = 1; i < this._voices.length; i++) {
      if (this._voices[i].priority < this._voices[peor].priority) peor = i
    }
    if (this._voices[peor].priority >= priority) return false

    // No se corta el nodo que suena: se lo deja terminar y se libera su lugar.
    // Cortarlo produce un chasquido, que es peor que una voz de más.
    this._voices.splice(peor, 1)
    return true
  }

  _buildLayer(layer, dest, now, duration, rate) {
    const start = now + (layer.delay || 0)
    let source

    if (layer.src === 'noise') {
      source = this.ctx.createBufferSource()
      source.buffer = this._noise
      // Arranca en un punto al azar del buffer: si todos los disparos leyeran
      // desde el 0, sonarían idénticos y se notaría el bucle.
      source.loop = true
    } else {
      source = this.ctx.createOscillator()
      source.type = WAVE[layer.src] || 'sine'
      const f0 = layer.freq * rate
      source.frequency.setValueAtTime(f0, start)
      if (layer.freqEnd !== undefined) {
        // Exponencial: el oído percibe el tono en escala logarítmica, así que
        // un barrido lineal se escucha acelerado al principio.
        source.frequency.exponentialRampToValueAtTime(
          Math.max(1, layer.freqEnd * rate),
          start + duration,
        )
      }
    }

    let tail = source

    if (layer.cutoff !== undefined) {
      const filter = this.ctx.createBiquadFilter()
      filter.type = layer.type || 'lowpass'
      filter.Q.value = layer.q || 1
      filter.frequency.setValueAtTime(layer.cutoff, start)
      if (layer.cutoffEnd !== undefined) {
        filter.frequency.exponentialRampToValueAtTime(
          Math.max(20, layer.cutoffEnd),
          start + duration,
        )
      }
      tail.connect(filter)
      tail = filter
    }

    if (layer.gain !== undefined && layer.gain !== 1) {
      const g = this.ctx.createGain()
      g.gain.value = layer.gain
      tail.connect(g)
      tail = g
    }

    tail.connect(dest)

    const offset = layer.src === 'noise' ? Math.random() * (NOISE_SECONDS - 0.05) : 0
    if (layer.src === 'noise') source.start(start, offset)
    else source.start(start)
    source.stop(start + duration)

    return source
  }
}
