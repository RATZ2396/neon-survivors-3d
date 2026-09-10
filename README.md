# RTZBLOOD

Survivor de hordas en 3D, hecho para la web. Se jugaba como **Neon
Survivors 3D** hasta que tomó su nombre definitivo.

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
| **Esc** o **P** | pausar / seguir |
| **M** | silenciar / restaurar el sonido (se recuerda en el perfil) |
| **B** | encender / apagar el bloom, para comparar |
| **Rueda del mouse** | acercar o alejar la cámara (0.35× a 1.8×) |
| **R** / **T** tras morir | reintentar con la misma arma / volver al taller |

La barra de abajo es **tu build**: el arma elegida (con su recarga) y las habilidades que fuiste consiguiendo, con su nivel. El panel de arriba a la izquierda es diagnóstico técnico (FPS, memoria, draw calls) y se apaga con `CONFIG.DEV.SHOW_DEBUG_PANEL`.

## Modelo de armas y habilidades

Son dos progresiones distintas y no se mezclan:

| | Arma base | Habilidades |
|---|---|---|
| Cuáles | pistola · escopeta · metralleta | 5 de base + 3 propias del arma |
| Cuándo se elige | **antes** de la partida, en la pantalla de inicio | **durante** la partida, al subir de nivel |
| Cuántas por partida | una sola, no cambia | 8 al alcance, **hasta 4** equipadas, subibles a nivel 5 |
| Cómo se mejoran | **fuera** de la partida, en el taller, con la moneda ganada | **dentro** de la partida, con la XP de las gemas |
| Se pierden al morir | no, son permanentes | sí, se empieza de cero |
| Dónde se editan | `config/WeaponDefs.js` y `config/MetaDefs.js` | `config/SkillDefs.js` |

El arma define **cómo se juega toda la partida**; las habilidades definen **en qué se convirtió esta partida**.

### Un personaje = su arma, para siempre

No hay arsenal: el arma elegida es la única de la partida. La profundidad sale de las habilidades, y por eso hay **dos familias**:

- **Base compartida (5).** Las ve cualquier personaje: sierras, rayo, escarcha, señuelo y guadaña.
- **Propias del arma (3 por arma).** Solo aparecen en el menú de nivel si estás jugando con esa arma. La diferencia en la tabla es una sola clave: `weapon: 'SHOTGUN'`.

Con 8 al alcance y un techo de 4 equipadas, **nunca las tenés todas**: elegir sigue costando algo.

Hubo una cuarta de base, el **Dron** —acompañantes que disparaban solos—, y se sacó justamente por la regla de arriba: un acompañante que dispara por su cuenta es una segunda arma con otro nombre.

Las propias del arma no hacen daño por su cuenta — cambian **qué balas salen**. Viven en `kind: WEAPON` y publican modificadores en `combat/WeaponMods.js`, un objeto que escribe `SkillSystem` y leen `WeaponSystem` (qué se dispara) y `ProjectileManager` (qué hace cada bala al pegar). Misma regla de siempre: `WEAPON_DEFS` no se muta nunca.

### Taller y perfil

La pantalla de inicio es también el taller. Ahí se ve la moneda acumulada y el árbol de mejoras **permanentes** del arma marcada: se compran una vez y ya no se pierden. Cada arma tiene su propio árbol, así elegir escopeta o metralleta importa a largo plazo y no solo en el primer minuto:

| Arma | Ramas |
|---|---|
| Pistola | daño · cadencia · alcance · **segundo cañón** (dispara dos balas, carísimo) |
| Escopeta | daño · cadencia · **carga ampliada** (+1 perdigón, hasta 3) · alcance (caro: es su punto débil) |
| Metralleta | **cadencia** (5 niveles) · daño · alcance |

La moneda es lo único que sobrevive a la muerte. **Sale del piso**: cada enemigo suelta una al morir y hay que ir a juntarla, igual que la gema de XP. Al terminar se cobra `tiempo × 1.2 + moneda juntada`, con un piso de 5. Todo se guarda en `localStorage` bajo `rtzblood.profile.v1`. Al renombrar el
juego se dejó una mudanza: si no hay perfil nuevo se lee el de la clave
vieja y se reescribe bajo la nueva, así nadie pierde la moneda que ya tenía.

Antes la fórmula pagaba `bajas × 0.6 + bosses × 60` al terminar: plata que llegaba sola por matar. Ahora matar deja algo **en el lugar donde estaba el peligro**, y lo que dejás tirado no se cobra. El tiempo sobrevivido es lo único que se sigue pagando sin juntarlo.

