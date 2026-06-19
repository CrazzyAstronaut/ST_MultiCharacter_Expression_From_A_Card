/*
 * Multi-Character Expression From A Card
 * --------------------------------------
 * Muestra los sprites de VARIOS personajes a la vez sobre el chat (estilo visual-novel),
 * partiendo de UNA sola carta. Cada carta cargada actúa como "carpeta padre" y dentro se
 * gestionan subcarpetas (un personaje = una subcarpeta de sprites). Todo se administra desde
 * el desplegable de la extensión, con un sub-desplegable por personaje.
 *
 * Reutiliza el backend nativo de sprites de SillyTavern, que soporta subcarpetas:
 *   GET  /api/sprites/get?name=<Carta>/<Personaje>   -> [{ label, path }]
 *   POST /api/sprites/upload   (FormData: name, label, spriteName, avatar)
 *   POST /api/sprites/delete   (JSON: name, label, spriteName)
 *
 * No usa imports relativos: accede a SillyTavern.getContext() (objeto global estable), de modo
 * que funciona instalada por git en data/<usuario>/extensions/ o en third-party/.
 */

const MODULE_NAME = 'MultiCharacterExpressionFromACard';
const LOG = '[MCEFAC]';

const defaultSettings = {
    enabled: true,
    editMode: false,
    cards: {}, // { "<NombreCarta>": { characters: [ {...} ] } }
    win: { open: false, x: null, y: null }, // ventana flotante (activar/desactivar)
};

function defaultCharacter(name) {
    return {
        id: 'mcefac-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
        name: name,
        enabled: false,
        sprite: '',       // label elegido (ej. "happy")
        spritePath: '',   // url cacheada del sprite elegido
        pos: null,        // { xPct, yPct } o null => auto-distribuir
        scale: 1,
        flip: false,
        z: 0,
    };
}

// Estado en memoria
let currentCard = null;

/* ---------------------------------------------------------------- contexto / settings */

function ctx() {
    return (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) ? SillyTavern.getContext() : null;
}

function getSettings() {
    const c = ctx();
    if (!c) return structuredClone(defaultSettings);
    const store = c.extensionSettings;
    if (!store[MODULE_NAME]) store[MODULE_NAME] = structuredClone(defaultSettings);
    const s = store[MODULE_NAME];
    // Rellenar claves nuevas si faltan
    for (const k of Object.keys(defaultSettings)) {
        if (s[k] === undefined) s[k] = structuredClone(defaultSettings[k]);
    }
    if (typeof s.cards !== 'object' || s.cards === null) s.cards = {};
    if (typeof s.win !== 'object' || s.win === null) s.win = structuredClone(defaultSettings.win);
    return s;
}

function save() {
    const c = ctx();
    if (c && typeof c.saveSettingsDebounced === 'function') c.saveSettingsDebounced();
}

function getCurrentCardName() {
    const c = ctx();
    if (!c) return null;
    try {
        if (c.groupId) {
            const group = (c.groups || []).find(g => String(g.id) === String(c.groupId));
            if (group && group.name) return group.name;
        }
        const ch = (c.characters || [])[c.characterId];
        return ch && ch.name ? ch.name : null;
    } catch (e) {
        console.error(LOG, 'getCurrentCardName', e);
        return null;
    }
}

function getRoster(create = false) {
    const s = getSettings();
    if (!currentCard) return [];
    if (!s.cards[currentCard]) {
        if (!create) return [];
        s.cards[currentCard] = { characters: [] };
    }
    if (!Array.isArray(s.cards[currentCard].characters)) s.cards[currentCard].characters = [];
    return s.cards[currentCard].characters;
}

function findChar(id) {
    return getRoster().find(c => c.id === id) || null;
}

/* ------------------------------------------------------------------ API de sprites */

async function listSprites(card, name) {
    const c = ctx();
    if (!c || !card || !name) return [];
    const query = `${card}/${name}`;
    try {
        const res = await fetch(`/api/sprites/get?name=${encodeURIComponent(query)}`, {
            method: 'GET',
            headers: c.getRequestHeaders(),
        });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.error(LOG, 'listSprites', e);
        return [];
    }
}

