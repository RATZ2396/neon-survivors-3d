# Neon Survivors 3D — v2

Reconstrucción del prototipo siguiendo [`GDD_v2.md`](./GDD_v2.md).

## Cómo correrlo

```bash
npm install
npm run dev
```

Abre en `http://localhost:5173`.

| Control | Qué hace |
|---|---|
| **1 … 3** o clic, en la pantalla de inicio | marcar el arma base y ver su taller |
| **Enter** o botón JUGAR | empezar la partida con el arma marcada |
| **WASD** / joystick en pantallas < 769px | mover (es lo único que se controla: el disparo es automático) |
| **1 … 4** o clic, en el menú de nivel | elegir la habilidad o mejora |
| **L** | abrir el laboratorio de habilidades (solo en desarrollo) |
| **M** | silenciar / restaurar el sonido (se recuerda en el perfil) |
| **B** | encender / apagar el bloom, para comparar |
| **R** / **T** tras morir | reintentar con la misma arma / volver al taller |

La barra de abajo es **tu build**: el arma elegida (con su enfriamiento) y las habilidades que fuiste consiguiendo, con su nivel. El panel de arriba a la izquierda es diagnóstico técnico (FPS, memoria, draw calls) y se apaga con `CONFIG.DEV.SHOW_DEBUG_PANEL`.

## Modelo de armas y habilidades

Son dos progresiones distintas y no se mezclan:

| | Arma base | Habilidades |
|---|---|---|
| Cuáles | pistola · escopeta · metralleta | escudo orbital · campo de fuerza · rayo |
| Cuándo se elige | **antes** de la partida, en la pantalla de inicio | **durante** la partida, al subir de nivel |
| Cuántas por partida | una sola, no cambia | hasta 4, subibles a nivel 5 |
| Cómo se mejoran | **fuera** de la partida, en el taller, con la moneda ganada | **dentro** de la partida, con la XP de las gemas |
| Se pierden al morir | no, son permanentes | sí, se empieza de cero |
| Dónde se editan | `config/WeaponDefs.js` y `config/MetaDefs.js` | `config/SkillDefs.js` |

El arma define **cómo se juega toda la partida**; las habilidades definen **en qué se convirtió esta partida**.

### Taller y perfil

La pantalla de inicio es también el taller. Ahí se ve la moneda acumulada y el árbol de mejoras **permanentes** del arma marcada: se compran una vez y ya no se pierden. Cada arma tiene su propio árbol, así elegir escopeta o metralleta importa a largo plazo y no solo en el primer minuto:

| Arma | Ramas |
|---|---|
| Pistola | daño · cadencia · alcance · **segundo cañón** (dispara dos balas, carísimo) |
| Escopeta | daño · cadencia · **carga ampliada** (+1 perdigón, hasta 3) · alcance (caro: es su punto débil) |
| Metralleta | **cadencia** (5 niveles) · daño · alcance |

La moneda es lo único que sobrevive a la muerte y sale de una sola fuente: terminar una partida. `tiempo × 1.2 + bajas × 0.6 + bosses × 60`, con un piso de 5. Todo se guarda en `localStorage` bajo `neon-survivors.profile.v1`.

Botón **Borrar perfil** en el taller para empezar de cero.

### Laboratorio de habilidades

Tecla **L** durante el juego. Es una herramienta de diseño, no parte del juego: lista las habilidades, permite subirles y bajarles el nivel en vivo, traer 40 enemigos de prueba y limpiar la arena — para poder decidir qué queda y qué se saca sin jugar veinte minutos ni tocar código. No pausa la partida a propósito: la mitad de lo que hay que evaluar de una habilidad es cómo se ve mientras el juego corre.

| Habilidad | Qué es | nv 1 | nv 5 |
|---|---|---|---|
| **Escudo orbital** | orbes girando, daño por contacto | 2 orbes · 20 dps c/u · radio 2.0 | 5 orbes · 58 dps c/u · radio 2.6 |
| **Campo de fuerza** | área fija pegada al jugador | 10 dps · radio 2.5 | 32 dps · radio 4.2 |
| **Rayo** | golpe puntual sobre el más cercano | 45 cada 3.0s · radio 2.6 (15 dps) | 140 cada 1.8s · radio 3.5 (78 dps) |

## Entry point