Botón **Borrar perfil** en el taller para empezar de cero.

### Lo que se junta del piso

Cuatro cosas, un solo sistema (`progression/PickupManager.js`), y la clave que las parte en dos es `loot` en `config/PickupDefs.js`:

| | Qué es | De dónde sale | ¿Lo atrae el imán normal? |
|---|---|---|---|
| **Gema** | experiencia | la suelta cada enemigo | sí |
| **Moneda** | la del taller | la suelta cada enemigo | sí |
| **Corazón** | cura 35 | aparece solo en el mapa | no, hay que ir |
| **Imán** | atrae TODO por 2.5s | aparece solo en el mapa | no, hay que ir |

La diferencia no es cosmética. La gema y la moneda son la recompensa de matar: si te las atrajera todo el mapa no tendrías que moverte, y moverte a buscarlas **es** el juego. El corazón y el imán son lo contrario — una razón para ir a un lugar puntual, decidida por el mapa y no por vos. Aparecen cada 26 s a entre 9 y 24 unidades tuyas, con un tope de 3 a la vez: si no vas, el mapa deja de ofrecerte.

El imán agarrado es la única excepción a todo eso: mientras dura, arrastra hasta lo que normalmente no se mueve.

También desapareció la mejora **`Imán`** del menú de nivel (+60% de radio, permanente). Dos cosas con el mismo nombre haciendo lo mismo —una gratis y para siempre, la otra buscada y temporal— y la permanente le comía el sentido a la otra. El radio base subió de 2.6 a 3.4 para compensar la que ya no está.

### Laboratorio de habilidades

Tecla **L** durante el juego. Es una herramienta de diseño, no parte del juego: lista las habilidades, permite subirles y bajarles el nivel en vivo, traer 40 enemigos de prueba y limpiar la arena — para poder decidir qué queda y qué se saca sin jugar veinte minutos ni tocar código. No pausa la partida a propósito: la mitad de lo que hay que evaluar de una habilidad es cómo se ve mientras el juego corre.

El laboratorio muestra **todas**, incluidas las de armas que no tenés equipadas: poder comparar es el punto de la herramienta. El filtro por arma es una regla del juego y vive en `UpgradeDefs`, que es donde corresponde.

**Base — las ve cualquier personaje**

| Habilidad | Qué es | nv 1 | nv 5 |
|---|---|---|---|
| **Sierras** | discos girando, daño por contacto | 2 sierras · 20 dps c/u · radio 2.0 | 5 sierras · 58 dps c/u · radio 2.6 |
| **Rayo** | golpe puntual sobre el más cercano | 45 cada 3.0s · radio 2.6 (15 dps) | 140 cada 1.8s · radio 3.5 (78 dps) |
| **Escarcha** | campo pegado a vos: **frena** y desgasta | radio 3.6 · velocidad ×0.75 · 8 dps | radio 5.4 · velocidad ×0.45 · 26 dps |
| **Señuelo** | un cebo que la horda persigue en vez de a vos | cada 9s · dura 2.5s · radio 7 | cada 5.5s · dura 4.5s · radio 11 |
| **Guadaña** | tajo en cono hacia donde **caminás** | 40 cada 2.6s · radio 4.5 · cono 100° | 125 cada 1.8s · radio 6.5 · cono 120° |

**Propias del arma — solo con ella**

| Arma | Habilidad | Qué hace |
|---|---|---|
| Pistola | **Rebote** | agotada la penetración, la bala salta al siguiente (hasta 3 saltos) |
| Pistola | **Perforación total** | atraviesa a los que frenan balas — tanque y boss |
| Pistola | **Dual** | dos pistolas alternadas al mismo blanco: media recarga, la izquierda al 45-80% |
| Escopeta | **Muro** | los perdigones dejan de abrirse: salen en paralelo, hombro con hombro |
| Escopeta | **Racimo** | cada perdigón revienta pasado el 60% del vuelo y se abre en crías |
| Escopeta | **Doble cañón** | ráfaga de 2-3 andanadas, cada una corrida a un lado: barre en vez de apilarse |
| Metralleta | **Calentamiento** | disparando seguido, la recarga baja hasta -42% |
| Metralleta | **Doble línea** | balas paralelas al costado, no abanico |
| Metralleta | **Bala explosiva** | cada 6-12 balas, una estalla al impactar |

