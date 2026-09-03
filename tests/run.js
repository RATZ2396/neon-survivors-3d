/**
 * Corredor de tests — sin dependencias, sin framework.
 *
 * Se ejecuta con `npm test`, que es todo lo que pide la Parte K del GDD: que
 * los tests corran en un comando y no en un archivo que nadie abre. El
 * proyecto anterior tenía un `TestFramework.js` de 291 líneas que no corría en
 * ningún lado — el problema nunca fue el framework, fue que no había un botón.
 *
 * QUÉ SE TESTEA ACÁ Y QUÉ NO
 *
 *   SÍ: todo lo que es lógica pura y decide el resultado de una partida — la
 *   curva de XP, el perfil guardado, los modificadores de las mejoras, la
 *   rejilla espacial, el daño diferido con borrado por intercambio, los pesos
 *   de las oleadas, el presupuesto de voces.
 *
 *   NO: lo que solo se puede juzgar mirando. Que la escopeta "se sienta"
 *   contundente o que el bloom quede lindo no lo dice un assert. Eso se
 *   verifica en el navegador y está documentado en el README.
 *
 * Los tests corren en Node, sin navegador y sin WebGL: por eso se prueban las
 * clases de datos y no las que crean mallas. Esa separación no se hizo para
 * poder testear — ya estaba, porque los datos y el dibujo estaban separados
 * desde el principio. Testear salió gratis por eso.
 */

let pasados = 0
let fallados = 0
const errores = []
let grupoActual = ''

export function describe(nombre, fn) {
  grupoActual = nombre
  fn()
  grupoActual = ''
}

export function test(nombre, fn) {
  const etiqueta = grupoActual ? `${grupoActual} › ${nombre}` : nombre
  try {
    fn()
    pasados++
    process.stdout.write('.')
  } catch (e) {
    fallados++
    process.stdout.write('X')
    errores.push({ etiqueta, error: e })
  }
}

function fallar(mensaje) {
  throw new Error(mensaje)
}

export function expect(real) {
  return {
    toBe(esperado) {
      if (real !== esperado) fallar(`esperaba ${fmt(esperado)}, recibió ${fmt(real)}`)
    },
    toEqual(esperado) {
      const a = JSON.stringify(real)
      const b = JSON.stringify(esperado)
      if (a !== b) fallar(`esperaba ${b}, recibió ${a}`)
    },
    /** Para flotantes: comparar con === es pedirle peras al binario. */
    toBeCloseTo(esperado, tolerancia = 1e-6) {
      if (Math.abs(real - esperado) > tolerancia) {
        fallar(`esperaba ~${esperado} (±${tolerancia}), recibió ${real}`)
      }
    },
    toBeGreaterThan(n) {
      if (!(real > n)) fallar(`esperaba > ${n}, recibió ${fmt(real)}`)
    },
    toBeLessThan(n) {
      if (!(real < n)) fallar(`esperaba < ${n}, recibió ${fmt(real)}`)
    },
    toBeTruthy() {
      if (!real) fallar(`esperaba algo verdadero, recibió ${fmt(real)}`)
    },
    toBeFalsy() {
      if (real) fallar(`esperaba algo falso, recibió ${fmt(real)}`)
    },
    toContain(x) {
      if (!real.includes(x)) fallar(`esperaba que ${fmt(real)} contuviera ${fmt(x)}`)
    },
    toThrow() {
      let tiro = false
      try {
        real()
      } catch {
        tiro = true
      }
      if (!tiro) fallar('esperaba que lanzara una excepción')
    },
  }
}

function fmt(v) {
  if (typeof v === 'string') return `"${v}"`
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function resumen() {
  process.stdout.write('\n\n')

  for (const { etiqueta, error } of errores) {
    console.error(`FALLÓ  ${etiqueta}`)
    console.error(`       ${error.message}\n`)
  }

  const total = pasados + fallados
  if (fallados === 0) {
    console.log(`${total} tests, todos pasan.`)
  } else {
    console.error(`${total} tests · ${pasados} pasan · ${fallados} FALLAN`)
  }
  return fallados
}
