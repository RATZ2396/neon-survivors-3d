import fs from 'node:fs'
import path from 'node:path'

/**
 * Endpoint del grabador de partidas.
 *
 * `apply: 'serve'` es la parte importante: este plugin existe SOLO en el
 * servidor de desarrollo. El build de producción no lo incluye, así que el
 * juego publicado no tiene ningún endpoint que escriba archivos.
 *
 * Recibe el informe que manda src/dev/RunRecorder.js al terminar una partida
 * y lo deja en `grabaciones/`, para poder leerlo sin que nadie tenga que
 * copiar y pegar nada.
 */
function grabador() {
  return {
    name: 'grabador-de-partidas',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__grabador', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('solo POST')
          return
        }

        let cuerpo = ''
        req.on('data', (trozo) => {
          cuerpo += trozo
          // Un informe honesto pesa unos pocos KB. Cortar en 8 MB evita que un
          // bucle infinito de muestreo llene el disco.
          if (cuerpo.length > 8e6) req.destroy()
        })

        req.on('end', () => {
          try {
            const dir = path.resolve('grabaciones')
            fs.mkdirSync(dir, { recursive: true })
            const nombre = 'partida-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'
            fs.writeFileSync(path.join(dir, nombre), cuerpo)
            res.statusCode = 200
            res.end(nombre)
          } catch (err) {
            res.statusCode = 500
            res.end(String(err))
          }
        })
      })
    },
  }
}

export default {
  /**
   * RUTAS RELATIVAS. Es la línea que decide si el juego arranca o no en un
   * portal.
   *
   * Por defecto Vite escribe `src="/assets/index-xxx.js"`, con barra
   * inicial. Eso funciona servido desde la raíz de un dominio (Vercel) y
   * falla en todos lados donde el juego vive en una subcarpeta — que es
   * exactamente cómo lo sirven CrazyGames, GameDistribution y Y8 cuando
   * subís el ZIP. La barra manda el pedido a la raíz del portal, no a la
   * de tu juego: 404 y pantalla negra, sin ningún error visible.
   */
  base: './',
  plugins: [grabador()],
}