**Las tres de la escopeta cambian el DIBUJO del disparo**, que es lo que se ve
desde arriba. Un abanico se despeina con la distancia —a 13 unidades, los 34°
del arma son casi 8 de ancho y los perdigones llegan sueltos—, así que cada una
ataca esa forma por un lado distinto: **Muro** la endereza y la pared mide lo
mismo a 1 que a 13; **Racimo** le agrega una segunda mitad, porque revienta
pasado el 60% del vuelo y encima te sigue pegando entero; **Doble cañón** corre
cada andanada de la ráfaga a un lado, y a nivel 5 cubre casi 80° de frente.

Ninguna le regala alcance. Ser inútil de lejos es la descripción de la escopeta,
no su bug.

Hubo una cuarta, **Impacto**, que empujaba con cada perdigón, y se borró junto
con el modificador `knockback` y el `_knockback()` del pool: sin ella no quedaba
nadie que los escribiera. La condenó lo mismo que a Onda expansiva — el empuje
**no mueve a los `heavy`** (las élites y el Cazador, siete en total), o sea que
su rasgo distintivo no le hacía nada a ninguna de las cosas que te matan. Y ese
techo era a propósito: si un jefe retrocediera con cada golpe, la pelea se
ganaría quedándose quieto.

Eso también fue lo que se llevó puesta a **Onda expansiva**, que era la tercera
base: su rasgo distintivo era el empuje, y el empuje no le hacía nada a ninguna
de las siete cosas que te matan. La reemplazó **Escarcha**, que frena en vez de
empujar — y frenar sí les funciona. Junto con **Señuelo**, son las dos únicas
cartas del juego que le hacen algo a un minijefe además de daño.

**Ninguna de las dos toca al enemigo.** Publican geometría —un punto y un radio—
que consume la persecución de la horda (`EnemyManager.slowZones` y `.lure`), y
esa es la decisión que las hace correctas: el swap-remove mueve los índices en
cuanto muere cualquiera, así que una marca por enemigo terminaría frenando o
desviando al que ocupó el hueco. Una zona no puede equivocarse de enemigo.

La pistola y la escopeta tenían una tercera —**Cañón trasero** y **Abanico trasero**— que repetía la andanada 180° hacia atrás. Se borraron: ver el escuadrón, abajo. El de la pistola lo tapó **Dual**, y el de la escopeta, **Muro** y **Racimo**. **Los tres personajes tienen ahora tres propias.**

**Dual es la única que no cambia la bala: cambia el arma.** Desenfundás la
segunda pistola y se turnan. La recarga se parte al medio —de 0.42 a 0.21— y
cada gatillazo sale de una mano distinta, así que **cada mano conserva exacta la
cadencia de la tabla**: la derecha dispara igual que sin la habilidad, y lo que
se compra es la izquierda, que pega entre el 45% y el 80% según el nivel.

Que no llegue al 100% no es timidez. Las dos pistolas van **al mismo blanco**,
así que una izquierda entera sería el doble de daño sin ninguna condición — y
las otras dos de la pistola sí la tienen: Rebote necesita multitud y Perforación
total necesita algo que frene balas.

Y que compartan blanco tampoco es pereza. El torso mira hacia donde dispara el
arma (ver "Verificación de la Parte B"), así que con dos blancos distintos habría
que elegir a cuál de los dos seguir. Con uno solo esa pregunta no existe. Lo
único que se separa son las bocas, ±0.22 unidades: sin eso las dos manos
disparan desde el mismo punto y la habilidad más visible del arma se ve
exactamente igual que no tenerla.

## El escuadrón

Elegís **un personaje principal** antes de jugar, y al subir de nivel podés sumar
hasta **dos compañeros**. Tres en total, contándote.

**De dónde salió.** La pistola y la escopeta tenían una habilidad que disparaba
la misma andanada 180° hacia atrás: un tipo tirando por la espalda sin darse
vuelta. Cubría el problema real —que la horda te rodea— pero se veía falso,
porque lo era. Un compañero parado atrás disparando hacia atrás resuelve lo
mismo y es lo que el jugador ya creía estar viendo. Las dos habilidades se
borraron y en su lugar el mazo del menú de nivel ofrece personajes.

| | |
|---|---|
| Roster | los mismos personajes jugables: **un personaje es un arma** (ver WeaponDefs) |
| Cuántos | 3 contando al principal (`CONFIG.SQUAD.MAX`) |
| Cuáles te ofrece | cualquiera menos el tuyo y los que ya tenés |
| Daño | 70% del arma (`CONFIG.SQUAD.DAMAGE_MULT`) |
| Vida | **no tienen**: el escuadrón comparte una sola barra, la tuya |
| Formación | un **círculo** de radio 1.5 alrededor tuyo; los dos puestos van atrás, a los costados |