**`src/main.js` es el único punto de arranque.** `index.html` carga ese archivo y ningún otro script de juego.

Si algo se rompe, se corrige en el módulo que corresponde. Está prohibido crear archivos `*-fix.js` que parcheen otro módulo desde afuera (GDD_v2 §1) — ese patrón produjo 6 scripts superpuestos en la versión anterior y ninguno resolvió el problema.

## Estructura

```
src/
├── main.js                       entry point único
├── config/GameConfig.js          TODO el balance y tuning vive acá
├── core/
│   ├── Time.js                   deltaTime con clamp
│   ├── InputManager.js           WASD + joystick → un solo vector normalizado
│   └── GameManager.js            escena, luces, loop, estados
├── player/
│   ├── Player.js                 movimiento y orientación
│   ├── SoldierModel.js           el soldado: geometría, rig y marcha
│   ├── SoldierAtlas.js           su textura, generada por código
│   └── CameraController.js       cámara 3ra persona world-locked
├── enemies/
│   ├── EnemyManager.js           la horda entera: datos + InstancedMesh
│   ├── SpatialGrid.js            rejilla espacial, evita el O(n²)
│   ├── WaveManager.js            qué aparece, cuándo y dónde
│   └── BossController.js         aparición y ataques del boss
├── combat/
│   ├── WeaponSystem.js           el arma base: apuntado y disparo
│   ├── ProjectileManager.js      pool de balas + colisión
│   └── ContactDamage.js          daño de la horda al jugador
├── progression/
│   ├── Progression.js            nivel, XP y multiplicadores de la partida
│   └── GemManager.js             gemas de XP con imán
├── skills/SkillSystem.js         las 3 skills, un solo resolutor
├── audio/SoundManager.js        sintetiza y reproduce; presupuesto de voces
├── audio/GameAudio.js           qué suena en cada hecho del frame
├── vfx/ParticleSystem.js        todas las partículas, en un solo draw call
├── vfx/GameVfx.js               qué partículas salen en cada hecho
├── vfx/PostFX.js                bloom + el presupuesto que lo apaga solo
├── core/FrameEvents.js          deduce qué pasó este frame, para audio y VFX
├── meta/PlayerProfile.js         perfil persistente: moneda y mejoras compradas
├── ui/StartMenu.js               perfil, taller y elección del arma base
├── ui/HUD.js                     vida, XP, tiempo, oleada y tu build
├── ui/UpgradeMenu.js             elección de mejora al subir de nivel
├── ui/SkillLab.js                herramienta de diseño para evaluar habilidades (dev)
├── config/EnemyDefs.js           arquetipos de enemigo (el boss es uno más)
├── config/BossDefs.js            comportamiento del boss
├── config/WeaponDefs.js          las 3 armas base
├── config/SkillDefs.js           las habilidades, con sus 5 niveles
├── config/UpgradeDefs.js         mazo de mejoras del menú de nivel (de partida)
├── config/MetaDefs.js            árboles de mejora permanente, uno por arma
├── config/SoundDefs.js           los 16 sonidos, sintetizados (sin archivos)
├── config/VfxDefs.js             las 7 explosiones de partículas
└── perf/PerformanceMonitor.js    panel de diagnóstico técnico (solo dev)
```

`HUD.js` y `PerformanceMonitor.js` están separados a propósito y no comparten datos: uno es información del **juego**, el otro es **diagnóstico**. En la versión anterior estaban mezclados en overlays superpuestos y no se distinguía cuál era cuál.

### Dónde se toca cada cosa

| Quiero… | Archivo |
|---|---|
| Cambiar cómo se siente el movimiento | `config/GameConfig.js` → `PLAYER` |
| Balancear un tipo de enemigo | `config/EnemyDefs.js` (una fila) |
| Cambiar la curva de dificultad | `enemies/WaveManager.js` → `WAVE_STAGES` (una fila) |
| Agregar un tipo de enemigo | `config/EnemyDefs.js` + su peso en `WAVE_STAGES` |
| Balancear un arma base | `config/WeaponDefs.js` (una fila) |
| Cambiar una mejora permanente o su costo | `config/MetaDefs.js` → `META_TREES` (una fila) |
| Cambiar cuánta moneda deja una partida | `config/GameConfig.js` → `META` |
| Balancear o agregar un sonido | `config/SoundDefs.js` (una fila) |
| Balancear o agregar un efecto de partículas | `config/VfxDefs.js` (una fila) |
| Tocar el bloom o su presupuesto | `config/GameConfig.js` → `VFX` |
| Agregar o balancear una skill | `config/SkillDefs.js` (una fila, con sus 5 niveles) |
| Agregar una mejora de estadística | `config/UpgradeDefs.js` → `STAT_UPGRADES` |
| Cambiar el ritmo de subida de nivel | `config/GameConfig.js` → `PROGRESSION.XP_BASE` / `XP_GROWTH` |
| Cambiar cuánto aguanta el jugador | `config/GameConfig.js` → `PLAYER.MAX_HP` / `INVULN_TIME` |