async function uploadSprite(card, name, label, file) {
    const c = ctx();
    if (!c || !card || !name || !label || !file) return false;
    try {
        const form = new FormData();
        form.append('name', `${card}/${name}`);
        form.append('label', label);
        form.append('spriteName', label);
        form.append('avatar', file);

        const headers = { ...c.getRequestHeaders() };
        // El navegador debe fijar el Content-Type multipart con su boundary.
        delete headers['Content-Type'];
        delete headers['content-type'];

        const res = await fetch('/api/sprites/upload', { method: 'POST', headers, body: form });
        return res.ok;
    } catch (e) {
        console.error(LOG, 'uploadSprite', e);
        return false;
    }
}

async function deleteSprite(card, name, label) {
    const c = ctx();
    if (!c || !card || !name || !label) return false;
    try {
        const res = await fetch('/api/sprites/delete', {
            method: 'POST',
            headers: c.getRequestHeaders(),
            body: JSON.stringify({ name: `${card}/${name}`, label, spriteName: label }),
        });
        return res.ok;
    } catch (e) {
        console.error(LOG, 'deleteSprite', e);
        return false;
    }
}

/* ----------------------------------------------------------------------- utilidades */

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[m]));
}

/* ----------------------------------------------------------------------- panel UI */

function panelHtml() {
    return `
    <div id="mcefac-settings" class="mcefac-extension">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Multi-Character Expression</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <label class="checkbox_label" for="mcefac-enabled">
                    <input id="mcefac-enabled" type="checkbox">
                    <span>Activar extensión</span>
                </label>
                <label class="checkbox_label" for="mcefac-editmode">
                    <input id="mcefac-editmode" type="checkbox">
                    <span>Modo edición (arrastrar sprites)</span>
                </label>

                <div class="mcefac-cardline">
                    <i class="fa-solid fa-id-card"></i>
                    Carta actual: <b id="mcefac-cardname">—</b>
                </div>

                <div id="mcefac-popout" class="menu_button mcefac-popout" title="Abrir ventana flotante para activar/desactivar sprites">
                    <i class="fa-solid fa-window-restore"></i> Ventana flotante de activación
                </div>

                <hr class="sysHR">

                <div class="flex-container mcefac-addrow">
                    <input id="mcefac-newname" class="text_pole flex1" type="text"
                        placeholder="Nombre del personaje (subcarpeta)">
                    <div id="mcefac-add" class="menu_button" title="Agregar personaje">
                        <i class="fa-solid fa-plus"></i> Agregar
                    </div>
                    <div id="mcefac-refresh" class="menu_button" title="Refrescar sprites desde el disco">
                        <i class="fa-solid fa-rotate"></i>
                    </div>
                </div>

                <div id="mcefac-characters"></div>
                <div id="mcefac-empty" class="mcefac-empty">Sin personajes para esta carta. Agrega uno arriba.</div>
            </div>
        </div>
    </div>`;
}

