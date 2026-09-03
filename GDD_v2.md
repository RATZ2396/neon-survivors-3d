# 🎮 GDD v2.0 — Neon Survivors 3D (rediseño técnico)

**Basado en:** la v1.0 (`GDD.md`) y el código real de este repo, auditado línea por línea antes de escribir este documento.
**Objetivo de este documento:** no es solo describir el juego — es dividir el rediseño en partes independientes con interfaces claras, para que cada una se pueda asignar como una tarea separada sin que una pise el trabajo de otra.

---

## 0. Diagnóstico honesto del estado actual

Esto no está en el `GDD.md` original ni en `PROYECTO_COMPLETO.md`, pero es la base real sobre la que hay que construir. Verificado leyendo `index.html` y contando líneas de `src/`, no asumido.

### 0.1 Lo único que realmente corre hoy

```
index.html
 ├── src/main-working.js          → hace import() de main.js con try/catch
 │    └── src/main.js             → 2528 líneas. TODO el juego vive acá:
 │                                    Time, InputManager, MenuManager, SoundManager,
 │                                    UIManager, Particle(System), ExperienceGem,
 │                                    Projectile, Weapon, Skill/OrbitalShield/
 │                                    ThunderStrike, SkillManager, Player, Enemy,
 │                                    Boss, WaveManager, EnemySpawner,
 │                                    CameraController, GameManager
 └── src/definitive-movement-fix.js → monkey-patch aplicado encima de Player/Input
                                        en runtime (reasigna funciones ya cargadas)
```

Eso es todo. Dos scripts, y el segundo parchea al primero desde afuera.

### 0.2 Lo que NO está conectado (código muerto, a pesar de lo que dicen los docs)

`src/core/`, `src/entities/`, `src/managers/`, `src/player/`, `src/enemies/`, `src/systems/`, `src/utils/`, `src/pools/`, `src/integration/` — unas **60 clases, ~9500 líneas** — son una segunda implementación en paralelo del mismo juego, más "empresarial" (ObjectPool, MemoryManager, ErrorHandler, Vector3Pool, TestFramework, FrustumCullingManager, PerformanceProfiler, AutoCleanupManager, AssetLoader, GameConfig centralizado). **`ERROR_RESOLUTION.md` confirma que `GameIntegration.js` (el archivo que debía unir todo esto) está roto y deshabilitado.** Resultado: todo ese código nunca se ejecuta. Las afirmaciones de `PROYECTO_COMPLETO.md` ("+40% FPS", "-50% memoria", "0% memory leaks", "producción ready") no están midiendo el juego real — no se puede medir algo que no corre.

**Conclusión:** no hay dos versiones, una vieja y una nueva mejor. Hay **una versión que funciona** (el monolito parcheado) y **una versión que no se puede ejecutar** (la arquitectura modular). Cualquier plan que asuma que "ya tenemos pooling/memory management/testing" está partiendo de un supuesto falso.

### 0.3 El patrón que hay que cortar de raíz

Seis archivos, mismo bug, mismo síntoma ("el personaje se desliza / la animación no sincroniza"), cada uno declarándose "definitivo":

| Archivo | Líneas | Se sigue cargando? |
|---|---|---|
| `movement-fix.js` | 166 | No |
| `movement-precision-fix.js` | 209 | No |
| `definitive-movement-fix.js` | 212 | **Sí** |
| `hard-movement-reset.js` | 174 | No |
| `animation-sync-fix.js` | 232 | No |
| `movement-analyzer.js` | 289 | No |

Todos hacen lo mismo: reasignan `player.handleMovement`, `inputManager.getMovementVector`, etc. desde afuera del archivo original en vez de editar la fuente. El síntoma nunca se resolvió limpiamente — se tapó cinco veces. Esto es el riesgo técnico más grande del proyecto, más que cualquier feature faltante: si el patrón se repite, en dos meses hay veinte archivos `*-fix.js` y nadie sabe cuál manda.

