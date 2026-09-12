import * as THREE from 'three'
import { Part, box, cyl, flat } from './ArtLib.js'

/**
 * WeaponModels — el arma que el soldado lleva en las manos.
 *
 * POR QUÉ EXISTE. Los tres personajes del juego son sus armas (ver el
 * comentario de WeaponDefs: "un personaje = su arma, para siempre"), y hasta
 * ahora los tres llevaban el MISMO fusil de asalto genérico, incluido el de la
 * escopeta. El arma es la identidad de la partida y era lo único de la
 * identidad que no se veía.
 *
 * CÓMO SE CONECTA CON EL CUERPO. El soldado ya resuelve los brazos con IK de
 * dos huesos: las manos van a donde diga el arma, no al revés. Así que cambiar
 * de arma no es cambiar la pose a mano, es cambiar cuatro datos:
 *
 *   gripRight   dónde agarra la mano de disparo
 *   gripLeft    dónde agarra la mano de apoyo
 *   muzzle      de dónde sale la bala (fogonazo y spawn del proyectil)
 *   rest        dónde se lleva el arma respecto del torso
 *
 * y la IK acomoda los brazos sola. Una pistola queda con los brazos estirados
 * al frente y una escopeta encarada al hombro sin escribir una sola rotación
 * de codo.
 *
 * LA GEOMETRÍA SE CACHEA Y SE COMPARTE. Un `THREE.Mesh` puede apuntar a una
 * geometría que ya existe, así que las tres armas se construyen UNA vez para
 * todo el juego y el jugador y los dos compañeros usan las mismas. Armar un
 * arma cuesta; armarla nueve veces no aporta nada.
 *
 * Todo está en metros y con el caño hacia -Z, que es "adelante" en la
 * convención del proyecto.
 */

/** Geometrías ya construidas, por clave. Se llena la primera vez que se pide. */
const cache = new Map()

// ---------------------------------------------------------------------------
// Construcción
// ---------------------------------------------------------------------------

/**
 * Pistola de servicio, ~21 cm.
 *
 * Es el arma más chica del juego y la que más se ve: se lleva con los brazos
 * estirados al frente, o sea lo más lejos posible del cuerpo y lo más cerca de
 * la cámara. Por eso tiene guardamonte y miras de verdad y no es un ladrillo.
 */
