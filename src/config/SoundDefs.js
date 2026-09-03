/**
 * SoundDefs — todos los sonidos del juego, sintetizados.
 *
 * No hay archivos de audio: cada sonido es una receta de osciladores y ruido
 * que WebAudio arma en el momento. Eso significa cero descargas, cero licencias
 * y que balancear el audio es editar números en esta tabla, igual que las armas
 * o los enemigos. Agregar un sonido es agregar una fila, nunca una clase.
 *
 * GRAMÁTICA DE UNA FILA
 *
 *   gain         volumen relativo (0..1)
 *   duration     cuánto dura, en segundos
 *   attack       cuánto tarda en llegar al pico; 0.002 = golpe seco
 *   minInterval  no vuelve a sonar antes de esto. Es lo que separa una ráfaga
 *                de metralleta de un zumbido: sin este tope, 400 enemigos
 *                muriendo el mismo frame piden 400 voces, y el resultado es
 *                ruido blanco con la CPU en el piso
 *   priority     quién gana cuando no quedan voces libres (mayor gana)
 *   layers[]     una a tres capas que suenan juntas:
 *     src        'noise' o una forma de onda ('sine' | 'saw' | 'square' | 'triangle')
 *     freq       frecuencia inicial en Hz (solo osciladores)
 *     freqEnd    a dónde barre; si falta, no barre
 *     cutoff     corte del filtro; cutoffEnd para barrerlo
 *     type       tipo de filtro ('lowpass' por defecto)
 *     q          resonancia del filtro
 *     gain       peso de la capa dentro del sonido
 *     delay      segundos de retraso respecto del inicio
 *
 * Las mezclas están pensadas para que el disparo NO tape al golpe recibido: la
 * información que salva la partida es cuánto daño estás comiendo, no cuánto
 * estás dando.
 */