### 0.4 Contradicción de identidad visual

- `GDD.md` §1: *"Estilo Visual: Daylight Survival (Bright Sky, Green Grass, High Visibility)"*.
- `index.html` real: fondo `#000`, título "Neon Survivor" en cyan con glow, fuente Orbitron, estética neón oscura.

El documento y el juego no describen la misma cosa. Esto se resuelve en §6 (decisión abierta), no se asume.

### 0.5 Activos reales y reutilizables (esto sí es un activo, no una promesa)

`public/models/Character.glb`, `Idle.glb`, `Run.glb` + decoder Draco. Hay un personaje modelado y animado de verdad. Se conserva y es la base de la Parte B.

`src/config/GameConfig.js` (nunca ejecutado, pero con números de balance razonables: HP jugador 100, enemigos Normal/Runner/Tank con HP 30/15/80, armas Pistol/Shotgun/Sniper) — se recicla como punto de partida numérico para el rebalanceo, no como código a "reconectar".

---

## 1. Reglas nuevas (no negociables, nacen de la sección 0)

1. **Prohibido crear un archivo `*-fix.js`.** Si algo está roto, se edita el archivo original y se borra cualquier intento anterior sobre el mismo problema. Un bug, un commit que lo cierra.
2. **Un solo entry point.** `main-new.js`, `main-optimized.js`, `main-fallback.js` se borran una vez migrado lo que valga la pena. Al final debe quedar un `main.js` (o `main.ts`) que sea el único punto de arranque, y `index.html` con un solo `<script>` de juego.
3. **No se documenta un sistema como "implementado" si no está importado desde el entry point real.** Grep del import antes de escribir el checkmark.
4. **Cada Parte de la sección 4 es una unidad de trabajo con entrada/salida definida** — pensada para asignarse por separado (a otra sesión, a otra persona) sin coordinación constante con las demás.

---

## 2. Visión y pilares de diseño (heredados de v1.0, sin tocar lo que ya funcionaba como diseño)

| Aspecto | Descripción |
|---|---|
| **Género** | Survivor / Roguelite / Bullet Heaven |
| **Inspiración** | Vampire Survivors, Yet Another Zombie Survivors |
| **Motor** | Three.js (WebGL), vanilla — sin framework de UI sobre el canvas |
| **Plataformas** | PC (WASD) + Móvil (joystick virtual vía nipplejs) |
| **Loop central** | Sobrevivir oleadas, recolectar XP, subir de nivel eligiendo mejoras, derrotar al boss "The Cube King" a los 60s |
| **Personaje** | Humanoide con modelo GLTF real (Character.glb) + animaciones Idle/Run |

**Estilo visual: pendiente de decisión del usuario** — ver §6.1. Este documento no elige entre "daylight brillante" y "neón oscuro" porque es una decisión de dirección de arte, no técnica.

---

## 3. Arquitectura técnica objetivo

Reemplaza el monolito de 2528 líneas por módulos ES reales con **una sola fuente de verdad por sistema** (nada de una clase en `main.js` y otra copia distinta en `src/entities/`).

```
src/
├── main.js                  ← único entry point
├── core/
│   ├── Time.js               deltaTime, clamp de tab en background
│   ├── GameManager.js        estados MENU/PLAYING/PAUSED/GAME_OVER/VICTORY
│   └── InputManager.js       WASD + nipplejs unificados, vector normalizado
├── player/
│   ├── Player.js             movimiento, HP, XP, referencia a arma/skills activos
│   └── CameraController.js
├── entities/
│   ├── Enemy.js  Boss.js  Projectile.js  ExperienceGem.js
├── weapons/                  data-driven: WEAPON_DEFS + un resolver, no una
│   └── weapons.js            clase por arma con lógica duplicada (ver Parte D)
├── skills/
│   └── skills.js             mismo criterio data-driven que weapons
├── managers/
│   ├── EnemySpawner.js  WaveManager.js  ParticleSystem.js  SoundManager.js
├── ui/
│   ├── UIManager.js  MenuManager.js  FloatingTextManager.js
├── perf/
│   ├── ObjectPool.js          genérico, usado de verdad por Projectile y Particle
│   └── PerformanceMonitor.js  FPS/heap, visible solo en dev
└── config/
    └── GameConfig.js          única fuente de balance (HP, daño, velocidades, pesos de spawn)
```