**Un hitbox repartido en tres, y una sola vida.** Tienen cuerpo —la horda no
los atraviesa— pero no tienen barra propia: tocar a un compañero es tocarte a
vos, y **no se puede morir uno solo**. La ventana de invulnerabilidad también
es una, así que tres cuerpos rodeados no cobran el triple. Y comparten tu
apuntado: si pasás a manual, apuntan los tres.

Llegar acá costó dos versiones peores. Primero fueron **fantasmas**: la hitbox
estaba solo en el principal, la horda les pasaba por adentro y no recibían
nada. Después tuvieron **vida propia**, y se morían solos — medido en una
partida real, los dos duraron 30 y 34 segundos mientras el jugador terminaba
con 53 de 100. Tiene sentido: **no podés esquivar por ellos**, te siguen a un
puesto fijo, así que cobrarles una barra que no controlás es cobrar por algo
que no se puede jugar. Las dos versiones rompían lo mismo — si uno puede caerse
sin vos, no son un escuadrón, son tres unidades que viajan juntas.

Los tres destellan juntos cuando les pegan. Es la forma más directa de decir
que la barra es una sola sin escribirlo en ningún lado.

**Dos decisiones más:**

1. **No heredan tus habilidades.** Las de personaje están atadas a tu arma, así
   que darle Rebote —de pistola— a un compañero con escopeta sería aplicar un
   modificador que nadie diseñó para eso. Sí heredan lo que no depende del arma:
   las mejoras del taller de **su** arma y las estadísticas de la partida.
2. **El puesto es del mundo, no de hacia dónde mirás.** Atado a la orientación,
   girar en el lugar los haría dar vueltas alrededor tuyo y la cobertura de la
   espalda —que es todo el punto— cambiaría cada vez que cambiás de dirección.

La formación se guarda en **polares** —un radio y una lista de ángulos— para que
se lea de un vistazo que es un círculo. Empezó siendo dos posiciones fijas a
(±2.0, 1.6): 2.56 unidades de distancia y 4 de separación entre ellos, que con la
cámara angulada no se veía como un escuadrón sino como tres personas paradas
lejos una de otra. Con radio 1.5 quedan 0.7 unidades de aire entre cuerpo y
cuerpo, y corriendo a fondo la formación se estira solo hasta 1.93. Un puesto
nuevo es un ángulo nuevo en la lista.

Cada uno lleva un **anillo de color** en el piso, del color de su arma: con la
cámara cenital, mirarle el arma al muñeco no es una opción realista.

**Un personaje nuevo es una fila en `WEAPON_DEFS`.** La opción del menú de nivel
se deriva de esa tabla, igual que las habilidades se derivan de `SKILL_DEFS`, así
que aparece sola sin tocar el mazo.

## Oleadas: la horda y las élites

La partida tiene una forma, y son dos tablas:

| | Dónde | Qué decide |
|---|---|---|
| `WAVE_STAGES` | `enemies/WaveManager.js` | qué basura aparece, cada cuánto y de a cuántos |
| `ELITE_SCHEDULE` | `config/BossDefs.js` | qué élite aparece y en qué segundo |

**El ciclo: horda → minijefe CON la horda → jefe casi solo.** Es la diferencia
entre los dos escalones y lo único que los separa en el código son dos líneas
de `BossController._spawn()`: el jefe limpia la arena y afloja el spawner ×12,
el minijefe no toca ninguna de las dos cosas. Todo lo demás —la embestida, el
golpe de área, el seguimiento por id, la barra del HUD— lo comparten.

### La horda

Seis tipos, y la proporción de drones **baja** con el tiempo mientras sube todo
lo demás: la horda tardía no es la misma horda más grande, es otra horda.

| Tipo | Qué aporta |
|---|---|
| **Drone** | la base |
| **Runner** | rápido, pero siempre esquivable en línea recta (5.2 contra tus 6.0) |
| **Tank** | frena las balas: escudo andante para el resto |
| **Larva** | casi sin vida. Deja crecer la horda en cantidad sin que crezca la vida total |
| **Mitosis** | al morir se parte en dos larvas: el único cuya muerte te empeora la situación |
| **Cazador** | `heavy`: nada lo empuja y la multitud no lo bloquea, así que siempre llega |

El Cazador existe contra la única estrategia dominante que quedaba —correr en
círculos arrastrando a todos atrás—, que funcionaba justamente porque los
enemigos se bloquean entre ellos.

