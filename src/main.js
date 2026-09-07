import { GameManager } from './core/GameManager.js'

/**
 * ÚNICO entry point del juego (GDD_v2 §1, regla 2).
 *
 * index.html carga este archivo y ningún otro script de juego. Si alguna vez
 * hace falta "arreglar" algo, se arregla en el módulo correspondiente —
 * nunca con un script extra cargado por encima.
 */
const container = document.getElementById('app')
const game = new GameManager(container)
game.start()

/**
 * Se va la pantalla de carga.
 *
 * No al terminar de construir el juego, sino DESPUÉS del primer frame
 * dibujado: construir deja la escena lista pero todavía no hay un solo
 * píxel en pantalla, así que sacarla ahí destapa un negro. Dos
 * requestAnimationFrame anidados es lo que garantiza que el primer render
 * ya ocurrió.
 */
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    const loader = document.getElementById('loader')
    if (!loader) return
    loader.classList.add('done')
    // Se borra, no se esconde: no tiene nada más que hacer en la página.
    setTimeout(() => loader.remove(), 400)
  }),
)

// Expuesto solo para inspección manual desde la consola durante el desarrollo.
if (import.meta.env.DEV) {
  window.game = game
}