**Regla de dependencias:** `entities/`, `weapons/`, `skills/` no importan de `ui/`. `ui/` no llama funciones de simulación directamente, solo lee estado publicado. Esto es lo que permite que dos personas toquen combate y HUD el mismo día sin pisarse.

---

## 4. Partes asignables

Cada una tiene: qué se hace, de qué depende, cuándo se considera terminada. Pensadas para delegar.

### Parte A — Core Loop, Input y Movimiento *(bloqueante, va primero)*

- Reescribir `Time`, `InputManager` y `Player.handleMovement()` **una sola vez**, en su archivo fuente.
- Decidir por escrito el modelo de movimiento (¿velocidad constante sin inercia, tipo arcade — que es lo que los 6 fixes intentaban lograr — o aceleración/fricción con constantes explícitas?) y dejarlo como comentario de diseño, no como "hasta que se sienta bien".
- Borrar los 6 archivos `*-fix.js` y sus referencias en `index.html` una vez migrada la lógica válida a la fuente.
- **Hecho cuando:** WASD y joystick mueven al jugador a la misma velocidad en las 8 direcciones, frenado y arranque se comportan como se documentó (no "se ve bien"), y `index.html` carga un solo script de juego.

### Parte B — Player y Cámara

- `Player.js` como clase única (sin monkey-patch externo).
- Animaciones Idle/Run ligadas a la velocidad real del personaje (no forzadas a pesos binarios 0/1 como hace `definitive-movement-fix.js` — eso es lo que le da el aspecto "tosco").
- `CameraController.js`: definir una sola vez si sigue con lerp suave o con snap directo (los fixes fueron y vinieron entre ambos sin decidirse).
- **Depende de:** Parte A.
- **Hecho cuando:** el personaje gira/anima de forma consistente con su velocidad real en cualquier fps, sin overlays de debug de colores en pantalla.

### Parte C — Enemigos, Spawner y Oleadas

- `Enemy.js`, `EnemySpawner.js`, `WaveManager.js`.
- Con el conteo de enemigos que maneja este juego, evaluar si conviene una rejilla espacial simple para separación/colisión (mismo patrón de `distanceToSquared` sin raíces cuadradas innecesarias).
- **Depende de:** Parte A (necesita `playerPosition`).
- **Hecho cuando:** oleadas escalan según `WaveManager`, enemigos no se apilan visualmente unos sobre otros.

### Parte D — Armas y Combate

> **REVISADO — decisión de diseño posterior a la primera versión de este documento.**
> Esta Parte se implementó según el modelo nuevo, no según el texto original que queda más abajo:
>
> - **Hay tres armas base: pistola, escopeta y metralleta.** Nada más. Las otras cuatro (francotirador, bomba, martillo, hoja) se eliminaron, junto con el resolutor de cuerpo a cuerpo que solo ellas usaban.
> - **El arma se elige ANTES de la partida**, en la pantalla de inicio, y no cambia durante el run. Es la identidad del perfil: define cómo se juega toda la partida.
> - **Las armas NO se consiguen subiendo de nivel.** Lo que se elige al subir de nivel son habilidades y estadísticas (Parte E). Esto separa limpio las dos progresiones: el arma es una decisión previa y de largo plazo, las habilidades son la decisión de esta partida.
> - **Las armas se mejoran fuera de la partida**, con la recompensa acumulada entre runs. Eso es la **Parte L**, que no existía en la primera versión de este documento.
>
> El texto original queda como registro de por qué el código quedó como quedó: la tabla data-driven y el pooling de proyectiles siguen siendo válidos y son lo que permitió recortar de siete armas a tres tocando una sola tabla.