Las crías de Mitosis **heredan el multiplicador de vida del padre**,
reconstruido de su `maxHp`. Sin eso, en el minuto seis se partiría en dos
larvas de juguete y la mecánica dejaría de significar nada. Y **no se parte
cuando el jefe limpia la arena**: partirse es la recompensa por matarlo, no
algo que pase por decreto.

### Las élites

| | Escalón | Qué hace | Vida |
|---|---|---|---|
| **El Bruto** | minijefe | embiste | 650 |
| **El Guardián** | minijefe | frena las balas y golpea el área | 950 |
| **El Acechador** | minijefe | embiste rápido y avisa poco | 420 |
| **The Cube King** | jefe | golpe de área | 2500 |
| **El Segador** | jefe | el único que embiste **y** golpea el área | 3200 |
| **El Coloso** | jefe | el golpe más grande y más seguido del juego | 5200 |

Seis élites y **dos habilidades**. La variedad sale de combinarlas y de los
números de cada una, no de escribir un ataque nuevo por jefe: una élite nueva
son dos filas —el arquetipo en `EnemyDefs` y el comportamiento en `BossDefs`—
y ni una línea de código.

**Nunca hay dos élites a la vez.** Si la de turno sigue viva cuando le toca a
la siguiente, la siguiente espera y sale apenas cae. Sin esa regla, un jugador
lento juntaría minijefes hasta volver la pantalla ilegible — y peor, un jefe
podría aparecer arriba de un minijefe y "el jefe pelea solo" dejaría de ser
cierto.

**La vida no escala dentro de la primera vuelta al calendario.** Los números de
arriba son una curva que alguien diseñó —el Bruto a los 40 s, el Coloso a los
385—; multiplicarlos por "cuántos ya salieron" la borraría y el cuarto minijefe
pegaría más que el primer jefe. Solo escalan las vueltas siguientes, que ya no
son contenido escrito sino tiempo extra.

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
│   └── BossController.js         aparición y ataques de las élites
├── combat/
│   ├── WeaponSystem.js           el arma base: apuntado y disparo
│   ├── ProjectileManager.js      pool de balas + colisión
│   └── ContactDamage.js          daño de la horda al jugador
├── progression/
│   ├── Progression.js            nivel, XP y multiplicadores de la partida
│   └── PickupManager.js          gemas, monedas, corazones e imanes
├── skills/SkillSystem.js         las 3 skills, un solo resolutor
├── audio/SoundManager.js        sintetiza y reproduce; presupuesto de voces
├── audio/GameAudio.js           qué suena en cada hecho del frame
├── vfx/ParticleSystem.js        todas las partículas, en un solo draw call
├── vfx/GameVfx.js               qué partículas salen en cada hecho
├── vfx/PostFX.js                bloom + el presupuesto que lo apaga solo
├── core/FrameEvents.js          deduce qué pasó este frame, para audio y VFX
├── meta/PlayerProfile.js         perfil persistente: moneda y mejoras compradas
├── ui/MainMenu.js                la primera pantalla: nombre y tres botones
├── ui/StartMenu.js               perfil, taller y elección del arma base
├── ui/HUD.js                     vida, XP, tiempo, oleada y tu build
├── ui/UpgradeMenu.js             elección de mejora al subir de nivel
├── ui/OptionsMenu.js             ajustes y controles, en un solo panel
├── player/Squad.js               vos y hasta dos compañeros que pelean al lado
├── ui/SkillLab.js                herramienta de diseño para evaluar habilidades (dev)
├── config/EnemyDefs.js           arquetipos de enemigo (las élites son unos más)
├── config/BossDefs.js            qué hace cada élite + el calendario de la partida
├── config/WeaponDefs.js          las 3 armas base
├── config/SkillDefs.js           las habilidades, con sus 5 niveles
├── config/PickupDefs.js         lo que se junta del piso, y cuál se atrae
├── combat/WeaponMods.js          lo que las habilidades de personaje le cambian al arma
├── config/UpgradeDefs.js         mazo de mejoras del menú de nivel (de partida)
├── config/MetaDefs.js            árboles de mejora permanente, uno por arma
├── config/SoundDefs.js           los 16 sonidos, sintetizados (sin archivos)
├── config/VfxDefs.js             las 7 explosiones de partículas
├── perf/PerformanceMonitor.js    panel de diagnóstico técnico (solo dev)
└── tests/                        `npm test` — 217 tests, sin dependencias
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
| **G — UI/HUD/menús** | ✅ Completa y verificada |
| **L — Meta-progresión** (perfil, moneda, mejoras de arma) | ✅ Completa y verificada |
| **H — Audio** | ✅ Completa y verificada |
| **I — VFX / post-processing** | ✅ Completa y verificada |
| **J — Pooling y memoria** | ✅ Completa y verificada |
| **K — Testing** | ✅ Completa y verificada |

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
| Efecto de las mejoras | daño ×1 → **1.30** (2 tomas) · cadencia ×1 → **0.81** · velocidad **+8%** · vida **100 → 125** · imán **2.6 → 4.16** (la mejora `Imán` se sacó después de esta medición) |
| Daño de las skills | Aura **240 dps** sobre 24 blancos (10 dps × 24, exacto) · Rayo **213 dps** · Escudo orbital **74 dps**. El aura se sacó del juego después de esta medición; el número queda porque la medición pasó. |
| Varios niveles de golpe | se encolan y se eligen de a uno; el menú reabre solo |
| Reinicio | nivel, mejoras, armas, skills, gemas y estadísticas vuelven a cero |
| `WEAPON_DEFS` tras una partida con mejoras | **intacta** — los multiplicadores viven en `Progression`, la tabla nunca se muta |
| Carga completa (7 armas + 3 skills al máximo, oleada final) | **79 FPS mínimo · 12 draw calls · heap plano** |

