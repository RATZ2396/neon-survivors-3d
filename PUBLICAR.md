# Publicar

Lo que falta para que esto deje de ser un proyecto y empiece a generar algo.
Está acá y no en el README porque el README documenta el juego; esto es el
camino a un portal.

## La decisión, para no rediscutirla

**Web, y la UI se diseña para teléfono.** No se elige plataforma: en estos
portales subís **un solo ZIP** y ellos lo sirven a todo el mundo, PC y teléfono
por igual. No existe la casilla "solo PC". Entonces:

- Una UI que funciona a 375px funciona a 1920. **Al revés no.** Esa es la razón
  que decide sola.
- El género ya es de un dedo: el input real es moverse. El apuntado manual con
  Espacio es un extra de PC, no el juego.
- El build pesa **~700 KB**. CrazyGames pide 50 MB o menos para el primer
  jugable, y 20 MB o menos para entrar en la home móvil. Estamos treinta veces
  por debajo de esa segunda puerta, que casi nada hecho en Unity puede cruzar.

**Unity + Steam/itch.io queda para después**, y es otro negocio: pago por copia
en vez de ingresos por publicidad. No es un reemplazo de esto.

## Hecho

- [x] **Rutas relativas** (`base: './'` en `vite.config.js`). Era EL bloqueante:
      Vite escribía `src="/assets/…"` con barra inicial, que funciona servido
      desde la raíz de un dominio y da 404 en una subcarpeta — que es como sirve
      el ZIP cualquier portal. Verificado sirviendo el build real desde
      `/games/mi-juego/`.
- [x] **Pantalla de carga**, en el HTML y no dibujada por el juego: tiene que
      aparecer antes de que baje el bundle. Sin porcentaje, porque no hay nada
      que medir y cualquier número sería inventado.
- [x] **Perder el foco pausa y suspende el audio.** Es también el lugar donde se
      van a enganchar los avisos del SDK.
- [x] **Pausa táctil** (44px, arriba a la derecha) que abre el menú de pausa que
      ya existía, y con él silencio y abandonar.
- [x] **Botones en la pantalla de muerte.** Antes solo decía "R para reintentar ·
      T para el taller": en un teléfono, morirse no tenía salida.
- [x] **El joystick ya no depende del ancho.** Estaba atado a `max-width: 768px`
      y un teléfono acostado mide 812: al rotarlo desaparecía y te quedabas sin
      poder moverte. Ahora se pregunta por `hover: none` y `pointer: coarse`,
      que no cambian al girar el aparato.
- [x] **Menú en teléfono**: cero desbordes a 375px (había tres), título que no se
      corta, instrucciones según con qué se juega.
- [x] **Favicon embebido** y ningún `console` propio en el bundle de producción.

## Falta

### Antes de subir

- [ ] **Ícono y capturas.** Cada portal pide una miniatura y varias capturas. Es
      lo primero que ve alguien decidiendo si te clickea.
- [ ] **Texto de la ficha**: título, descripción corta, descripción larga,
      controles, etiquetas. En inglés, que es donde está el tráfico.
- [ ] **Probar en un teléfono de verdad.** Todo lo de arriba se midió emulando.
      El emulador no miente sobre el layout, pero sí sobre el calor, la batería y
      lo que hace un pulgar real tapando media pantalla.

### Para monetizar

- [ ] **SDK del portal.** En CrazyGames el SDK es *opcional* para el "Basic
      Launch": podés estar publicado y con jugadores reales sin monetizar
      todavía. Para el "Full Launch" — que es donde entra la plata — es
      obligatorio.
- [ ] Enganchar los avisos del SDK a `pause()` / `resume()` y a
      `sound.suspend()` / `sound.unlock()`. El trabajo ya está hecho; solo cambia
      quién lo dispara.
- [ ] Decidir dónde va un video recompensado, si se usa. El candidato natural es
      revivir una vez por partida.

### Orden sugerido de portales

1. **CrazyGames**, Basic Launch primero. Es el que deja estar vivo sin SDK, así
   que da jugadores reales y números antes de invertir en la integración.
2. **GameDistribution** y **Y8**: los menos selectivos, con su SDK de ads.
3. **Poki** al final. Es curado y **por invitación**: hay que postular y esperar.
   Su límite de descarga inicial es de **8 MB** — entramos cómodos, pero conviene
   llegar con el móvil ya sólido.

## Números verificados

| | |
|---|---|
| Peso del build | ~700 KB (183 KB gzip), un solo archivo |
| Límite CrazyGames | 250 MB totales · 50 MB primer jugable · 20 MB para home móvil |
| Límite Poki | 8 MB de descarga inicial, y es por invitación |
| FPS en pantalla de teléfono | 60, con la horda encima |
| Tests | 137, todos pasan |
| Assets de terceros | **ninguno** — geometría procedural y los 16 sonidos sintetizados |

Ese último renglón vale más de lo que parece: **cero riesgo de licencias**, y los
portales lo preguntan.

Fuentes de los límites: [CrazyGames](https://docs.crazygames.com/requirements/intro/)
· [Poki](https://sdk.poki.com/requirements)