function charDrawerHtml(ch) {
    const id = escapeHtml(ch.id);
    const name = escapeHtml(ch.name);
    const scale = Number(ch.scale) || 1;
    return `
    <div class="inline-drawer mcefac-char" data-id="${id}">
        <div class="inline-drawer-toggle inline-drawer-header mcefac-char-header">
            <span class="mcefac-char-title">
                <label class="checkbox_label mcefac-switch" title="Mostrar / ocultar este personaje">
                    <input type="checkbox" class="mcefac-char-enabled" ${ch.enabled ? 'checked' : ''}>
                </label>
                <b class="mcefac-char-name-display">${name || '(sin nombre)'}</b>
            </span>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <label class="mcefac-field">
                <span>Nombre / subcarpeta</span>
                <input type="text" class="text_pole mcefac-char-name" value="${name}">
            </label>

            <label class="mcefac-field">
                <span>Sprite mostrado</span>
                <span class="flex-container">
                    <select class="text_pole flex1 mcefac-char-sprite"></select>
                    <div class="menu_button mcefac-sprite-del" title="Eliminar el sprite seleccionado del disco">
                        <i class="fa-solid fa-trash-can"></i>
                    </div>
                </span>
            </label>

            <label class="mcefac-field">
                <span>Subir sprite</span>
                <span class="flex-container mcefac-upload-row">
                    <input type="text" class="text_pole flex1 mcefac-upload-label" placeholder="expresión (ej. happy)">
                    <input type="file" class="mcefac-upload-file" accept="image/*" hidden>
                    <div class="menu_button mcefac-upload-btn" title="Elegir imagen y subirla a esta subcarpeta">
                        <i class="fa-solid fa-upload"></i> Subir
                    </div>
                </span>
            </label>

            <label class="mcefac-field">
                <span>Escala (<b class="mcefac-scale-val">${scale.toFixed(2)}</b>)</span>
                <input type="range" class="mcefac-char-scale" min="0.2" max="2" step="0.05" value="${scale}">
            </label>

            <label class="checkbox_label">
                <input type="checkbox" class="mcefac-char-flip" ${ch.flip ? 'checked' : ''}>
                <span>Espejo (voltear horizontal)</span>
            </label>

            <div class="flex-container mcefac-char-actions">
                <div class="menu_button mcefac-char-resetpos" title="Volver a auto-distribuir">
                    <i class="fa-solid fa-arrows-to-dot"></i> Reset posición
                </div>
                <div class="menu_button mcefac-danger mcefac-char-delete" title="Quitar personaje de esta carta">
                    <i class="fa-solid fa-trash"></i> Eliminar
                </div>
            </div>
        </div>
    </div>`;
}

function renderPanel() {
    const s = getSettings();
    const $ = window.jQuery;

    document.getElementById('mcefac-enabled').checked = !!s.enabled;
    document.getElementById('mcefac-editmode').checked = !!s.editMode;
    document.getElementById('mcefac-cardname').textContent = currentCard || '—';

    const container = document.getElementById('mcefac-characters');
    const roster = getRoster();
    container.innerHTML = roster.map(charDrawerHtml).join('');
    document.getElementById('mcefac-empty').style.display = (currentCard && roster.length === 0) ? '' : 'none';

    renderWindow();

    // Poblar selects de sprites (async) y luego refrescar stage
    Promise.all(roster.map(ch => populateCharSprites(ch.id))).then(() => renderStage());
}

// Activa/desactiva un personaje y mantiene sincronizados panel y ventana flotante.
function setEnabled(id, enabled) {
    const ch = findChar(id);
    if (!ch) return;
    ch.enabled = !!enabled;
    save();
    const mainCb = document.querySelector(`#mcefac-characters .mcefac-char[data-id="${CSS.escape(id)}"] .mcefac-char-enabled`);
    if (mainCb && mainCb.checked !== ch.enabled) mainCb.checked = ch.enabled;
    const winCb = document.querySelector(`#mcefac-window .mcefac-win-enabled[data-id="${CSS.escape(id)}"]`);
    if (winCb && winCb.checked !== ch.enabled) winCb.checked = ch.enabled;
    renderStage();
}

async function populateCharSprites(charId) {
    const ch = findChar(charId);
    if (!ch || !currentCard) return;
    const sprites = await listSprites(currentCard, ch.name);
    const row = document.querySelector(`.mcefac-char[data-id="${CSS.escape(charId)}"]`);
    if (!row) return;
    const sel = row.querySelector('.mcefac-char-sprite');
    if (!sel) return;

    sel.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = sprites.length ? '— elegir sprite —' : '(sin sprites: sube uno)';
    sel.appendChild(empty);

    let matched = false;
    for (const sp of sprites) {
        const opt = document.createElement('option');
        opt.value = sp.label;
        opt.dataset.path = sp.path;
        opt.textContent = sp.label;
        if (ch.sprite && ch.sprite === sp.label) {
            opt.selected = true;
            ch.spritePath = sp.path; // refrescar url (puede cambiar el ?t=)
            matched = true;
        }
        sel.appendChild(opt);
    }
    if (!matched) {
        // el sprite guardado ya no existe en disco
        ch.spritePath = '';
    }
}