Dos decisiones que valen la pena registrar:

- **Multiplicativo, no aditivo, en la cadencia.** Restando 10% seis veces, la séptima mejora dejaría la recarga en cero y el arma dispararía infinitas veces por frame. `×0.9` no llega nunca a cero.
- **El daño de un proyectil se congela al disparar.** Si se leyera al impactar, una bala en vuelo cambiaría de daño al subir de nivel a mitad de camino.

### Verificación de la Parte F

**El boss es un enemigo más, no una clase aparte.** Su arquetipo está en `EnemyDefs.js` junto a los otros tres; solo su comportamiento (embestida, golpe de área, aparición programada) vive en `BossDefs.js` + `BossController.js`. Una clase `Boss` propia habría obligado a enseñarle su existencia al apuntado de las armas, a la colisión de proyectiles, a las tres skills y al daño por contacto — cinco lugares, cinco oportunidades de que el boss quede inmune a algo por olvido. Así, **todo eso funcionó sin escribir una línea nueva**.

| Criterio | Medición |
|---|---|
| Aparición | a los **60 s**, a 22 u del jugador, 5000 HP, radio 2.6 |
| "Limpia la arena" | la basura muere **soltando sus gemas** — el duelo empieza limpio y el jugador cobra lo ganado |
| Spawner durante el duelo | intervalo **×2.5** más lento; vuelve a ×1 al morir el boss |
| Embestida | **quitada por decisión de diseño** — ver abajo |
| Golpe de área | anillo en el piso 0.55 s antes, **30 de daño** en radio 5.5, en la posición donde empezó (no sigue al boss) |
| Daño recibido | lo matan las armas y las skills por el camino normal, sin código especial |
| Al morir | barra oculta · spawner normalizado · gema de **120 xp** · próximo a los **180 s con 9000 HP** |
| No lo empuja la horda | `heavy: 1` — la separación no lo mueve y la multitud no lo bloquea |

**La embestida se le sacó al Cube King.** Que algo te salte encima a seis veces su velocidad se siente injusto aunque avise: en un juego donde lo único que controlás es moverte, un ataque que te persigue más rápido de lo que podés correr no te deja jugar, te deja aguantar.

Se sacó **borrando la clave `charge` de su fila en `BossDefs.js`**, no borrando código. Las habilidades del boss son opcionales y el controlador las consulta antes de ejecutarlas, así que un boss futuro la vuelve a activar agregando la clave. Para que "sigue soportada" no sea una promesa vacía, hay un test que arma un boss con embestida y verifica la máquina de estados completa: aviso con velocidad 0 → embestida a la velocidad de la tabla → vuelta a la normal.

**La consecuencia, medida y no estimada:** el boss quedó **completamente esquivable**. Caminando siempre en dirección opuesta durante 25 s: **0 golpes recibidos, 0 de vida perdida**. A 2.3 u/s no puede alcanzar a un jugador que corre a 6.0, y el golpe de área nunca llega a dispararse porque su alcance es 6 u. Peleando de cerca —caminando en círculo alrededor suyo— sí cobra: 70 de vida en los mismos 25 s.

