/**
 * GameAudio — traduce lo que pasó en el frame a sonidos.
 *
 * NINGÚN sistema del juego sabe que el audio existe. No hay un `sound.play()`
 * desperdigado por el WeaponSystem, el EnemyManager y el boss: esta clase MIRA
 * el estado que esos sistemas ya publican y deduce qué pasó comparándolo con el
 * frame anterior. Disparaste si el contador de disparos subió; te pegaron si la
 * invulnerabilidad pasó de cero a algo.
 *
 * Por qué así y no al revés: si cada sistema llamara al audio, el audio se
 * volvería una dependencia de la simulación, habría que pasarlo por seis
 * constructores, y silenciar el juego pasaría a ser un `if` repetido en seis
 * archivos. Acá se apaga borrando una línea del loop. Es también la razón por la
 * que el orden del frame del GameManager puede cambiar sin romper el audio.
 *
 * El precio, que es real: no se puede sonar algo que el estado no cuenta. Si
 * hiciera falta distinguir "bala que atraviesa" de "bala que impacta", habría
 * que publicar ese dato — no espiar variables privadas.
 */
export class GameAudio {
  constructor(sound, { player, enemies, weapons, boss, projectiles }) {
    this.sound = sound
    this.player = player
    this.enemies = enemies
    this.weapons = weapons
    this.boss = boss
    this.projectiles = projectiles

    this.reset()
  }

  /** Olvida el frame anterior. Se llama al empezar una partida. */
  reset() {
    this._shots = this.weapons.shotsFired
    this._hits = this.projectiles.hitCount
    this._invuln = 0
    this._dead = false
    this._bossActive = false
    this._bossDefeated = this.boss.defeated
    this._chargePhase = ''
    this._slamWarning = false
  }

  /**
   * @param {{gems:number, levels:number}} evento lo que el loop ya calculó y
   *   que no vive en ningún sistema: gemas cobradas y niveles subidos
   */
  update(evento) {
    const s = this.sound
    if (!s.ready) return

    // ── Disparo ──────────────────────────────────────────────────────────
    // Un disparo de escopeta emite 6 proyectiles: suena UNA vez, no seis.
    if (this.weapons.shotsFired > this._shots) {
      this._shots = this.weapons.shotsFired
      // Variación de tono por disparo: sin esto una ráfaga suena a máquina.
      s.play('SHOT_' + this.weapons.def.key, 0.94 + Math.random() * 0.12)
    }

    // ── Horda ────────────────────────────────────────────────────────────
    // La muerte gana sobre el impacto: si en el frame murió alguien, suena eso.
    // Los dos juntos, frame tras frame, se empastan en un solo ruido.
    if (this.enemies.deathCount > 0) {
      s.play('ENEMY_DEATH', 0.9 + Math.random() * 0.25)
    } else if (this.projectiles.hitCount > this._hits) {
      s.play('ENEMY_HIT', 0.9 + Math.random() * 0.3)
    }
    this._hits = this.projectiles.hitCount

    // ── Jugador ──────────────────────────────────────────────────────────
    // La invulnerabilidad salta de 0 a INVULN_TIME exactamente cuando cobrás.
    if (this.player.invulnTimer > this._invuln) s.play('PLAYER_HIT')
    this._invuln = this.player.invulnTimer

    if (this.player.isDead && !this._dead) s.play('PLAYER_DEATH')
    this._dead = this.player.isDead

    // ── Progresión ───────────────────────────────────────────────────────
    if (evento.gems > 0) s.play('GEM', 0.92 + Math.random() * 0.18)
    if (evento.levels > 0) s.play('LEVEL_UP')

    // ── Boss ─────────────────────────────────────────────────────────────
    const bossActive = this.boss.active
    if (bossActive && !this._bossActive) s.play('BOSS_SPAWN')
    this._bossActive = bossActive

    if (this.boss.defeated > this._bossDefeated) {
      this._bossDefeated = this.boss.defeated
      s.play('BOSS_DEATH')
    }

    const fase = this.boss.chargePhase
    if (fase !== this._chargePhase) {
      if (fase === 'TELEGRAPH') s.play('BOSS_TELEGRAPH')
      else if (fase === 'CHARGING') s.play('BOSS_CHARGE')
      this._chargePhase = fase
    }

    // El anillo aparece durante el aviso y se apaga en el impacto: el golpe
    // suena cuando se apaga, que es cuando el daño se aplica.
    const aviso = this.boss.slamWarning
    if (!aviso && this._slamWarning && bossActive) s.play('BOSS_SLAM')
    this._slamWarning = aviso
  }
}