- Migrar `Weapon.js` + 8 subclases (`PistolWeapon`, `ShotgunWeapon`, `SniperWeapon`, `DualSMGWeapon`, `Laser`, `AreaBomb`, `MeleeWeapon`, `HammerWeapon` — hoy ~900 líneas repartidas con lógica duplicada) a un registro data-driven: una tabla `WEAPON_DEFS` + un único resolver de disparo/daño/targeting, en vez de una clase por arma.
- `Projectile.js` con pooling real (usar `ObjectPool`, no crear/destruir por disparo).
- **Depende de:** Parte C (necesita lista de enemigos y targeting).
- **Hecho cuando:** agregar un arma nueva es agregar una entrada a la tabla, no una clase.

### Parte E — Skills y Progresión

- `Skill.js`, `OrbitalShield`, `ThunderStrike`, `WarCrySkill`, `TurretSkill`, `GrenadeSkill`, `SkillManager`.
- Sistema de nivel/XP/menú de mejoras (4 opciones aleatorias al subir de nivel, ya funciona conceptualmente en v1 — se migra, no se rediseña).
- **Depende de:** Parte D (las skills interactúan con el sistema de daño).

### Parte F — Boss y eventos especiales

- `Boss.js`: "The Cube King", 5000 HP, aparece a los 60s, limpia la arena, reduce el spawn rate durante el duelo.
- **Depende de:** Partes C y D.

### Parte G — UI/HUD/Menús

- `UIManager.js`, `MenuManager.js`, `FloatingTextManager.js`.
- **Acá se resuelve la contradicción visual de §0.4** una vez que el usuario decida en §6.1.
- **Depende de:** ninguna otra Parte de simulación — puede avanzar en paralelo desde el día 1 con datos mock.

### Parte H — Audio

- `SoundManager.js` (WebAudio sintetizado, sin archivos de sonido). Conceptualmente ya está bien resuelto en v1 — se migra y se limpia, no se rediseña.
- **Depende de:** nada. Paralelizable desde el día 1.

### Parte I — VFX y Post-processing

- `ParticleSystem.js`, `UnrealBloomPass`.
- Vigilar costo en GPU integrada: bloom + partículas sin pooling fue exactamente el tipo de decisión que en el otro prototipo (`ARCHITECTURE.md`) identificamos como caro en hardware modesto. Acá si hay presupuesto de rendimiento, definirlo por escrito antes de activar post-processing.
- **Depende de:** Parte D (necesita eventos de impacto/muerte).

### Parte J — Performance, Pooling y Memoria

- Acá es donde `ObjectPool`, `ProjectilePool`, `ParticlePool` se **conectan de verdad** al juego que corre (no a un `GameIntegration.js` roto).
- `PerformanceMonitor` simple (FPS + heap), visible solo en dev, sin overlays de colores compitiendo entre sí.
- Cualquier métrica que se documente acá debe venir de una captura real del profiler, no de una estimación.
- **Depende de:** que Partes A-D ya usen las estructuras que este sistema va a pooling.

### Parte K — Testing y QA

- `TestFramework.js` ya existe (291 líneas) pero no corre en ningún lado automatizado. Conectarlo a un script `npm test` real.
- **Depende de:** que los sistemas a testear ya estén migrados (no tiene sentido testear el monolito viejo).


### Parte L — Meta-progresión (perfil, recompensa y mejoras permanentes)

*Parte nueva: no estaba en la primera versión de este documento. Nace de la decisión de diseño registrada en la Parte D.*

