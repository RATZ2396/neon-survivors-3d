/**
 * FrameEvents — qué pasó en este frame, deducido del estado.
 *
 * Los sistemas del juego no avisan nada a nadie. Esta clase compara el estado
 * que ya publican contra el del frame anterior y arma una lista de hechos:
 * disparaste, murieron tres, te pegaron, subiste de nivel, el boss embistió.
 *
 * Existe por una razón concreta: el audio y las partículas necesitan
 * exactamente los mismos hechos. Sin esto, cada uno tendría su propia copia de
 * la comparación, y las dos copias se irían separando con el tiempo — un
 * efecto sonaría sin verse, o al revés. La deducción se hace UNA vez y los dos
 * consumidores leen el mismo resultado.
 *
 * La otra razón es de arquitectura: si cada sistema llamara al audio y a las
 * partículas, los dos se volverían dependencias de la simulación, habría que
 * pasarlos por seis constructores, y apagarlos sería un `if` repetido en seis
 * archivos. Acá se apagan borrando una línea del loop.
 *
 * El precio, que es real: no se puede reaccionar a algo que el estado no
 * cuenta. Cuando hizo falta el impacto de bala hubo que PUBLICAR
 * `ProjectileManager.hitCount`, y las fases del boss son dos getters de solo
 * lectura. Publicar el dato, nunca espiar una variable privada.
 */
export class FrameEvents {
  constructor({ player, enemies, weapons, boss, projectiles }) {
    this.player = player
    this.enemies = enemies
    this.weapons = weapons
    this.boss = boss
    this.projectiles = projectiles

    // Hechos del frame. Se reescriben en cada update(): son campos fijos y no
    // un objeto nuevo, porque esto corre 60 veces por segundo.
    this.shot = false
    this.shotKey = ''
    this.hit = false
    this.deaths = 0
    this.playerHit = false
    this.playerDied = false
    this.gems = 0
    this.levels = 0
    this.bossSpawned = false
    this.bossDied = false
    /** '' | 'TELEGRAPH' | 'CHARGING' si cambió este frame; null si no cambió. */
    this.bossPhase = null
    this.bossSlam = false
    /** Daño que el boss recibió este frame (0 si no hay boss). */
    this.bossDamage = 0
    /** Daño que recibió el jugador este frame. */
    this.playerDamage = 0

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
    this._bossHp = 0
    this._playerHp = this.player.hp
    this._clear()
  }

  _clear() {
    this.shot = false
    this.hit = false
    this.deaths = 0
    this.playerHit = false
    this.playerDied = false
    this.gems = 0
    this.levels = 0
    this.bossSpawned = false
    this.bossDied = false
    this.bossPhase = null
    this.bossSlam = false
    this.bossDamage = 0
    this.playerDamage = 0
  }

  /**
   * @param {number} gems XP cobrada este frame (la calcula el loop)
   * @param {number} levels niveles subidos este frame
   */
  update(gems, levels) {
    this._clear()

    // Un disparo de escopeta emite 6 proyectiles: es UN disparo, no seis.
    if (this.weapons.shotsFired > this._shots) {
      this._shots = this.weapons.shotsFired
      this.shot = true
      this.shotKey = this.weapons.def.key
    }

    if (this.projectiles.hitCount > this._hits) {
      this._hits = this.projectiles.hitCount
      this.hit = true
    }

    // deathCount es del frame actual: lo llena resolveDamage() y se vacía solo.
    this.deaths = this.enemies.deathCount

    // La invulnerabilidad salta de 0 a INVULN_TIME exactamente cuando cobrás.
    if (this.player.invulnTimer > this._invuln) this.playerHit = true
    this._invuln = this.player.invulnTimer

    // Cuánto bajó la vida. Curarse no cuenta como daño negativo.
    if (this.player.hp < this._playerHp) this.playerDamage = this._playerHp - this.player.hp
    this._playerHp = this.player.hp

    if (this.player.isDead && !this._dead) this.playerDied = true
    this._dead = this.player.isDead

    this.gems = gems
    this.levels = levels

    const bossActive = this.boss.active
    if (bossActive && !this._bossActive) this.bossSpawned = true

    // El daño al boss sale de mirarle la vida, no de que el arma avise: así
    // cuenta igual lo que le hacen las balas, las habilidades y el veneno que
    // se agregue mañana.
    if (bossActive) {
      if (this._bossActive && this.boss.hp < this._bossHp) {
        this.bossDamage = this._bossHp - this.boss.hp
      }
      this._bossHp = this.boss.hp
    }
    this._bossActive = bossActive

    if (this.boss.defeated > this._bossDefeated) {
      this._bossDefeated = this.boss.defeated
      this.bossDied = true
    }

    const fase = this.boss.chargePhase
    if (fase !== this._chargePhase) {
      this.bossPhase = fase
      this._chargePhase = fase
    }

    // El anillo aparece durante el aviso y se apaga en el impacto: el golpe
    // cuenta cuando se apaga, que es cuando el daño se aplica.
    const aviso = this.boss.slamWarning
    if (!aviso && this._slamWarning && bossActive) this.bossSlam = true
    this._slamWarning = aviso
  }
}