Ninguna de esas cosas requiere tocar lógica de simulación. Ese es el punto.

## Estado

| Parte (GDD_v2 §4) | Estado |
|---|---|
| **A — Core loop, input y movimiento** | ✅ Completa y verificada |
| **B — Player y cámara (animaciones)** | ✅ Completa y verificada |
| **C — Enemigos, spawner, oleadas** | ✅ Completa y verificada |
| **D — Armas y combate** | ✅ Completa y verificada |
| **E — Skills y progresión** | ✅ Completa y verificada |
| **F — Boss** | ✅ Completa y verificada |
| G — UI/HUD/menús | 🟡 Inicio, taller, HUD, menú de nivel y muerte hechos; falta pausa |
| **L — Meta-progresión** (perfil, moneda, mejoras de arma) | ✅ Completa y verificada |
| **H — Audio** | ✅ Completa y verificada |
| **I — VFX / post-processing** | ✅ Completa y verificada |
| J — Pooling y memoria | ⬜ **Siguiente** |
| K — Testing | ⬜ |

### Verificación de la Parte A

Medido en navegador ejecutando el juego real (no estimado). Reproducible desde la consola con `window.game`:

| Criterio | Medición |
|---|---|
| Velocidad ortogonal | 3.614 u en 0.6 s = **6.02 u/s** (config: 6.0) |
| Diagonal vs ortogonal | ratio **1.000** — la diagonal no es más rápida |
| Deslizamiento al soltar la tecla | **0.00000 u** — frenado instantáneo |
| Rendimiento | 60 FPS · 16.7 ms · 4 draw calls · 330 tris |

### Verificación de la Parte B

**El personaje es código, no un asset.** `SoldierModel.js` genera la geometría y `SoldierAtlas.js` pinta la textura en un canvas: no hay `.glb` que versionar, ni pipeline de exportación, ni binarios en el repo. Se tunea editando las medidas del rig.

La animación es **rígida por hueso, sin skinning**. A la altura de cámara del juego (y=9, FOV 55) no se ve un codo doblándose: se ve la silueta. El costo es 1 draw call por hueso; el beneficio es que no hace falta esqueleto exportado. Si alguna vez hay cámara de cerca, se cambia por un GLTF con skinning y `Player.js` no se entera.

| Criterio | Medición |
|---|---|
| Costo | **~13 draw calls** y 7491 triángulos para el jugador entero, con **un solo material** |
| Rendimiento | **60 fps** con 400 enemigos encima, 18 draw calls en total |
| Sin asignaciones | pendiente de heap **37 KB/s** en 10 s de carga máxima (ruido de GC) |
| Marcha | la cadencia sale de la velocidad con zancada fija: **no patina** |
| Frenado | el juego corta en seco, pero la amplitud del ciclo se apaga en ~0.15 s: medido **1 → 0** sin tirón |
| Brazos | IK de dos huesos — las manos siguen al fusil, no al revés |
| Retroceso | `WeaponSystem` llama a `player.recoil()` al disparar; decae solo |
| Golpe | destello `#ff2244` mientras dura la invulnerabilidad, negro al terminar |
| Reinicio | ciclo, amplitud, retroceso y destello vuelven a cero |

**La cámara se acercó un 18%** (`OFFSET` y 11→9, z 9→8) bajándola más de lo que se la acercó, no las dos cosas por igual. Bajarla la inclina hacia el horizonte y eso devuelve por delante lo que el acercamiento quita. Medido a 16:9, unproyectando los bordes de pantalla sobre el suelo:

| Alcance de la vista | Antes | Ahora |
|---|---|---|
| Hacia adelante | 20.4 u | **20.5 u** (igual) |
| Hacia atrás | 6.2 u | 5.2 u |
| A cada lado | 13.7 u | 11.8 u |

Lo que se paga está atrás: un corredor a 5.2 u/s se ve venir por la espalda con **~1 s** de aviso en vez de ~1.2 s. Si se quiere recuperar, el número está en `CONFIG.CAMERA.OFFSET`.

**Movimiento y animación no se pisan.** El modelo se cuelga de un grupo intermedio: la lógica de movimiento escribe posición y rotación en ese grupo, y el modelo anima adentro leyendo solo `currentSpeed` e `isMoving` — valores que el movimiento ya decidió. La animación no vuelve a leer el input ni corrige la posición, que es el acoplamiento que el GDD §1 prohíbe.

**Cómo llegó acá:** estos dos archivos ya existían en `src/player/` desde el 2 de septiembre y **nadie los importaba** — 41 KB de código muerto, exactamente el anti-patrón que documenta el GDD §0.2. Estaban escritos para encajar con `Player.js`, así que conectarlos fue reemplazar `_buildMesh()` y agregar tres llamadas.

### Verificación de la Parte C

Medido con la horda al techo (**400 enemigos**), no con un puñado de prueba.

| Criterio | Medición |
|---|---|
| Rendimiento con 400 enemigos | **60 FPS · 16.7 ms · 5 draw calls · 5130 tris** |
| Draw calls de la horda | **1** (InstancedMesh; con meshes sueltos serían 400) |
| Solapamiento severo (>15%) | **0 pares**, quieto y huyendo |
| Peor solape puntual | 4.8% quieto · 12.1% en movimiento (imperceptible) |
| Crecimiento de heap en 12 s | **−0.03 MB/s** — sin asignaciones por frame |
| Velocidad del jugador con la horda encima | **6.000 u/s** (sin degradar respecto de la Parte A) |
| Integridad tras 427 bajas | 0 colores mal asignados · 0 ids duplicados · 0 vivos sin vida |

El criterio de salida del GDD para esta Parte era "los enemigos no se apilan visualmente unos sobre otros". La primera versión **no lo cumplía**: con 400 enemigos quedaban 73 dentro de un radio de 2 u alrededor del jugador, donde físicamente entran ~14, y se veían cubos atravesándose. La separación sola no alcanza porque la persecución comprime más rápido de lo que ella resuelve; se agregó bloqueo por multitud (`_markBlocked`: si el de adelante me toca, no avanzo) y con eso el solape severo bajó de 221 pares a 0.

### Verificación de la Parte D

El criterio del GDD era "agregar un arma nueva es agregar una entrada a la tabla, no una clase". Hay **7 armas y 2 caminos de código** (`PROJECTILE` y `MELEE`), contra las 8 clases y ~900 líneas de la versión anterior.

DPS real medido contra 40 blancos, con el spawner desactivado para no contaminar la muestra:

| Arma | DPS medido | DPS a un solo blanco | Por qué la diferencia |
|---|---|---|---|
| Pistola | 33 | 33 | un blanco por disparo |
| SMG | 38 | 38 | un blanco por disparo |
| Francotirador | 44 | 34 | atraviesa 4 |
| Escopeta | 105 | 57 | 6 perdigones en abanico |
| Hoja | 194 | 32 | barrido de 110° |
| Martillo | 333 | 35 | barrido de 150° |
| Bomba | 500 | 8 | explosión de 3.4 u |

Las armas de un blanco valen por su daño; las de área valen por a cuántos alcanzan. Eso sale de la tabla, no de código distinto por arma.

| Otros criterios | Medición |
|---|---|
| Carga completa (7 armas, oleada final) | **60 FPS · 8 draw calls · heap plano (+0.04 MB/s en 12 s)** |
| Pool de proyectiles saturado | 900 disparos contra un techo de 600 → **594 aceptados, 306 rechazados, 0 crecimiento** |
| Daño por contacto | **14.9 dps** con 5, 25 y 80 enemigos encima (esperado 14.3) |
| Muerte y reinicio | GAME_OVER congela la horda · **R** restaura todo sin recrear nada |