- **Perfil del jugador**, persistido en `localStorage`: arma preferida, moneda acumulada y nivel de mejora de cada arma base.
- **Recompensa por partida**: la partida termina y otorga moneda en función de tiempo sobrevivido, bajas y bosses derrotados. Es la única fuente de moneda.
- **Mejoras permanentes por arma**, compradas entre partidas: daño, cadencia, alcance, cantidad de proyectiles. Cada arma base tiene su propio árbol, así elegir escopeta o metralleta importa a largo plazo y no solo en el run.
- **Restricción de arquitectura:** las mejoras permanentes NO pueden mutar `WEAPON_DEFS` — esa tabla son datos compartidos. Tienen que entrar por el mismo mecanismo que ya usan las mejoras de partida: multiplicadores en un objeto de estado (hoy `Progression.stats`). Si una partida muta la tabla, la siguiente arranca con los números cambiados.
- **Depende de:** Partes D y E (necesita el arma elegible y el sistema de multiplicadores que ya existe).
- **Hecho cuando:** cerrar el navegador y volver conserva la moneda y las mejoras compradas, y dos perfiles con la misma arma pero distinto nivel de mejora se sienten distintos.
- **Estado: hecha y verificada.** Ver README, "Verificación de la Parte L".


## 5. Checklist anti-regresión (repetir en cada sesión de trabajo)

- [ ] ¿Estoy por crear un archivo `*-fix.js` o similar? → Parar. Editar la fuente.
- [ ] ¿El archivo que estoy tocando está importado desde `main.js`? Si no, no es el juego real.
- [ ] ¿Este doc de progreso incluye una forma reproducible de verificar lo que dice ("abrí el juego, hice X, vi Y"), o solo afirma que algo mejoró?
- [ ] ¿Quedó más de un archivo resolviendo el mismo problema? Borrar el/los viejo(s) en el mismo commit.

---

## 6. Decisiones abiertas que necesito que definas

### 6.1 Estilo visual definitivo
"Daylight brillante" (como dice `GDD.md` v1) vs. "neón oscuro" (como está el `index.html` real hoy). Son direcciones de arte casi opuestas y afectan iluminación, paleta, post-processing y hasta el tono del audio.

### 6.2 Qué hacer con la arquitectura modular no conectada
`src/core/`, `src/entities/`, `src/managers/`, etc. (~9500 líneas muertas) — ¿se descartan y la Parte correspondiente se escribe desde cero siguiendo §3, o vale la pena revisar archivo por archivo por si hay lógica rescatable antes de borrar?

### 6.3 Personaje: GLTF animado vs. placeholder — RESUELTA
Ya existe `Character.glb` + `Idle.glb` + `Run.glb` con Draco. ¿Se mantiene el personaje humanoide con skinning, o —dado lo que vimos en el prototipo anterior sobre el costo de animación por esqueleto a escala— se simplifica el *enemigo* (no el jugador, que es uno solo) a algo sin skinning para poder escalar la horda?

**Resuelta: ninguna de las dos.** El jugador es un soldado **generado por código** (`SoldierModel.js` + `SoldierAtlas.js`), sin `.glb` y sin skinning: cada hueso es un mesh rígido. Cuesta ~13 draw calls y un material. La horda no cambia y sigue costando 1 draw call para 400 enemigos. Si aparece una cámara de cerca donde se note la falta de deformación, se reemplaza por un GLTF con skinning sin tocar `Player.js`.

### 6.4 Orden de trabajo
Recomiendo A → B → C → D como núcleo jugable mínimo (sin esto no hay juego que probar), con G y H en paralelo desde el día 1 porque no dependen de nada. E, F, I, J, K vienen después del núcleo.

---

*Documento generado a partir de auditoría real del código en `E:\PROYECTOS\Juegos\Proyecto I\`, no de los docs de progreso previos.*
*GDD original: `GDD.md`. Este documento no lo reemplaza — lo corrige y lo reorganiza para ejecución.*