Es decir: el duelo pasó de "esquivá la embestida" a "¿te animás a acercarte?". Si se quiere que acercarse no sea opcional, la palanca es `ENEMY_DEFS.BOSS.speed`: subirla de 2.3 a ~4.6 lo hace insistente sin que nunca te salte encima — seguís pudiendo escapar, pero ya no podés frenarte a resolver la horda.

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

**Abandonar también paga.** Durante un tiempo solo cobraba la muerte: `toMenu()` no pasaba por el cobro. Eso creaba un incentivo absurdo —para cobrar una buena partida había que dejarse matar a propósito— y contradecía al propio botón, que dice "abandonar y volver al taller", que es donde se gasta. Ahora las dos salidas pasan por `_settleRun()`, que **cobra una sola vez** gracias a una bandera: la rama de GAME_OVER corre todos los frames, así que sin ella la moneda se multiplicaría por los frames que tardes en apretar una tecla, y desde GAME_OVER se puede volver al taller, que pasa otra vez por ahí. Medido en el navegador: abandonar tras 15.5 s y 11 bajas paga 25, que es la fórmula exacta; morir paga una vez y volver al taller después no vuelve a pagar; quedarse quieto cinco segundos en la pantalla de muerte no suma nada.

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

### Verificación de la Parte G

| Criterio | Medición |
|---|---|
| Pausa | Esc o P: el tiempo quedó clavado en **2.51 s** durante 1.5 s reales, con enemigos y vida congelados |
| Sin salto al volver | primer frame tras despausar: **delta 0.017 s**, normal — `Time` recorta con MAX_DELTA |
| Cómo se pausa | el loop no entra en la rama de PLAYING; **ningún sistema sabe que la pausa existe** |
| Números flotantes | pool fijo de 18 divs, proyectados del mundo a pantalla, subiendo y apagándose |
| Qué muestran | solo daño al boss, daño recibido y subida de nivel |

**Por qué no hay un número por cada impacto.** Con 400 enemigos, un número por golpe no es información: es una cortina que tapa justo lo que hay que ver, que es de dónde viene la horda. El daño a la horda ya se comunica solo — el enemigo desaparece. El del boss sí importa, porque es el único blanco que aguanta y no tenés otra forma de saber si le estás haciendo mella.

`UIManager` y `MenuManager`, que el GDD nombraba, no se escribieron: cada pantalla se muestra y se esconde sola, y un gestor por encima habría sido una capa sin trabajo propio.

### Verificación de la Parte J

El GDD exige que **toda métrica de esta parte venga de una captura real, no de una estimación**. Estas salen de una partida de **3 minutos y medio** con carga sostenida, muestreando cada 5 segundos.

| Criterio | Medición |
|---|---|
| Duración | **210 s** continuos · 156 enemigos promedio · 3229 bajas · 2 bosses |
| Framerate | **60 fps de mínimo y de máximo** — ni una caída en toda la corrida |
| Heap | oscila entre **39.7 y 41.5 MB**; empieza en 40.4 y termina en 40.5 |
| Forma de la curva | diente de sierra, no rampa: es el recolector trabajando, no una fuga |

**Tres asignaciones por frame encontradas y eliminadas** — la auditoría era el punto de esta parte, no adornarla:

1. `GameManager` armaba un **objeto literal nuevo cada frame** para pasarle datos al panel de diagnóstico: 3600 objetos por minuto de basura, incluso con el panel apagado. Ahora se reserva una vez, se rellena en el lugar, y ni se toca si el panel no está encendido.
2. El HUD construía una **cadena y un array intermedio cada frame** para preguntarse si tu build había cambiado, cuando en el 99.9% de los frames la respuesta es "no". Ahora la firma es un número, calculado con enteros.
3. La barra de vida del boss **escribía un estilo en el DOM todos los frames**, forzando recálculo de layout para un cambio invisible. Ahora solo escribe cuando el cambio se ve, igual que las otras barras.

**Estado de todos los pools**, que es lo que esta parte pedía conectar de verdad:

| Pool | Tope | Pico observado | Si se llena |
|---|---|---|---|
| Enemigos | 400 | 400 | no spawnea más |
| Proyectiles | 600 | ~120 | el disparo se pierde |
| Recolectables | 1200 | — | lo que no entra se acredita directo, no se pierde |
| Partículas | 900 | 896 | se descarta la nueva |
| Números flotantes | 18 | 18 | se pisa el más viejo |
| Voces de audio | 20 | 4 | entra solo si tiene más prioridad |