Acá también apareció un bug de jugabilidad que la Parte C no había detectado, y vale la pena dejarlo escrito: **cuanto más densa era la horda, menos daño hacía** (25 enemigos encima pegaban 2 veces en 12 s). La causa era la regla de bloqueo de la Parte C — usaba "está más cerca del jugador que yo", y entre dos enemigos pegados al jugador uno siempre está un milímetro más cerca, así que se bloqueaban entre sí de costado. Se reemplazó por un cono direccional: bloquea solo quien está literalmente en el camino.

### Verificación de la Parte E

Las mejoras de arma y de skill **no están escritas a mano**: se derivan de `WEAPON_DEFS` y `SKILL_DEFS`. Un arma nueva aparece sola en el menú de nivel sin tocar `UpgradeDefs.js` — escribirlas a mano era la forma más segura de que algún día alguien agregue un arma que nadie pueda conseguir.

| Criterio | Medición |
|---|---|
| La XP no se cobra sola | el enemigo muere a 12 u y la gema **queda en el piso**; se recoge al acercarse |
| Efecto de las mejoras | daño ×1 → **1.30** (2 tomas) · cadencia ×1 → **0.81** · velocidad **+8%** · vida **100 → 125** · imán **2.6 → 4.16** |
| Daño de las skills | Aura **240 dps** sobre 24 blancos (10 dps × 24, exacto) · Rayo **213 dps** · Escudo orbital **74 dps** |
| Varios niveles de golpe | se encolan y se eligen de a uno; el menú reabre solo |
| Reinicio | nivel, mejoras, armas, skills, gemas y estadísticas vuelven a cero |
| `WEAPON_DEFS` tras una partida con mejoras | **intacta** — los multiplicadores viven en `Progression`, la tabla nunca se muta |
| Carga completa (7 armas + 3 skills al máximo, oleada final) | **79 FPS mínimo · 12 draw calls · heap plano** |

Dos decisiones que valen la pena registrar:

- **Multiplicativo, no aditivo, en la cadencia.** Restando 10% seis veces, la séptima mejora dejaría el enfriamiento en cero y el arma dispararía infinitas veces por frame. `×0.9` no llega nunca a cero.
- **El daño de un proyectil se congela al disparar.** Si se leyera al impactar, una bala en vuelo cambiaría de daño al subir de nivel a mitad de camino.

### Verificación de la Parte F

**El boss es un enemigo más, no una clase aparte.** Su arquetipo está en `EnemyDefs.js` junto a los otros tres; solo su comportamiento (embestida, golpe de área, aparición programada) vive en `BossDefs.js` + `BossController.js`. Una clase `Boss` propia habría obligado a enseñarle su existencia al apuntado de las armas, a la colisión de proyectiles, a las tres skills y al daño por contacto — cinco lugares, cinco oportunidades de que el boss quede inmune a algo por olvido. Así, **todo eso funcionó sin escribir una línea nueva**.

| Criterio | Medición |
|---|---|
| Aparición | a los **60 s**, a 22 u del jugador, 5000 HP, radio 2.6 |
| "Limpia la arena" | la basura muere **soltando sus gemas** — el duelo empieza limpio y el jugador cobra lo ganado |
| Spawner durante el duelo | intervalo **×2.5** más lento; vuelve a ×1 al morir el boss |
| Embestida | aviso 0.85 s con velocidad **0** → embestida a **15 u/s** durante 1.0 s → vuelve a 2.3 |
| Golpe de área | anillo en el piso 0.55 s antes, **30 de daño** en radio 5.5, en la posición donde empezó (no sigue al boss) |
| Daño recibido | lo matan las armas y las skills por el camino normal, sin código especial |
| Al morir | barra oculta · spawner normalizado · gema de **120 xp** · próximo a los **180 s con 9000 HP** |
| No lo empuja la horda | `heavy: 1` — la separación no lo mueve y la multitud no lo bloquea |

**Un dato de balance que conviene mirar:** con un arsenal realista del minuto 1 (3 armas + escudo orbital nivel 2, sin mejoras de daño) el jugador hace **~140 dps sobre el boss**, así que los 5000 HP que especifica el GDD v1 son **~36 segundos** de duelo. Es jugable, pero largo para el género. El número quedó como lo especifica el GDD; si se quiere acortar, es `ENEMY_DEFS.BOSS.hp` — entre 2500 y 3000 daría un duelo de 18-21 s.

