# Multi-Character Expression From A Card

Extensión de terceros para **SillyTavern** que muestra los sprites de **varios personajes a la
vez** sobre el chat (estilo *visual-novel*), partiendo de **una sola carta**.

Es similar al módulo *Character Expressions* nativo, pero en lugar de un único personaje permite
componer una escena con varias "cartas" simuladas: cada carta cargada actúa como **carpeta
padre** y dentro gestionas **subcarpetas**, una por personaje. Cada personaje se muestra/oculta
con un **switch** y puedes elegir manualmente qué sprite (expresión) mostrar.

---

## Cómo funciona la organización en disco

Reutiliza el sistema de sprites nativo de SillyTavern, que ya soporta subcarpetas:

```
data/<usuario>/characters/
└── <NombreDeLaCarta>/        ← carpeta padre = nombre de la carta cargada (auto-detectado)
    ├── <Personaje A>/        ← subcarpeta por personaje (se crea al subir el primer sprite)
    │   ├── neutral.png
    │   ├── happy.png
    │   └── angry.png
    └── <Personaje B>/
        └── neutral.png
```

- La **carpeta padre** se detecta automáticamente: es el nombre de la carta (o del grupo) que
  tengas abierta en ese momento. Al cambiar de chat, el roster cambia con ella.
- Cada **personaje** que agregues desde el panel es una subcarpeta. Los sprites se suben a esa
  subcarpeta vía el backend nativo (`/api/sprites/upload`).
- La etiqueta del sprite (p. ej. `happy`) es el nombre del archivo sin extensión.

---

## Instalación

### Opción A — Instalar por URL (recomendado)

1. En SillyTavern abre **Extensions** → **Install Extension**.
2. Pega la URL del repositorio git de esta extensión.
3. SillyTavern la clona en `data/<usuario>/extensions/` y la carga.

### Opción B — Manual

Copia esta carpeta dentro de tu instalación de SillyTavern en:

```
SillyTavern/public/scripts/extensions/third-party/ST_MultiCharacter_Expression_From_A_Card/
```

Reinicia / recarga SillyTavern.

> No requiere otras extensiones. Usa `SillyTavern.getContext()`, por lo que funciona igual en
> cualquiera de las dos rutas de instalación.

---

## Uso

1. Abre el panel **Extensions** y despliega **Multi-Character Expression**.
2. Activa **"Activar extensión"**.
3. Carga una carta/personaje (o un grupo) en el chat. Verás su nombre en *"Carta actual"*.
4. Escribe un nombre de personaje y pulsa **Agregar**. Aparecerá su sub-desplegable.
5. Dentro del sub-desplegable:
   - **Subir sprite**: escribe la etiqueta de expresión (ej. `happy`), elige una imagen y pulsa
     subir. Se guarda en `…/<Carta>/<Personaje>/happy.png`.
   - **Sprite mostrado**: elige qué expresión mostrar.
   - **Escala** y **Espejo**: ajusta tamaño y volteo.
   - El **switch** del encabezado muestra u oculta a ese personaje en pantalla.
6. Activa **"Modo edición"** para **arrastrar** cada sprite a su posición; al soltar, la posición
   se guarda por personaje. Usa **Reset posición** para volver a la auto-distribución en fila.

Repite para agregar más personajes y verlos todos a la vez. Cada carta recuerda su propio roster.

---

## Animaciones

Al activar o desactivar un personaje, su sprite entra/sale con una pequeña animación
(desvanecido + leve desplazamiento y escala), similar al modo grupo/visual-novel nativo de
SillyTavern. Respeta `prefers-reduced-motion` (si tienes reducción de movimiento activada, no
anima).

## Compatibilidad con ST_to_VisualNovel (Breathing Idle)

Es compatible con la extensión
[ST_to_VisualNovel](https://github.com/CrazzyAstronaut/ST_to_VisualNovel), que añade animación
de "respiración" idle a los sprites. Las imágenes de esta extensión llevan la clase `expression`
y los atributos `data-expression` / `data-sprite-folder-name` que esa extensión busca, por lo que
detecta y anima los sprites multi-personaje automáticamente. No requiere configuración extra;
instala ambas y funcionan juntas.

La integración es **inmediata** en dos sentidos: Breathing ya observa el contenedor
`#mcefac-stage` (su `MutationObserver` reacciona al activar/cambiar sprites), y además esta
extensión *empuja* un refresco directo a su API global (`window.__stBreathingIdleInstance
.scheduleRefresh()`) al entrar/salir/renderizar sprites, así la respiración se aplica al momento
sin esperar al re-escaneo periódico. Si Breathing no está instalado, ese empujón es un no-op
inofensivo.

## Notas y límites

- La elección de expresión es **manual** (tú eliges el sprite). No hay detección automática de
  emoción por personaje.
- Renombrar un personaje **repunta** a otra subcarpeta; no mueve los archivos ya subidos.
- Las posiciones se guardan en porcentaje del escenario, así que se adaptan a distintos tamaños
  de ventana.

## Desarrollo

Archivos:

- `manifest.json` — metadatos de la extensión.
- `index.js` — lógica (panel, API de sprites, render multi-sprite, arrastre, persistencia).
- `style.css` — estilos basados en variables de tema de SillyTavern.

Validación rápida de sintaxis: `node --check index.js`.
