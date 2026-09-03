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

// Expuesto solo para inspección manual desde la consola durante el desarrollo.
if (import.meta.env.DEV) {
  window.game = game
}