También apareció acá algo que no era del boss: al reiniciar, la cámara **interpolaba** desde donde moriste hasta el centro de la arena, así que la partida nueva arrancaba mirando el viaje. Ahora `CameraController.snap()` la planta de una.

### Verificación de la Parte L

**Las mejoras permanentes no tocan `WEAPON_DEFS`.** Es la restricción que impone el GDD y la razón es concreta: esa tabla son datos compartidos por todo el juego, y si una partida la mutara, la siguiente arrancaría con los números cambiados sin que nada lo explique. Las compras se traducen a un objeto de modificadores que `WeaponSystem` resuelve **una vez al equipar** y lee en los getters `damageMult` / `cooldownMult` / `range` / `shotCount` — el mismo mecanismo que ya usaban las mejoras de partida.

| Criterio | Medición |
|---|---|
| Compra | escopeta, 2 niveles de carga ampliada: costos **90 → 158**, moneda **1000 → 712** |
| Llega al arma | `shotCount` = **8** perdigones; 16 proyectiles emitidos en 1.1 s (2 disparos a 0.95 s) |
| Se ve antes de jugar | la tarjeta pasa a **10.1 × 8 daño · 85 dps**, calculado, no escrito a mano |
| Se ve mientras jugás | la tarjeta del HUD dice **10.1×8 daño · 0.95s** |
| Persiste | recargar la página conserva moneda, arma y niveles comprados |
| Segundo cañón | 2 balas a **6.0° exactos** de separación — sin ese abanico implícito la mejora más cara del juego salía superpuesta y no se veía |
| Recompensa | `tiempo × 1.2 + bajas × 0.6 + bosses × 60`, piso 5; coincide con la fórmula al decimal |
| Se cobra **una sola vez** | la rama de `GAME_OVER` corre todos los frames; en 900 ms (~54 frames) la moneda no se movió |
| Sin moneda | los 3 botones comprables quedan deshabilitados; el precio se sigue viendo |
| Rama al máximo | "al máximo" en lugar del botón |

**Perfil corrupto no tumba el juego.** `localStorage` devuelve texto que escribió una versión anterior o alguien con la consola abierta, así que se trata como dato sucio. Probado con: JSON inválido, `null`, un arreglo, moneda negativa, nivel 99 en una rama de máximo 5, una rama que no existe, un arma inventada, sin `localStorage`, y un storage que tira excepción al leer **y al escribir**. Los nueve casos arrancan un perfil válido; ninguno lanza.

**Un bug que la recompensa hizo visible:** `EnemyManager.clear()` no reiniciaba `killCount`, así que las bajas se arrastraban de una partida a la siguiente. Mientras el número solo se mostraba en el HUD era un detalle feo; desde que la recompensa se calcula con él, reintentar sin cerrar la pestaña **pagaba de más cada vez**. Dos partidas idénticas ahora pagan idéntico.

### Verificación de la Parte H

**Ningún sistema del juego sabe que el audio existe.** No hay un `sound.play()` desperdigado por el arma, la horda y el boss: `GameAudio` mira el estado que esos sistemas ya publican y deduce qué pasó comparándolo con el frame anterior. Disparaste si el contador de disparos subió; te pegaron si la invulnerabilidad pasó de cero a algo. Así el audio no es una dependencia de la simulación, no hay que pasarlo por seis constructores, y silenciarlo es borrar una línea del loop.

El precio es real y está anotado: no se puede sonar algo que el estado no cuenta. Para el impacto de bala hubo que **publicar** `ProjectileManager.hitCount` — no espiar una variable privada.

**Sin archivos de audio.** Los 16 sonidos son recetas de osciladores y ruido en `SoundDefs.js`: cero descargas, cero licencias, y balancear el audio es editar números en una tabla.

| Criterio | Medición |
|---|---|
| Los 16 suenan | señal medida con un `AnalyserNode` colgado del master: los 16 dan RMS > 0 |
| Jerarquía de la mezcla | muerte 0.35 · golpe recibido 0.22 · golpe del boss 0.34 **contra** pistola 0.038 y metralleta 0.022 — lo que te mata se escucha ~6-10× por encima de lo que disparás |
| Desbloqueo | el `AudioContext` es `null` hasta el primer gesto; con un clic real pasa a `running` |
| Limitador | 400 pedidos del mismo sonido en un frame → **suena 1** |
| Presupuesto de voces | con 20 voces de prioridad alta ocupando el tope, un sonido flojo se **rechaza** y el golpe del boss **entra** |
| En partida real | 400 enemigos + metralleta: **60 fps**, pico de **4 voces** simultáneas de 20 posibles |
| Disparo múltiple | la escopeta emite 6 proyectiles y suena **una** vez |
| Duelo con boss | aparición, aviso, embestida y golpe de área sonaron los cuatro, en orden |
| Silencio | la tecla M y el botón del taller lo alternan, y **sobrevive a recargar** la página |

