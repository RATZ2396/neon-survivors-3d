/**
 * GameAudio — traduce los hechos del frame a sonidos.
 *
 * No mira el juego: mira `FrameEvents`, que ya dedujo qué pasó. Acá solo queda
 * la decisión de qué suena y con qué variación — que es lo único de audio que
 * hay en todo el archivo.
 *
 * Ningún sistema del juego llama a esto. Ver `FrameEvents` para el porqué.
 */
export class GameAudio {
  constructor(sound) {
    this.sound = sound
  }

  /** @param {import('../core/FrameEvents.js').FrameEvents} ev */
  update(ev) {
    const s = this.sound
    if (!s.ready) return

    // Variación de tono por disparo: sin esto una ráfaga suena a máquina.
    if (ev.shot) s.play('SHOT_' + ev.shotKey, 0.94 + Math.random() * 0.12)

    // La muerte gana sobre el impacto: los dos juntos, frame tras frame, se
    // empastan en un solo ruido.
    if (ev.deaths > 0) s.play('ENEMY_DEATH', 0.9 + Math.random() * 0.25)
    else if (ev.hit) s.play('ENEMY_HIT', 0.9 + Math.random() * 0.3)

    if (ev.playerHit) s.play('PLAYER_HIT')
    if (ev.playerDied) s.play('PLAYER_DEATH')

    if (ev.gems > 0) s.play('GEM', 0.92 + Math.random() * 0.18)
    // El bonus del mapa reusa el sonido de elegir mejora en vez de sumar uno
    // nuevo a la tabla: dice lo mismo —conseguiste algo bueno— y agregar un
    // sonido es una decisión de diseño de audio, no una consecuencia de esto.
    if (ev.bonus) s.play('UPGRADE_PICK')
    if (ev.levels > 0) s.play('LEVEL_UP')

    if (ev.bossSpawned) s.play('BOSS_SPAWN')
    if (ev.bossDied) s.play('BOSS_DEATH')
    if (ev.bossPhase === 'TELEGRAPH') s.play('BOSS_TELEGRAPH')
    else if (ev.bossPhase === 'CHARGING') s.play('BOSS_CHARGE')
    if (ev.bossSlam) s.play('BOSS_SLAM')
  }
}