Los dos criterios opuestos son deliberados: las partículas descartan lo nuevo porque son decoración, los números flotantes pisan lo viejo porque ahí lo último que pasó es lo que importa.

No se escribió un `ObjectPool` genérico como sugería el GDD. Cada sistema tiene su pool tipado con `Float32Array`, que es más rápido y más simple que una clase genérica sobre objetos — y no había un solo caso que necesitara compartir código entre ellos.

### Verificación de la Parte K

```bash
npm test
```

**217 tests, todos pasan, sin una sola dependencia.** El proyecto anterior tenía un `TestFramework.js` de 291 líneas que no corría en ningún lado: el problema nunca fue el framework, fue que no había un botón. El corredor nuevo son 120 líneas.

Qué cubren: progresión y curva de XP · perfil guardado (incluidos **11 casos de `localStorage` corrupto**) · mejoras permanentes · rejilla espacial · `EnemyManager` · oleadas · mazo de mejoras · habilidades · filtro de habilidades por arma · modificadores del arma · recolección (gema, moneda, corazón, imán) · **mudanza del perfil al renombrar** · política de voces del audio · pool de partículas · deducción de `FrameEvents` · sanidad de todas las tablas de datos.

Tres merecen mención porque **defienden bugs que ya ocurrieron**:

- *"clear reinicia el contador de bajas"* — el bug que destapó la recompensa: las bajas se arrastraban entre partidas y reintentar pagaba de más.
- *"el daño diferido le pega a quien corresponde, no al que se mudó"* — la trampa del borrado por intercambio, el bug más caro de encontrar del proyecto.
- *"NINGUNA mejora toca WEAPON_DEFS"* — compra todos los niveles de todos los árboles de las tres armas y compara la tabla contra una copia. Es la restricción de arquitectura del GDD Parte L, ahora imposible de violar sin que el test grite.

**Lo que NO se testea acá, a propósito:** que la escopeta se sienta contundente o que el bloom quede lindo no lo dice un `assert`. Eso se verifica en el navegador y está documentado arriba, parte por parte.

Los tests corren en Node, sin navegador y sin WebGL. Eso salió gratis, y no por suerte: los datos y el dibujo estaban separados desde el principio, así que las clases que deciden el resultado de una partida no necesitan una pantalla para funcionar.

## Publicar

```bash
npm run build
```

Sale un `dist/` estático: un `index.html` y un solo `.js` con hash en el
nombre. No hay backend, no hay variables de entorno, no hay nada que configurar
en el servidor — cualquier hosting de archivos lo sirve.

`vercel.json` fija el framework, el comando y la carpeta de salida en lugar de
confiar en la autodetección, y le pone caché inmutable de un año a `/assets/*`.
Eso es seguro porque Vite le mete un hash al nombre: si el archivo cambia,
cambia el nombre, así que nunca se sirve una versión vieja desde caché.

| Medida | Valor |
|---|---|
| Bundle | 667 KB · **179 KB comprimido** |
| De eso, three.js | ~600 KB — el juego propio es chico |
| Peticiones para arrancar | **2** (html + js), ninguna externa |
| Fuentes, CDNs, analytics | ninguno |

**El panel de diagnóstico no viaja al build.** Estaba atado a un
`SHOW_DEBUG_PANEL: true` escrito a mano y se publicaba encendido, tapando la
esquina de la pantalla con números que a un jugador no le dicen nada. Ahora se
ata a `import.meta.env?.DEV`. El `?.` no es decorativo: los tests corren en
Node, donde `import.meta.env` no existe.

El build de producción se verifica aparte del de desarrollo, porque son cosas
distintas y el minificado rompe cosas que el otro no:

```bash
npm run build && npm run preview
```

## Decisiones abiertas

Ya no queda ninguna decisión abierta de `GDD_v2.md` §6. Las dos que había se cerraron:

- **§6.1 Estilo visual**: **resuelta a favor del neón oscuro.** En un survivor la legibilidad manda, y sobre piso oscuro un objeto brillante se lee solo; el bloom de la Parte I convierte eso en luz, mientras que sobre fondo claro solo lavaría la imagen. Además es lo que el juego ya era: la paleta de armas, las gemas, la grilla y el HUD están construidos así.
- **§6.3 Personaje**: **resuelta.** El jugador es un soldado procedural generado por código (ver "Verificación de la Parte B"). No hay `.glb` que versionar. Si algún día hace falta una cámara de cerca, se reemplaza por un GLTF con skinning sin tocar `Player.js`.