/* --------------------------------------------------------------------- stage / render */

function ensureStage() {
    let stage = document.getElementById('mcefac-stage');
    if (!stage) {
        stage = document.createElement('div');
        stage.id = 'mcefac-stage';
        document.body.appendChild(stage);
    }
    return stage;
}

async function renderStage() {
    const s = getSettings();
    const stage = ensureStage();
    stage.classList.toggle('mcefac-editing', !!s.editMode);

    if (!s.enabled || !currentCard) {
        // Animar la salida de todos los sprites en vez de borrarlos de golpe.
        stage.querySelectorAll('.mcefac-holder').forEach(removeHolderAnimated);
        return;
    }
    stage.style.display = '';

    const roster = getRoster();
    const active = roster.filter(c => c.enabled && c.sprite);

    // Resolver rutas faltantes
    for (const c of active) {
        if (!c.spritePath) {
            const sprites = await listSprites(currentCard, c.name);
            const found = sprites.find(sp => sp.label === c.sprite);
            if (found) c.spritePath = found.path;
        }
    }

    const drawable = active.filter(c => c.spritePath);
    const wantIds = new Set(drawable.map(c => c.id));

    // Salida animada de los que ya no deben mostrarse
    stage.querySelectorAll('.mcefac-holder').forEach(h => {
        if (!wantIds.has(h.dataset.id)) removeHolderAnimated(h);
    });

    const n = drawable.length;
    drawable.forEach((c, i) => {
        let holder = stage.querySelector(`.mcefac-holder[data-id="${CSS.escape(c.id)}"]`);
        let isNew = false;

        if (!holder) {
            // Crear nuevo holder con estructura: holder > .mcefac-sprite > img
            holder = document.createElement('div');
            holder.className = 'mcefac-holder mcefac-entering';
            holder.dataset.id = c.id;

            const sprite = document.createElement('div');
            sprite.className = 'mcefac-sprite';

            const img = document.createElement('img');
            // clase 'expression' + data-* para compatibilidad con ST_to_VisualNovel (breathing idle)
            img.className = 'mcefac-img expression';
            img.draggable = false;
            sprite.appendChild(img);
            holder.appendChild(sprite);

            attachDrag(holder, c.id);
            stage.appendChild(holder);
            isNew = true;
        } else if (holder.classList.contains('mcefac-leaving')) {
            // Estaba saliendo y vuelve a activarse: lo "revivimos".
            holder.classList.remove('mcefac-leaving');
        }

        const img = holder.querySelector('img');
        if (img.getAttribute('src') !== c.spritePath) img.setAttribute('src', c.spritePath);
        img.alt = c.name;
        img.style.height = ((Number(c.scale) || 1) * 70) + 'vh';
        img.style.transform = c.flip ? 'scaleX(-1)' : '';
        // data-* que detecta la extensión de respiración
        img.dataset.spriteFolderName = c.name;
        img.dataset.expression = c.sprite;
        holder.style.zIndex = String(c.z || i);

        if (c.pos && typeof c.pos.xPct === 'number') {
            holder.style.left = c.pos.xPct + '%';
            holder.style.top = c.pos.yPct + '%';
            holder.style.bottom = 'auto';
            holder.style.transform = 'none';
        } else {
            // Auto-distribución: cada personaje centrado en una franja igual del ancho.
            // n=1 -> 50% ; n=2 -> 25%,75% ; n=3 -> ~17%,50%,83% ...
            const leftPct = ((i + 0.5) / n) * 100;
            holder.style.left = leftPct + '%';
            holder.style.bottom = '0';
            holder.style.top = 'auto';
            holder.style.transform = 'translateX(-50%)';
        }

        if (isNew) {
            // Quitar la clase de entrada en el siguiente frame para disparar la transición.
            requestAnimationFrame(() => requestAnimationFrame(() => {
                holder.classList.remove('mcefac-entering');
                nudgeBreathing('enter');
            }));
        }
    });

    nudgeBreathing('render');
}

