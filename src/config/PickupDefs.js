/**
 * PickupDefs — todo lo que se junta del piso, en una tabla.
 *
 * Son cuatro cosas con dos comportamientos, y la clave que los separa es
 * `loot`:
 *
 *   loot: true    lo suelta un enemigo al morir y el imán lo atrae.
 *                 GEMA (experiencia) y MONEDA (la del taller).
 *   loot: false   aparece solo en el mapa cada tanto, no lo suelta nadie, y
 *                 hay que ir a pisarlo. CORAZÓN e IMÁN.
 *
 * Esa diferencia no es cosmética. La gema y la moneda son la recompensa de
 * matar: si te las atrajera todo el mapa no tendrías que moverte, y moverte a
 * buscarlas ES el juego. El corazón y el imán son lo contrario — una razón
 * para ir a un lugar puntual, decidida por el mapa y no por vos.
 *
 * El imán, al agarrarlo, atrae TODO lo recolectable que haya, incluidos los
 * que no son `loot`. Es la única excepción y dura unos segundos.
 */

export const PICKUP_KIND = {
  XP: 0,
  COIN: 1,
  HEART: 2,
  MAGNET: 3,
}

/**
 * `shape` la traduce PickupManager a una geometría. Son cuatro siluetas bien
 * distintas a propósito: de lejos y chiquitas, la forma se lee antes que el
 * color.
 *
 *   size    tamaño de la geometría        height  a qué altura flota
 *   tilt    inclinación fija, en radianes loot    ver arriba
 */
export const PICKUP_DEFS = [
  {
    key: 'XP',
    name: 'Gema',
    shape: 'OCTA',
    color: 0x8bffb0,
    size: 0.22,
    height: 0.35,
    tilt: 0.4,
    loot: true,
  },
  {
    key: 'COIN',
    name: 'Moneda',
    shape: 'DISC',
    color: 0xffd166,
    size: 0.24,
    height: 0.38,
    tilt: Math.PI / 2,
    loot: true,
  },
  {
    key: 'HEART',
    name: 'Corazón',
    shape: 'ORB',
    color: 0xff4d6d,
    size: 0.4,
    height: 0.6,
    tilt: 0,
    loot: false,
  },
  {
    key: 'MAGNET',
    name: 'Imán',
    shape: 'RING',
    color: 0x39d0ff,
    size: 0.42,
    height: 0.6,
    tilt: 0.5,
    loot: false,
  },
]

/** Los que aparecen solos en el mapa. Lo usa el sorteo del PickupManager. */
export const BONUS_KINDS = PICKUP_DEFS.map((d, i) => (d.loot ? -1 : i)).filter((i) => i >= 0)
