# Pendiente

Lo que sigue, decidido con el diseñador el 2026-09-04. Está acá y no en el
README porque son cambios acordados y todavía sin hacer: el README documenta lo
que existe.

## Regla que ordena todo lo de abajo

**Un personaje = su arma, para siempre.** No hay arsenal ni armas que se juntan
durante la partida. La profundidad tiene que venir de las habilidades, la
recolección y los enemigos — nunca de sumar armas.

## 1. Habilidades

**~~Sacar `Campo de fuerza`~~ — hecho.** Ya no está en `SkillDefs.js`, y con
ella se fue el `kind` `AURA` entero.

**~~Las habilidades base~~ — rehechas el 2026-09-09.** La base pasó de 3 a 5:

| | |
|---|---|
| **Sierras** | era `Escudo orbital`. Mismos números, otra cosa: un escudo dice "esto me protege" y lo que hace es cortar al que se acerca |
| **Rayo** | sin cambios |
| **Escarcha** | reemplaza a `Onda expansiva`. Frena en vez de empujar |
| **Señuelo** | nueva. Un cebo que la horda persigue en vez de a vos |
| **Guadaña** | nueva. Tajo en cono hacia donde caminás |

La onda se fue por una razón medida: su empuje **no mueve a los `heavy`**, y hoy
hay siete —el Cazador y las seis élites—, así que su rasgo distintivo no servía
contra nada de lo que te mata. Escarcha y Señuelo son ahora las dos únicas
cartas que le hacen algo a un minijefe además de daño.

Antes de esto también se probó `Dron` y se sacó enseguida: chocaba con la regla
de arriba — un acompañante que dispara solo es una segunda arma con otro nombre.

**~~Las 3 propias de cada personaje~~ — hechas.** Se decidieron el 2026-09-04
y son modificadores del arma, no armas nuevas:

| Pistola | Escopeta | Metralleta |
|---|---|---|
| Rebote | Impacto (empuje) | Calentamiento |
| ~~Cañón trasero~~ | ~~Abanico trasero~~ | Doble línea |
| Perforación total | Doble cañón | Bala explosiva |

Las dos tachadas **se borraron** al agregar el escuadrón: repetían la andanada
180° hacia atrás, o sea un tipo disparando por la espalda sin darse vuelta.
Cubrían el problema real —que la horda te rodea— pero se veían falsas, porque lo
eran. Ahora eso lo hace un compañero de verdad, que se elige en el mismo menú de
nivel (ver `player/Squad.js`).

La cuenta quedó en **5 o 6 al alcance por partida** según el personaje (3 de base
+ 2 o 3 propias), más hasta 2 compañeros, con un techo de 4 habilidades
equipadas: nunca las tenés todas.

**Lo que queda del punto 1:** unificar arma y habilidad en un solo sistema.
`Rayo`, `Sierras` y compañía ya tienen daño, enfriamiento y alcance —
son armas. Esa división hoy solo agrega código. Ojo que las de `kind: WEAPON`
ya cruzaron media frontera: viven en `SkillDefs` pero las aplica el arma.

## 2. ~~Recolección~~ — hecha

- **~~Dinero~~:** cada enemigo suelta una moneda (`coin` en `ENEMY_DEFS`), se
  junta como las gemas y se gasta en el taller. La recompensa de fin de
  partida dejó de pagar por baja y por boss: eso ahora está en el piso.
- **~~Sacar la mejora `Imán`~~.** Fuera del mazo. El radio base subió de 2.6 a
  3.4 para compensarla.
- **~~Objetos en el mapa~~:** corazón (cura 35) e imán (atrae todo por 2.5 s).
  Aparecen cada 26 s, a 9-24 unidades tuyas, tope de 3 a la vez.

Todo vive en `config/PickupDefs.js` + `progression/PickupManager.js`, que
reemplazó a `GemManager`. El archivo viejo terminaba diciendo "es el tercer
sistema con esta forma; si hiciera falta un cuarto, ahí sí valdría
abstraerlo" — habrían hecho falta un cuarto y un quinto.

## 3. ~~Vida~~ — hecha

Regeneración lenta mientras no recibas daño. Nada más que eso.

## 4. ~~Enemigos~~ — hecho

La forma acordada —**horda → minijefe CON la horda → jefe casi solo**— ahora
está escrita en una sola tabla, `ELITE_SCHEDULE` (`config/BossDefs.js`), en
vez de en dos constantes que solo podían describir un jefe repetido para
siempre con más vida.

**~~Minijefes~~ — hechos.** Tres, y aparecen dentro de la horda, que no para:

| | Qué hace | Vida |
|---|---|---|
| **El Bruto** | Embiste | 650 |
| **El Guardián** | Frena las balas y golpea el área | 950 |
| **El Acechador** | Embiste rápido y avisa poco | 420 |

**~~Enemigos comunes nuevos~~ — hechos.** Tres, y ninguno dispara (ver
"Descartado"):

- **Larva**: casi sin vida, muchas. Deja crecer la horda en cantidad sin que
  crezca la vida total, así la presión viene de que te rodean.
- **Mitosis**: al morir se parte en dos larvas. El único cuya muerte empeora
  tu situación inmediata, así que cambia a qué le disparás.
- **Cazador**: es `heavy`, o sea que nada lo empuja y la multitud no lo
  bloquea. Es el final de correr en círculos arrastrando a todos atrás.

**~~Jefes distintos~~ — hechos.** El Cube King ya no es el único: están **El
Segador** (el único que embiste y golpea el área) y **El Coloso** (el golpe
más grande y más seguido del juego). Los tres salen del mismo controlador y de
la misma tabla: un jefe nuevo son dos filas, no una clase.

**La bruja se descartó** (2026-09-08). Era el minijefe que iba a atacar a
distancia y no va a existir: pedía un pool de proyectiles enemigos entero —el
único que hay es el del jugador y colisiona contra enemigos, no contra el
jugador— para una sola unidad. Ver también "Descartado explícitamente".

## Nombres

`enfriamiento` pasa a llamarse **`recarga`** en todo lo que ve el jugador.

## Descartado explícitamente

No proponer de nuevo, ya se decidió que no:

- Arsenal de varias armas por partida
- Reroll / Banish / Skip en el menú de nivel
- Ejes nuevos de estadística (armadura, esquiva, suerte…)
- Nivel de peligro
- Cargador y recarga con munición
- Estados con nombre (Ignite / Electrify / Injure)
- Enemigos comunes que disparan
- **La bruja** y cualquier enemigo que ataque a distancia. Descartada el
  2026-09-08: obliga a construir un pool de proyectiles enemigos completo
  para una sola unidad
- Evoluciones de armas
- Acción manual tipo esquive. Lo único manual que se agregó es **ESPACIO**
  para alternar apuntado automático / manual con el mouse.

## Para más adelante

- **El mapa**: obstáculos que frenan y tapan balas, en vez de una grilla
  infinita y plana. Acordado, pero después de lo de arriba.
- **Balance del boss.** Medido en una partida real: el duelo dura ~90 segundos
  y son **87 segundos sin recibir un solo golpe** (vida clavada en 92/100). El
  boss no puede alcanzar a un jugador que se mueve, y al sacarle la horda al
  duelo se quedó sin ninguna amenaza. Al salir del duelo, además, hay un
  escalón: de 8 a 71 enemigos en 20 segundos. Se arregla cuando exista una
  base buena, no ahora.