// Integración con ST_to_VisualNovel (Breathing Idle): empuja un refresco inmediato
// a través de su API global, en vez de esperar a su observer/timer. No-op si no está.
function nudgeBreathing(reason) {
    try {
        const inst = window.__stBreathingIdleInstance;
        if (inst && typeof inst.scheduleRefresh === 'function') {
            inst.scheduleRefresh('mcefac:' + (reason || 'change'));
        }
    } catch (_) { /* la otra extensión no está instalada o cambió su API */ }
}

// Anima la salida de un holder y lo elimina al terminar (con respaldo por timeout).
function removeHolderAnimated(holder) {
    if (holder.classList.contains('mcefac-leaving')) return;
    holder.classList.add('mcefac-leaving');
    const sprite = holder.querySelector('.mcefac-sprite') || holder;

    let finished = false;
    const cleanup = () => {
        sprite.removeEventListener('transitionend', onEnd);
        clearTimeout(timer);
    };
    const onEnd = (e) => {
        if (e && e.target !== sprite) return;
        // Si fue "revivido" (ya no está saliendo), no eliminar.
        if (!holder.classList.contains('mcefac-leaving')) { cleanup(); return; }
        if (finished) return;
        finished = true;
        cleanup();
        holder.remove();
        nudgeBreathing('leave');
    };
    const timer = setTimeout(onEnd, 600);
    sprite.addEventListener('transitionend', onEnd);
}

function bringToFront(charId) {
    const roster = getRoster();
    const maxZ = roster.reduce((m, c) => Math.max(m, c.z || 0), 0);
    const ch = findChar(charId);
    if (ch) {
        ch.z = maxZ + 1;
        const holder = document.querySelector(`#mcefac-stage .mcefac-holder[data-id="${CSS.escape(charId)}"]`);
        if (holder) holder.style.zIndex = String(ch.z);
    }
}

function attachDrag(holder, charId) {
    holder.addEventListener('pointerdown', (e) => {
        const s = getSettings();
        if (!s.editMode) return;
        e.preventDefault();

        const stage = ensureStage();
        const stageRect = stage.getBoundingClientRect();
        const holderRect = holder.getBoundingClientRect();
        const grabX = e.clientX - holderRect.left;
        const grabY = e.clientY - holderRect.top;

        holder.setPointerCapture(e.pointerId);
        holder.classList.add('mcefac-dragging');
        bringToFront(charId);

        const onMove = (ev) => {
            const x = ev.clientX - stageRect.left - grabX;
            const y = ev.clientY - stageRect.top - grabY;
            const xPct = (x / stageRect.width) * 100;
            const yPct = (y / stageRect.height) * 100;
            holder.style.left = xPct + '%';
            holder.style.top = yPct + '%';
            holder.style.bottom = 'auto';
            holder.style.transform = 'none';
            holder.dataset.xpct = String(xPct);
            holder.dataset.ypct = String(yPct);
        };
        const onUp = () => {
            holder.classList.remove('mcefac-dragging');
            holder.removeEventListener('pointermove', onMove);
            holder.removeEventListener('pointerup', onUp);
            holder.removeEventListener('pointercancel', onUp);
            const ch = findChar(charId);
            if (ch && holder.dataset.xpct !== undefined) {
                ch.pos = { xPct: parseFloat(holder.dataset.xpct), yPct: parseFloat(holder.dataset.ypct) };
                save();
            }
        };
        holder.addEventListener('pointermove', onMove);
        holder.addEventListener('pointerup', onUp);
        holder.addEventListener('pointercancel', onUp);
    });
}

/* ----------------------------------------------------------------------- handlers */