function buildPistol(S) {
  const p = new Part('pistol')

  // Corredera: la masa principal, arriba.
  const slide = box(0.03, 0.042, 0.185, 0.006)
  slide.translate(0, 0.022, -0.01)
  p.add(flat(slide, S.gunmetal))

  // Boca del caño asomando por delante.
  const barrel = cyl(0.008, 0.008, 0.03, 8)
  barrel.rotateX(Math.PI / 2)
  barrel.translate(0, 0.022, -0.108)
  p.add(flat(barrel, S.steel))

  // Armazón: la parte de abajo, un poco más ancha que la corredera.
  const frame = box(0.032, 0.03, 0.15, 0.005)
  frame.translate(0, -0.005, 0.0)
  p.add(flat(frame, S.polymer))

  // Empuñadura, inclinada hacia atrás como cualquier pistola real.
  const grip = box(0.032, 0.115, 0.042, 0.01)
  grip.rotateX(0.28)
  grip.translate(0, -0.077, 0.038)
  p.add(flat(grip, S.polymer))

  // Base del cargador.
  const magBase = box(0.036, 0.012, 0.048, 0.004)
  magBase.rotateX(0.28)
  magBase.translate(0, -0.132, 0.056)
  p.add(flat(magBase, S.gunmetal))

  // Guardamonte: dos barras finas. Cierra la silueta y es lo que hace que se
  // lea "pistola" y no "taco de madera".
  const guardFront = box(0.014, 0.035, 0.01, 0.003)
  guardFront.translate(0, -0.042, 0.0)
  p.add(flat(guardFront, S.polymer))
  const guardBottom = box(0.014, 0.009, 0.042, 0.003)
  guardBottom.translate(0, -0.057, 0.018)
  p.add(flat(guardBottom, S.polymer))

  const trigger = box(0.008, 0.026, 0.008, 0.002)
  trigger.rotateX(0.15)
  trigger.translate(0, -0.038, 0.022)
  p.add(flat(trigger, S.steel))

  // Miras: dos puntos que, vistos desde arriba, marcan hacia dónde apunta.
  const rear = box(0.022, 0.009, 0.012, 0.002)
  rear.translate(0, 0.047, 0.06)
  p.add(flat(rear, S.gunmetal))
  const front = box(0.006, 0.009, 0.008, 0.002)
  front.translate(0, 0.047, -0.085)
  p.add(flat(front, S.gunmetal))

  return {
    geometry: p.build(),
    gripRight: new THREE.Vector3(0, -0.062, 0.03),
    // La mano de apoyo envuelve a la de disparo: no agarra el arma, agarra la
    // otra mano. Por eso está apenas más abajo y del lado contrario.
    gripLeft: new THREE.Vector3(-0.032, -0.086, 0.05),
    muzzle: new THREE.Vector3(0, 0.022, -0.125),
    /**
     * Brazos estirados al frente, a la altura del pecho.
     *
     * La distancia está elegida para que los codos queden al 86% de extensión:
     * con el arma más cerca los brazos se doblan y la pose se lee como
     * "guardando la pistola", y estirados del todo la IK se queda sin margen y
     * el codo se traba cuando el arma retrocede.
     */
    rest: {
      position: new THREE.Vector3(0.0, 0.44, -0.5),
      rotation: new THREE.Euler(0.02, 0.0, 0.0),
    },
    /** Seca y visible: es un arma liviana con un disparo cada 0.42 s. */
    recoil: { kick: 0.035, rise: 0.34, decay: 7.5 },
    /**
     * Pose de la habilidad `Dual`, la tercera de la pistola: se desenfunda una
     * segunda y disparan alternadas.
     *
     * Cada mano lleva la suya, así que las dos agarran por `gripRight` y el
     * codo de apoyo deja de existir: los brazos se abren y quedan simétricos.
     * Es la única habilidad del juego que cambia la POSE del personaje, y
     * hasta ahora decía que desenfundabas una segunda pistola que no aparecía.
     */
    dual: {
      // La X la sobrescribe SoldierModel con DUAL_MUZZLE_OFFSET: acá solo
      // importan la altura, la profundidad y la convergencia hacia el blanco.
      right: {
        position: new THREE.Vector3(-0.17, 0.43, -0.44),
        rotation: new THREE.Euler(0.02, 0.13, -0.05),
      },
      left: {
        position: new THREE.Vector3(0.17, 0.43, -0.44),
        rotation: new THREE.Euler(0.02, -0.13, 0.05),
      },
      /** Con las dos manos ocupadas, cada codo se abre hacia su lado. */
      poleRight: new THREE.Vector3(-0.7, -0.68, 0.22),
      poleLeft: new THREE.Vector3(0.7, -0.68, 0.22),
    },
  }
}

/**
 * Escopeta táctica de corredera, ~96 cm.
 *
 * La corredera (`pump`) es una pieza aparte a propósito: es el único
 * movimiento mecánico visible del juego y se anima en cada disparo. Un arma
 * que escupe seis perdigones y no se mueve se siente de juguete.
 */
