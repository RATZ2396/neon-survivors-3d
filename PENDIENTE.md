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

**~~Las 2 habilidades base que faltaban~~ — hechas.** `Onda expansiva` (daña
y empuja) y `Dron` (acompañantes que disparan solos). La base quedó en 4:
escudo orbital, rayo, onda y dron.

**~~Las 3 propias de cada personaje~~ — hechas.** Se decidieron el 2026-09-04
y son modificadores del arma, no armas nuevas:

| Pistola | Escopeta | Metralleta |
|---|---|---|
| Rebote | Impacto (empuje) | Calentamiento |
| Cañón trasero | Abanico trasero | Doble línea |
| Perforación total | Doble cañón | Bala explosiva |

La cuenta cierra: **7 al alcance por partida** (4 de base + 3 propias) con un
techo de 4 equipadas, así que nunca las tenés todas.

**Lo que queda del punto 1:** unificar arma y habilidad en un solo sistema.
`Rayo`, `Escudo orbital` y compañía ya tienen daño, enfriamiento y alcance —
son armas. Esa división hoy solo agrega código. Ojo que las de `kind: WEAPON`
ya cruzaron media frontera: viven en `SkillDefs` pero las aplica el arma.

## 2. Recolección

- **Dinero:** lo suelta **cada enemigo**, se junta como las gemas, y se gasta
  en el taller igual que ahora.
- **Sacar la mejora `Imán`** del menú de subir de nivel.
- **Objetos que aparecen en el mapa cada cierto tiempo**, no los suelta nadie:
  - **corazón** — regenera vida
  - **imán** — atrae todo lo recolectable del mapa

## 3. Vida

Regeneración lenta mientras no recibas daño. Nada más que eso.

## 4. Enemigos

- **Minijefes**, básicos por ahora: uno que **corre y golpea**, y una **"bruja"
  que tira algo a distancia**. Aparecen **dentro de la horda**, a propósito —
  al revés que el boss, que pelea solo (ver `CONFIG.BOSS.SPAWN_SLOWDOWN`).
- El boss actual se queda como está.

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
- Enemigos comunes que disparan — la bruja es un minijefe, es otra cosa
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