function bindGlobalHandlers() {
    const root = document.getElementById('mcefac-settings');
    if (!root) return;

    // Toggles globales
    root.querySelector('#mcefac-enabled').addEventListener('change', (e) => {
        getSettings().enabled = e.target.checked;
        save();
        renderStage();
    });
    root.querySelector('#mcefac-editmode').addEventListener('change', (e) => {
        getSettings().editMode = e.target.checked;
        save();
        renderStage();
    });

    // Agregar personaje
    const addChar = () => {
        const input = root.querySelector('#mcefac-newname');
        const name = (input.value || '').trim();
        if (!name) {
            toast('Escribe un nombre de personaje.', 'warning');
            return;
        }
        if (!currentCard) {
            toast('Carga primero una carta/personaje en el chat.', 'warning');
            return;
        }
        const roster = getRoster(true);
        if (roster.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            toast('Ya existe un personaje con ese nombre.', 'warning');
            return;
        }
        roster.push(defaultCharacter(name));
        input.value = '';
        save();
        renderPanel();
    };
    root.querySelector('#mcefac-add').addEventListener('click', addChar);
    root.querySelector('#mcefac-newname').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addChar(); }
    });

    root.querySelector('#mcefac-refresh').addEventListener('click', () => {
        renderPanel();
        toast('Sprites actualizados.', 'success');
    });

    root.querySelector('#mcefac-popout').addEventListener('click', toggleWindow);

    // Delegación para filas de personajes
    const container = document.getElementById('mcefac-characters');

    // Evitar que el switch del header colapse/expanda el drawer
    container.addEventListener('click', (e) => {
        if (e.target.closest('.mcefac-switch')) e.stopPropagation();
    });

    container.addEventListener('change', async (e) => {
        const row = e.target.closest('.mcefac-char');
        if (!row) return;
        const id = row.dataset.id;
        const ch = findChar(id);
        if (!ch) return;

        if (e.target.classList.contains('mcefac-char-enabled')) {
            setEnabled(id, e.target.checked);
        } else if (e.target.classList.contains('mcefac-char-name')) {
            const newName = (e.target.value || '').trim();
            if (newName) {
                ch.name = newName;
                ch.sprite = '';
                ch.spritePath = '';
                row.querySelector('.mcefac-char-name-display').textContent = newName;
                save();
                await populateCharSprites(id);
                renderStage();
            }
        } else if (e.target.classList.contains('mcefac-char-sprite')) {
            const opt = e.target.selectedOptions[0];
            ch.sprite = e.target.value;
            ch.spritePath = opt ? (opt.dataset.path || '') : '';
            save();
            renderStage();
        } else if (e.target.classList.contains('mcefac-char-flip')) {
            ch.flip = e.target.checked;
            save();
            renderStage();
        } else if (e.target.classList.contains('mcefac-upload-file')) {
            const fileInput = e.target;
            const labelInput = row.querySelector('.mcefac-upload-label');
            const label = (labelInput.value || '').trim();
            const file = fileInput.files && fileInput.files[0];
            if (!label || !file) { fileInput.value = ''; return; }
            const ok = await uploadSprite(currentCard, ch.name, label, file);
            fileInput.value = '';
            if (ok) {
                toast(`Sprite "${label}" subido.`, 'success');
                labelInput.value = '';
                ch.sprite = label;
                await populateCharSprites(id);
                renderStage();
            } else {
                toast('Error al subir el sprite.', 'error');
            }
        }
    });

    container.addEventListener('input', (e) => {
        if (!e.target.classList.contains('mcefac-char-scale')) return;
        const row = e.target.closest('.mcefac-char');
        const ch = findChar(row?.dataset.id);
        if (!ch) return;
        ch.scale = parseFloat(e.target.value) || 1;
        const lbl = row.querySelector('.mcefac-scale-val');
        if (lbl) lbl.textContent = ch.scale.toFixed(2);
        save();
        renderStage();
    });

    container.addEventListener('click', async (e) => {
        const row = e.target.closest('.mcefac-char');
        if (!row) return;
        const id = row.dataset.id;
        const ch = findChar(id);
        if (!ch) return;

        if (e.target.closest('.mcefac-upload-btn')) {
            e.stopPropagation();
            const labelInput = row.querySelector('.mcefac-upload-label');
            const fileInput = row.querySelector('.mcefac-upload-file');
            const label = (labelInput.value || '').trim();
            if (!label) { toast('Escribe una etiqueta de expresión (ej. happy).', 'warning'); return; }
            // Abre el explorador de archivos; la subida ocurre en el evento "change".
            fileInput.click();
        } else if (e.target.closest('.mcefac-sprite-del')) {
            e.stopPropagation();
            const sel = row.querySelector('.mcefac-char-sprite');
            const label = sel.value;
            if (!label) { toast('No hay sprite seleccionado.', 'warning'); return; }
            const ok = await deleteSprite(currentCard, ch.name, label);
            if (ok) {
                toast(`Sprite "${label}" eliminado.`, 'success');
                if (ch.sprite === label) { ch.sprite = ''; ch.spritePath = ''; }
                await populateCharSprites(id);
                renderStage();
            } else {
                toast('Error al eliminar el sprite.', 'error');
            }
        } else if (e.target.closest('.mcefac-char-resetpos')) {
            e.stopPropagation();
            ch.pos = null;
            save();
            renderStage();
            toast('Posición restablecida.', 'success');
        } else if (e.target.closest('.mcefac-char-delete')) {
            e.stopPropagation();
            const roster = getRoster();
            const idx = roster.findIndex(c => c.id === id);
            if (idx >= 0) {
                roster.splice(idx, 1);
                save();
                renderPanel();
            }
        }
    });
}