function buildShotgun(S) {
  const p = new Part('shotgun')

  const receiver = box(0.048, 0.072, 0.25, 0.008)
  receiver.translate(0, 0, 0.06)
  p.add(flat(receiver, S.gunmetal))

  const barrel = cyl(0.013, 0.014, 0.44, 8)
  barrel.rotateX(Math.PI / 2)
  barrel.translate(0, 0.015, -0.28)
  p.add(flat(barrel, S.gunmetal))

  // Tubo del cargador, debajo del caño. Es lo que le da a la escopeta su
  // sección de "dos caños" vista de frente.
  const tube = cyl(0.012, 0.012, 0.34, 8)
  tube.rotateX(Math.PI / 2)
  tube.translate(0, -0.022, -0.22)
  p.add(flat(tube, S.gunmetal))

  const muzzleRing = cyl(0.018, 0.017, 0.045, 8)
  muzzleRing.rotateX(Math.PI / 2)
  muzzleRing.translate(0, 0.015, -0.49)
  p.add(flat(muzzleRing, S.steel))

  const grip = box(0.034, 0.105, 0.046, 0.01)
  grip.rotateX(0.3)
  grip.translate(0, -0.078, 0.135)
  p.add(flat(grip, S.polymer))

  // Culata y carrillera.
  const stock = box(0.045, 0.075, 0.2, 0.015)
  stock.translate(0, -0.012, 0.29)
  p.add(flat(stock, S.polymer))
  const butt = box(0.05, 0.1, 0.026, 0.008)
  butt.translate(0, -0.018, 0.395)
  p.add(flat(butt, S.rubber))

  // Cartuchera lateral: tres cartuchos a la vista, en latón. Es el detalle que
  // dice "escopeta" de un vistazo, incluso desde la cámara cenital.
  for (let i = 0; i < 3; i++) {
    const shell = cyl(0.011, 0.011, 0.05, 6)
    shell.rotateZ(Math.PI / 2)
    shell.translate(0.036, 0.012 - i * 0.024, 0.075)
    p.add(flat(shell, S.webbing))
  }

  const rear = box(0.03, 0.014, 0.014, 0.003)
  rear.translate(0, 0.046, 0.13)
  p.add(flat(rear, S.gunmetal))

  return {
    geometry: p.build(),
    gripRight: new THREE.Vector3(0, -0.07, 0.115),
    gripLeft: new THREE.Vector3(0, -0.052, -0.235),
    muzzle: new THREE.Vector3(0, 0.015, -0.515),
    /** Encarada: la culata contra el hombro derecho, el caño cruzando al frente. */
    rest: {
      position: new THREE.Vector3(-0.075, 0.36, -0.2),
      rotation: new THREE.Euler(0.12, -0.2, 0.06),
    },
    /** El culatazo más fuerte del juego, y el más lento en volver. */
    recoil: { kick: 0.085, rise: 0.55, decay: 4.5 },
    /**
     * La corredera se va para atrás y vuelve. `travel` en metros, `time` en
     * segundos del ciclo completo — lo consume SoldierModel.
     */
    pump: { travel: 0.09, time: 0.34 },
  }
}

/**
 * Subfusil compacto, ~52 cm.
 *
 * Dispara cada 0.13 s, así que todo lo suyo es corto: el retroceso apenas se
 * insinúa —con esa cadencia, un culatazo grande sería un temblor constante— y
 * se lleva pegado al pecho, que es de donde no se mueve.
 */