**Por qué hay tope de voces Y intervalo mínimo, si con uno alcanzaría:** el intervalo es el que hace el trabajo (pico de 4 voces en la peor carga medida), el tope es la red por si una combinación futura de sonidos lo esquiva. Es el mismo razonamiento que el pool de proyectiles: el pico de coste no puede llegar justo en el peor momento del juego.

**Cambio de control:** la tecla de volver al taller tras morir pasó de **M** a **T**, porque M es la convención universal para silenciar y silenciar tiene que funcionar en cualquier estado.

### Verificación de la Parte I

**El presupuesto se escribió antes de encender nada**, como pide el GDD: objetivo 60 fps con 400 enemigos, techo de 3 ms por frame para el post-procesado, y piso de 45 fps sostenidos durante 4 segundos. Está en `CONFIG.VFX` y **se hace cumplir solo**.

| Criterio | Medición |
|---|---|
| Carga máxima | 400 enemigos con bloom: **60 fps**, mínimo 60, 33 draw calls |
| Coste del bloom | pico de **2.8 ms** contra un techo de 3.0 |
| Degradación automática | con el piso puesto por encima del fps real, el bloom se apagó a los **4.3 s** (umbral 4), tiró el composer y avisó por consola |
| Y no vuelve solo | `setEnabled(true)` es rechazado después de degradar; solo la tecla B lo revive, porque eso es una decisión tuya |
| Con el bloom apagado | 33 → **21 draw calls** y coste 0: no queda un composer copiando la pantalla al pedo |
| Pool de partículas | 400 muertes el mismo frame piden 2800 partículas: **896 vivas** (tope 900), **1904 descartadas**, 60 fps constantes |
| Y se vacía | vuelve a 0 en menos de 1.5 s, sin acumular |
| Sin asignaciones | pendiente de heap **negativa** en 12 s de carga máxima |

**Por qué el pool descarta en vez de crecer.** Es la misma decisión que en las balas: un pool elástico pide memoria justo cuando hay 400 enemigos muriendo, que es el único momento en que el juego no puede permitirse una pausa por recolección de basura. Las partículas son decoración — que falten 1904 en el frame más caótico del juego no se nota; un tirón sí.

**`FrameEvents`: la deducción se hace una sola vez.** El audio y las partículas necesitan exactamente los mismos hechos. Si cada uno comparara el estado por su cuenta, las dos copias se irían separando y terminaría habiendo un chispazo sin sonido, o al revés. Ahora hay un solo lugar que deduce y dos que leen. Fue también el momento de reescribir `GameAudio`, que había nacido con la deducción adentro.

**Un bug encontrado y corregido en el camino:** con el post-procesado, `renderer.info.render.calls` se reinicia en cada pase, así que el panel de diagnóstico marcaba **1 draw call** con la escena entera dibujada. Ahora el contador se reinicia una vez por frame a mano (`info.autoReset = false`) y el número vuelve a ser cierto.

## Decisiones abiertas

Ya no queda ninguna decisión abierta de `GDD_v2.md` §6. Las dos que había se cerraron:

- **§6.1 Estilo visual**: **resuelta a favor del neón oscuro.** En un survivor la legibilidad manda, y sobre piso oscuro un objeto brillante se lee solo; el bloom de la Parte I convierte eso en luz, mientras que sobre fondo claro solo lavaría la imagen. Además es lo que el juego ya era: la paleta de armas, las gemas, la grilla y el HUD están construidos así.
- **§6.3 Personaje**: **resuelta.** El jugador es un soldado procedural generado por código (ver "Verificación de la Parte B"). No hay `.glb` que versionar. Si algún día hace falta una cámara de cerca, se reemplaza por un GLTF con skinning sin tocar `Player.js`.