function toast(msg, type = 'info') {
    const c = ctx();
    if (c && c.toastr && typeof c.toastr[type] === 'function') {
        c.toastr[type](msg, 'Multi-Character Expression');
    } else if (window.toastr && typeof window.toastr[type] === 'function') {
        window.toastr[type](msg, 'Multi-Character Expression');
    } else {
        console.log(LOG, type, msg);
    }
}

/* --------------------------------------------------------------- ventana flotante */

function ensureWindow() {
    let win = document.getElementById('mcefac-window');
    if (win) return win;

    win = document.createElement('div');
    win.id = 'mcefac-window';
    win.className = 'mcefac-window';
    win.style.display = 'none';
    win.innerHTML = `
        <div class="mcefac-window-header">
            <span class="mcefac-window-title">
                <i class="fa-solid fa-users"></i>
                <span>Sprites</span>
                <small class="mcefac-window-card"></small>
            </span>
            <div class="mcefac-window-close fa-solid fa-xmark" title="Cerrar"></div>
        </div>
        <div class="mcefac-window-body" id="mcefac-window-list"></div>`;
    document.body.appendChild(win);

    win.querySelector('#mcefac-window-list').addEventListener('change', (e) => {
        if (!e.target.classList.contains('mcefac-win-enabled')) return;
        setEnabled(e.target.dataset.id, e.target.checked);
    });
    win.querySelector('.mcefac-window-close').addEventListener('click', closeWindow);
    makeWindowDraggable(win.querySelector('.mcefac-window-header'), win);
    return win;
}

function renderWindow() {
    const win = document.getElementById('mcefac-window');
    if (!win) return;
    const card = win.querySelector('.mcefac-window-card');
    if (card) card.textContent = currentCard ? `· ${currentCard}` : '';

    const list = win.querySelector('#mcefac-window-list');
    const roster = getRoster();
    if (!roster.length) {
        list.innerHTML = `<div class="mcefac-window-empty">Sin personajes para esta carta.</div>`;
        return;
    }
    list.innerHTML = roster.map(ch => `
        <label class="mcefac-window-row">
            <input type="checkbox" class="mcefac-win-enabled" data-id="${escapeHtml(ch.id)}" ${ch.enabled ? 'checked' : ''}>
            <span class="mcefac-win-name">${escapeHtml(ch.name || '(sin nombre)')}</span>
        </label>`).join('');
}