function buildSMG(S) {
  const p = new Part('smg')

  const receiver = box(0.044, 0.082, 0.22, 0.008)
  receiver.translate(0, 0.005, 0.02)
  p.add(flat(receiver, S.gunmetal))

  // Guardamano perforado.
  const shroud = cyl(0.021, 0.021, 0.15, 8)
  shroud.rotateX(Math.PI / 2)
  shroud.translate(0, 0.012, -0.15)
  p.add(flat(shroud, S.polymer))

  const barrel = cyl(0.008, 0.008, 0.06, 6)
  barrel.rotateX(Math.PI / 2)
  barrel.translate(0, 0.012, -0.25)
  p.add(flat(barrel, S.steel))

  const grip = box(0.032, 0.1, 0.042, 0.01)
  grip.rotateX(0.26)
  grip.translate(0, -0.078, 0.075)
  p.add(flat(grip, S.polymer))

  // Cargador recto y largo, adelante de la empuñadura: la firma de un subfusil.
  const mag = box(0.03, 0.19, 0.05, 0.008)
  mag.rotateX(-0.06)
  mag.translate(0, -0.12, -0.02)
  p.add(flat(mag, S.polymer))

  const foregrip = box(0.028, 0.06, 0.03, 0.008)
  foregrip.rotateX(-0.1)
  foregrip.translate(0, -0.052, -0.185)
  p.add(flat(foregrip, S.polymer))

  // Culata plegable de alambre: dos barras y una paleta.
  for (const s of [1, -1]) {
    const arm = box(0.008, 0.008, 0.16, 0.002)
    arm.translate(s * 0.019, -0.01, 0.185)
    p.add(flat(arm, S.steel))
  }
  const pad = box(0.05, 0.055, 0.014, 0.005)
  pad.translate(0, -0.01, 0.27)
  p.add(flat(pad, S.rubber))

  const optic = box(0.03, 0.036, 0.075, 0.008)
  optic.translate(0, 0.062, -0.01)
  p.add(flat(optic, S.gunmetal))
  const lens = cyl(0.014, 0.014, 0.01, 8)
  lens.rotateX(Math.PI / 2)
  lens.translate(0, 0.064, -0.05)
  p.add(flat(lens, S.optic))

  return {
    geometry: p.build(),
    gripRight: new THREE.Vector3(0, -0.072, 0.062),
    gripLeft: new THREE.Vector3(0, -0.055, -0.185),
    muzzle: new THREE.Vector3(0, 0.012, -0.285),
    /** Pegada al pecho, alta y corta. */
    rest: {
      position: new THREE.Vector3(-0.04, 0.34, -0.2),
      rotation: new THREE.Euler(0.14, -0.26, 0.1),
    },
    /** Casi nada: a 7.7 disparos por segundo, lo que se busca es vibración. */
    recoil: { kick: 0.016, rise: 0.13, decay: 14 },
    /**
     * El caño se pone al rojo con la habilidad `Calentamiento`, que premia no
     * dejar de disparar: es la única habilidad del juego cuyo efecto se puede
     * MOSTRAR en el arma en vez de solo sentirse en la cadencia.
     */
    heat: { color: 0xff5a2a, from: new THREE.Vector3(0, 0.012, -0.2) },
  }
}

/**
 * Carabina de asalto, ~84 cm. NO es un arma jugable.
 *
 * Es lo que lleva un soldado al que todavía no le asignaron arma: el jugador
 * elige la suya en el menú y los compañeros la reciben al aparecer, así que
 * entre que el modelo se construye y llega esa llamada hay unos frames con las
 * manos vacías. Antes este fusil era el arma de los tres personajes.
 */
