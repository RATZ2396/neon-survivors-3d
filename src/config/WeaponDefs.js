/**
 * WeaponDefs — las tres armas base del juego.
 *
 * MODELO (definido por el diseño, no por el código):
 *
 *   El arma base es la IDENTIDAD de la partida. Se elige ANTES de empezar, en
 *   el perfil, y no cambia durante el run. No se consiguen armas subiendo de
 *   nivel: lo que se elige al subir de nivel son HABILIDADES (ver SkillDefs).
 *
 *   Cada arma se mejora fuera de la partida, con la recompensa acumulada entre
 *   partidas (meta-progresión — todavía no implementada, ver README).
 *
 * Antes acá había siete armas y dos caminos de código (proyectil y cuerpo a
 * cuerpo). Se recortó a tres y a uno solo. El resolutor de cuerpo a cuerpo se
 * eliminó junto con las armas que lo usaban: dejar código que nada ejecuta es
 * exactamente el problema que documenta el GDD §0.2 del proyecto anterior. El
 * daño de cerca hoy lo cubren las habilidades.
 *
 * Campos:
 *   cooldown   segundos entre disparos      damage  daño por impacto
 *   range      alcance del auto-apuntado    count   balas por disparo
 *   spreadDeg  apertura del abanico         speed   u/s de la bala
 *   lifetime   segundos antes de expirar    pierce  enemigos que atraviesa
 *   size       radio de colisión y visual
 */
export const WEAPON_DEFS = [
  {
    key: 'PISTOL',
    name: 'Pistola',
    role: 'Equilibrada',
    desc: 'Alcance largo y daño parejo. Le pega a lo que se acerque, venga de donde venga.',
    cooldown: 0.42,
    damage: 14,
    range: 20,
    count: 1,
    spreadDeg: 0,
    speed: 30,
    lifetime: 1.2,
    /** Atraviesa hasta 3 cuerpos de basura. El boss y el tanque la frenan igual. */
    pierce: 3,
    size: 0.2,
    color: 0x39d0ff,
  },
  {
    key: 'SHOTGUN',
    name: 'Escopeta',
    role: 'Corto alcance',
    desc: 'Seis perdigones en abanico que atraviesan. Devastadora encima, inútil de lejos.',
    cooldown: 0.95,
    damage: 9,
    range: 13,
    count: 6,
    spreadDeg: 34,
    speed: 24,
    lifetime: 0.55,
    /** Ya dispara 6 perdigones: no necesita tanta penetración como la pistola. */
    pierce: 2,
    size: 0.17,
    color: 0xffd166,
  },
  {
    key: 'SMG',
    name: 'Metralleta',
    role: 'Cadencia',
    desc: 'Dispara sin parar. Poco daño por bala, pero nunca deja de golpear.',
    cooldown: 0.13,
    damage: 5,
    range: 16,
    count: 1,
    spreadDeg: 8,
    speed: 34,
    lifetime: 0.9,
    /** Poco daño por bala, así que atravesar mucho la haría absurda. */
    pierce: 2,
    size: 0.13,
    color: 0x8bffb0,
  },
]

export const WEAPON = {}
for (let i = 0; i < WEAPON_DEFS.length; i++) WEAPON[WEAPON_DEFS[i].key] = i