function openWindow() {
    const win = ensureWindow();
    const s = getSettings();
    win.style.display = '';
    renderWindow();

    const w = win.offsetWidth || 220;
    const h = win.offsetHeight || 200;
    let x = (s.win.x != null) ? s.win.x : (window.innerWidth - w - 20);
    let y = (s.win.y != null) ? s.win.y : 80;
    x = Math.max(0, Math.min(x, window.innerWidth - w));
    y = Math.max(0, Math.min(y, window.innerHeight - h));
    win.style.left = x + 'px';
    win.style.top = y + 'px';

    s.win.open = true;
    save();
}

function closeWindow() {
    const win = document.getElementById('mcefac-window');
    if (win) win.style.display = 'none';
    getSettings().win.open = false;
    save();
}

function toggleWindow() {
    const win = document.getElementById('mcefac-window');
    const isOpen = win && win.style.display !== 'none';
    if (isOpen) closeWindow();
    else openWindow();
}

function makeWindowDraggable(header, win) {
    header.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.mcefac-window-close')) return;
        e.preventDefault();
        const rect = win.getBoundingClientRect();
        const offX = e.clientX - rect.left;
        const offY = e.clientY - rect.top;
        header.setPointerCapture(e.pointerId);

        const onMove = (ev) => {
            let x = ev.clientX - offX;
            let y = ev.clientY - offY;
            x = Math.max(0, Math.min(x, window.innerWidth - win.offsetWidth));
            y = Math.max(0, Math.min(y, window.innerHeight - win.offsetHeight));
            win.style.left = x + 'px';
            win.style.top = y + 'px';
        };
        const onUp = () => {
            header.removeEventListener('pointermove', onMove);
            header.removeEventListener('pointerup', onUp);
            header.removeEventListener('pointercancel', onUp);
            const s = getSettings();
            s.win.x = parseInt(win.style.left, 10) || 0;
            s.win.y = parseInt(win.style.top, 10) || 0;
            save();
        };
        header.addEventListener('pointermove', onMove);
        header.addEventListener('pointerup', onUp);
        header.addEventListener('pointercancel', onUp);
    });
}

/* ----------------------------------------------------------------------- eventos */

function onChatChanged() {
    currentCard = getCurrentCardName();
    renderPanel();
}

function registerEvents() {
    const c = ctx();
    if (!c || !c.eventSource) return;
    const et = c.eventTypes || c.event_types || {};
    const on = (evt) => { if (evt) c.eventSource.on(evt, onChatChanged); };
    on(et.CHAT_CHANGED);
    on(et.GROUP_UPDATED);
    on(et.GROUP_MEMBER_DRAFTED);
    // Re-render del stage si la UI móvil/paneles se reinician
    if (et.MOVABLE_PANELS_RESET) c.eventSource.on(et.MOVABLE_PANELS_RESET, renderStage);
}

/* ----------------------------------------------------------------------- init */

async function waitForContext() {
    for (let i = 0; i < 100; i++) {
        const c = ctx();
        if (c && c.eventSource && typeof c.getRequestHeaders === 'function') return c;
        await new Promise(r => setTimeout(r, 100));
    }
    return ctx();
}

(async function init() {
    const c = await waitForContext();
    if (!c) {
        console.error(LOG, 'No se pudo obtener SillyTavern.getContext(); la extensión no se cargó.');
        return;
    }

    const $ = window.jQuery;
    const target = document.getElementById('extensions_settings') || document.getElementById('extensions_settings2');
    if (!target) {
        console.error(LOG, 'No se encontró #extensions_settings.');
        return;
    }
    if ($) $(target).append(panelHtml());
    else target.insertAdjacentHTML('beforeend', panelHtml());

    bindGlobalHandlers();
    registerEvents();

    currentCard = getCurrentCardName();
    renderPanel();
    if (getSettings().win.open) openWindow();
    console.log(LOG, 'Extensión cargada.');
})();