function buildRifle(S) {
  const p = new Part('rifle')

  const receiver = box(0.05, 0.075, 0.29, 0.012)
  receiver.translate(0, 0, 0.02)
  p.add(flat(receiver, S.gunmetal))

  const rail = box(0.028, 0.014, 0.36, 0.004)
  rail.translate(0, 0.045, -0.06)
  p.add(flat(rail, S.gunmetal))

  const handguard = cyl(0.032, 0.032, 0.26, 8)
  handguard.rotateX(Math.PI / 2)
  handguard.translate(0, -0.004, -0.26)
  p.add(flat(handguard, S.polymer))

  const barrel = cyl(0.0095, 0.011, 0.2, 8)
  barrel.rotateX(Math.PI / 2)
  barrel.translate(0, 0.012, -0.45)
  p.add(flat(barrel, S.gunmetal))

  const muzzleDevice = cyl(0.015, 0.014, 0.06, 8)
  muzzleDevice.rotateX(Math.PI / 2)
  muzzleDevice.translate(0, 0.012, -0.55)
  p.add(flat(muzzleDevice, S.steel))

  const grip = box(0.035, 0.11, 0.05, 0.012)
  grip.rotateX(0.32)
  grip.translate(0, -0.085, 0.115)
  p.add(flat(grip, S.polymer))

  const trigger = box(0.02, 0.035, 0.035, 0.008)
  trigger.translate(0, -0.045, 0.06)
  p.add(flat(trigger, S.gunmetal))

  // Cargador curvo: dos tramos con ángulos distintos aproximan la curva.
  const magTop = box(0.03, 0.1, 0.06, 0.008)
  magTop.rotateX(-0.08)
  magTop.translate(0, -0.09, -0.015)
  p.add(flat(magTop, S.polymer))
  const magBottom = box(0.03, 0.11, 0.058, 0.008)
  magBottom.rotateX(-0.28)
  magBottom.translate(0, -0.185, 0.008)
  p.add(flat(magBottom, S.polymer))

  const tube = cyl(0.019, 0.019, 0.17, 8)
  tube.rotateX(Math.PI / 2)
  tube.translate(0, 0.012, 0.24)
  p.add(flat(tube, S.gunmetal))

  const stock = box(0.05, 0.075, 0.16, 0.018)
  stock.translate(0, -0.005, 0.27)
  p.add(flat(stock, S.polymer))

  const butt = box(0.055, 0.1, 0.03, 0.012)
  butt.translate(0, -0.012, 0.345)
  p.add(flat(butt, S.rubber))

  const opticBody = box(0.04, 0.05, 0.11, 0.012)
  opticBody.translate(0, 0.078, -0.05)
  p.add(flat(opticBody, S.gunmetal))
  const lens = cyl(0.019, 0.019, 0.012, 10)
  lens.rotateX(Math.PI / 2)
  lens.translate(0, 0.082, -0.107)
  p.add(flat(lens, S.optic))

  const foregrip = box(0.03, 0.07, 0.032, 0.01)
  foregrip.rotateX(-0.12)
  foregrip.translate(0, -0.055, -0.3)
  p.add(flat(foregrip, S.polymer))
  const light = cyl(0.015, 0.015, 0.09, 8)
  light.rotateX(Math.PI / 2)
  light.translate(0.042, -0.005, -0.33)
  p.add(flat(light, S.gunmetal))

  return {
    geometry: p.build(),
    gripRight: new THREE.Vector3(0.0, -0.085, 0.105),
    gripLeft: new THREE.Vector3(0.0, -0.05, -0.235),
    muzzle: new THREE.Vector3(0, 0.012, -0.56),
    rest: {
      position: new THREE.Vector3(-0.03, 0.3, -0.22),
      rotation: new THREE.Euler(0.16, -0.34, 0.12),
    },
    recoil: { kick: 0.05, rise: 0.3, decay: 6 },
  }
}

/** Tabla de constructores. Agregar un arma es agregar una fila. */
const BUILDERS = {
  PISTOL: buildPistol,
  SHOTGUN: buildShotgun,
  SMG: buildSMG,
  RIFLE: buildRifle,
}

/** Lo que lleva un soldado hasta que le asignan su arma. */
export const DEFAULT_WEAPON = 'RIFLE'

/**
 * Devuelve el modelo del arma, construyéndolo la primera vez.
 *
 * @param {string} key clave de WEAPON_DEFS
 * @param {object} swatch atlas del soldado (`SoldierAtlas.swatch`)
 * @returns {{geometry:THREE.BufferGeometry, gripRight:THREE.Vector3, gripLeft:THREE.Vector3,
 *           muzzle:THREE.Vector3, rest:object, recoil:object}}
 */
export function getWeaponModel(key, swatch) {
  const cached = cache.get(key)
  if (cached) return cached

  const build = BUILDERS[key]
  if (!build) return null

  const model = build(swatch)
  cache.set(key, model)
  return model
}

/** ¿Existe un modelo para esta clave? Lo usa el soldado antes de pedirlo. */
export function hasWeaponModel(key) {
  return Boolean(BUILDERS[key])
}

/**
 * Suelta las geometrías cacheadas. Solo lo necesita la página de pruebas al
 * recargar: en el juego las armas viven lo que vive la pestaña.
 */
export function disposeWeaponModels() {
  for (const model of cache.values()) model.geometry.dispose()
  cache.clear()
}