export const SOUND_DEFS = [
  // ── Armas ────────────────────────────────────────────────────────────────
  {
    key: 'SHOT_PISTOL',
    gain: 0.3,
    duration: 0.16,
    attack: 0.002,
    minInterval: 0.05,
    priority: 2,
    layers: [
      { src: 'noise', cutoff: 3200, cutoffEnd: 700, q: 1.2, gain: 0.8 },
      { src: 'square', freq: 320, freqEnd: 110, gain: 0.5 },
    ],
  },
  {
    // Más grave y más larga: el peso se escucha antes de verse.
    key: 'SHOT_SHOTGUN',
    gain: 0.42,
    duration: 0.34,
    attack: 0.003,
    minInterval: 0.1,
    priority: 2,
    layers: [
      { src: 'noise', cutoff: 2400, cutoffEnd: 300, q: 0.9, gain: 1 },
      { src: 'square', freq: 190, freqEnd: 55, gain: 0.7 },
      { src: 'sine', freq: 90, freqEnd: 40, gain: 0.6, delay: 0.01 },
    ],
  },
  {
    // Corta y aguda: a 7.7 disparos por segundo cualquier cola se empasta.
    key: 'SHOT_SMG',
    gain: 0.17,
    duration: 0.075,
    attack: 0.001,
    minInterval: 0.03,
    priority: 1,
    layers: [
      { src: 'noise', cutoff: 5200, cutoffEnd: 1600, q: 1.4, gain: 0.7 },
      { src: 'square', freq: 460, freqEnd: 220, gain: 0.35 },
    ],
  },

  // ── Horda ────────────────────────────────────────────────────────────────
  {
    key: 'ENEMY_HIT',
    gain: 0.22,
    duration: 0.06,
    attack: 0.001,
    minInterval: 0.045,
    priority: 0,
    layers: [{ src: 'noise', cutoff: 1800, cutoffEnd: 600, q: 2, gain: 1 }],
  },
  {
    key: 'ENEMY_DEATH',
    gain: 0.2,
    duration: 0.2,
    attack: 0.002,
    minInterval: 0.06,
    priority: 1,
    layers: [
      { src: 'noise', cutoff: 1400, cutoffEnd: 200, q: 1, gain: 0.9 },
      { src: 'triangle', freq: 220, freqEnd: 70, gain: 0.45 },
    ],
  },

  // ── Jugador ──────────────────────────────────────────────────────────────
  {
    // Prioridad alta y grave: tiene que escucharse por encima de la balacera.
    key: 'PLAYER_HIT',
    gain: 0.55,
    duration: 0.4,
    attack: 0.002,
    minInterval: 0.15,
    priority: 5,
    layers: [
      { src: 'sine', freq: 180, freqEnd: 48, gain: 1 },
      { src: 'noise', cutoff: 900, cutoffEnd: 160, q: 1.6, gain: 0.55 },
    ],
  },
  {
    key: 'PLAYER_DEATH',
    gain: 0.6,
    duration: 1.4,
    attack: 0.01,
    minInterval: 1,
    priority: 6,
    layers: [
      { src: 'saw', freq: 190, freqEnd: 28, gain: 0.8 },
      { src: 'sine', freq: 95, freqEnd: 22, gain: 0.9 },
      { src: 'noise', cutoff: 700, cutoffEnd: 90, q: 1.2, gain: 0.4 },
    ],
  },

  // ── Progresión ───────────────────────────────────────────────────────────
  {
    // Sube: la gema entra. Cortísimo porque suena decenas de veces por minuto.
    key: 'GEM',
    gain: 0.11,
    duration: 0.09,
    attack: 0.001,
    minInterval: 0.04,
    priority: 1,
    layers: [{ src: 'triangle', freq: 780, freqEnd: 1450, gain: 1 }],
  },
  {
    // Tres notas en arpegio ascendente: se distingue de todo lo demás.
    key: 'LEVEL_UP',
    gain: 0.34,
    duration: 0.5,
    attack: 0.005,
    minInterval: 0.3,
    priority: 4,
    layers: [
      { src: 'triangle', freq: 523, gain: 0.7 },
      { src: 'triangle', freq: 659, gain: 0.7, delay: 0.07 },
      { src: 'triangle', freq: 880, gain: 0.8, delay: 0.14 },
    ],
  },
  {
    key: 'UPGRADE_PICK',
    gain: 0.3,
    duration: 0.22,
    attack: 0.003,
    minInterval: 0.1,
    priority: 4,
    layers: [
      { src: 'square', freq: 440, freqEnd: 880, gain: 0.5 },
      { src: 'sine', freq: 880, gain: 0.5, delay: 0.05 },
    ],
  },
  {
    key: 'BUY',
    gain: 0.3,
    duration: 0.26,
    attack: 0.002,
    minInterval: 0.08,
    priority: 4,
    layers: [
      { src: 'sine', freq: 1050, gain: 0.6 },
      { src: 'sine', freq: 1570, gain: 0.5, delay: 0.06 },
      { src: 'triangle', freq: 2100, gain: 0.3, delay: 0.12 },
    ],
  },

  // ── Boss ─────────────────────────────────────────────────────────────────
  {
    key: 'BOSS_SPAWN',
    gain: 0.65,
    duration: 1.6,
    attack: 0.06,
    minInterval: 2,
    priority: 7,
    layers: [
      { src: 'saw', freq: 68, freqEnd: 34, gain: 1 },
      { src: 'saw', freq: 103, freqEnd: 51, gain: 0.55 },
      { src: 'noise', cutoff: 420, cutoffEnd: 110, q: 2.4, gain: 0.45 },
    ],
  },
  {
    // Aviso de embestida: SUBE, para que se lea como "algo va a pasar".
    key: 'BOSS_TELEGRAPH',
    gain: 0.42,
    duration: 0.6,
    attack: 0.05,
    minInterval: 0.5,
    priority: 6,
    layers: [
      { src: 'saw', freq: 130, freqEnd: 330, gain: 0.7 },
      { src: 'noise', cutoff: 600, cutoffEnd: 2400, q: 3, gain: 0.4 },
    ],
  },
  {
    key: 'BOSS_CHARGE',
    gain: 0.5,
    duration: 0.7,
    attack: 0.01,
    minInterval: 0.5,
    priority: 6,
    layers: [
      { src: 'saw', freq: 240, freqEnd: 62, gain: 0.8 },
      { src: 'noise', cutoff: 2600, cutoffEnd: 380, q: 1.1, gain: 0.6 },
    ],
  },
  {
    key: 'BOSS_SLAM',
    gain: 0.7,
    duration: 0.85,
    attack: 0.002,
    minInterval: 0.4,
    priority: 7,
    layers: [
      { src: 'sine', freq: 120, freqEnd: 26, gain: 1 },
      { src: 'noise', cutoff: 1600, cutoffEnd: 120, q: 0.8, gain: 0.7 },
    ],
  },
  {
    key: 'BOSS_DEATH',
    gain: 0.7,
    duration: 1.8,
    attack: 0.02,
    minInterval: 1,
    priority: 7,
    layers: [
      { src: 'saw', freq: 150, freqEnd: 22, gain: 0.9 },
      { src: 'sine', freq: 300, freqEnd: 44, gain: 0.6 },
      { src: 'noise', cutoff: 1200, cutoffEnd: 70, q: 1, gain: 0.5 },
    ],
  },
]

export const SOUND = {}
for (let i = 0; i < SOUND_DEFS.length; i++) SOUND[SOUND_DEFS[i].key] = SOUND_DEFS[i]
