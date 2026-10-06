/* =========================================================
   PLANILLA.JS — Gestión de pedidos y clientes
   ========================================================= */

const AUTH_URL = '/api/auth';
const ORDERS_URL = '/api/orders';
const CLIENTS_URL = '/api/clients';
const LISTS_URL = '/api/lists';
const STORAGE_KEY = 'xstore_planilla_v1';

let DB = { version: 1, days: {} };
let clientsServer = {};
let listsServer = { bancos: [], juegos: [] };
let editingId = null;
let editingClientPhone = null;
let ordersCache = [];

// ============ UTIL ============
function todayISO() {
    const d = new Date();
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().slice(0, 10);
}
function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function normalizePhone(p) { return String(p || '').replace(/\D/g, ''); }
function getCurrentDay() { return document.getElementById('datePicker').value || todayISO(); }
function getCurrentRecords() {
    const d = getCurrentDay();
    if (!DB.days[d]) DB.days[d] = [];
    return DB.days[d];
}
function fmtAmount(n) {
    const num = Number(n);
    if (!isFinite(num)) return '0';
    if (Math.abs(num - Math.round(num)) < 0.0001) return Math.round(num).toLocaleString('es-VE');
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseAmount(str) {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    let s = String(str).replace(/[^\d.,-]/g, '');
    if (s.includes(',')) { s = s.replace(/\./g, ''); s = s.replace(',', '.'); }
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
}

// ============ STORAGE ============
function loadDB() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const p = JSON.parse(raw);
            if (p && typeof p === 'object') {
                DB = Object.assign(DB, p);
                if (!DB.days) DB.days = {};
            }
        }
    } catch (e) {}
}
function saveDB() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(DB)); } catch (e) {}
}

// ============ AUTH ============
async function checkAuth() {
    try {
        const res = await fetch(`${AUTH_URL}?action=guard`, { credentials: 'include' });
        if (!res.ok) { location.replace('/login?next=/planilla'); return false; }
        const d = await res.json();
        if (!d.ok) { location.replace('/login?next=/planilla'); return false; }
        return true;
    } catch (e) {
        location.replace('/login?next=/planilla');
        return false;
    }
}
async function logout() {
    try { await fetch(`${AUTH_URL}?action=logout`, { method: 'POST', credentials: 'include' }); } catch (e) {}
    location.replace('/login');
}

// ============ TABS ============
function switchTab(tab) {
    ['pedidos', 'clientes', 'recargas', 'listas'].forEach(t => {
        document.getElementById('panel-' + t).classList.toggle('hidden', t !== tab);
        const btn = document.getElementById('tab-' + t);
        if (t === tab) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    if (tab === 'clientes') loadClients();
    if (tab === 'pedidos') loadOrders();
    if (tab === 'listas') loadLists();
    if (tab === 'recargas') renderRecords();
    lucide.createIcons();
}

// ============ DÍA ============
function changeDay(delta) {
    const d = new Date(getCurrentDay() + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    document.getElementById('datePicker').value = d.toISOString().slice(0, 10);
    renderRecords();
}
function goToday() {
    document.getElementById('datePicker').value = todayISO();
    renderRecords();
}

// ============ FORM RECARGAS ============
function clearForm() {
    ['fTel', 'fNombre', 'fRecarga', 'fIdUsuario', 'fReferencia', 'fMonto'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const selJ = document.getElementById('fJuego'); if (selJ) selJ.value = '';
    const selB = document.getElementById('fBanco'); if (selB) selB.value = '';
    editingId = null;
    document.getElementById('saveBtnText').innerText = 'GUARDAR';
    document.getElementById('cancelBtn').classList.add('hidden');
    lucide.createIcons();
}

function saveRecord() {
    const tel = document.getElementById('fTel').value.trim();
    const nombre = document.getElementById('fNombre').value.trim();
    const juego = document.getElementById('fJuego').value.trim();
    const recarga = document.getElementById('fRecarga').value.trim();
    const idUsuario = document.getElementById('fIdUsuario').value.trim();
    const referencia = document.getElementById('fReferencia').value.trim();
    const banco = document.getElementById('fBanco').value.trim();
    const monto = parseAmount(document.getElementById('fMonto').value);

    if (!tel && !nombre) { toast('Ingresa teléfono o nombre', 'error'); return; }
    if (!juego) { toast('Selecciona un juego', 'error'); return; }
    if (monto <= 0) { toast('Monto debe ser mayor a 0', 'error'); return; }

    const day = getCurrentDay();
    if (!DB.days[day]) DB.days[day] = [];

    const record = {
        id: editingId || ('r-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)),
        nombre: nombre || 'Sin nombre',
        telefono: tel,
        juego, recarga, idUsuario, referencia, banco, monto,
        source: 'manual',
        createdAt: editingId ? (DB.days[day].find(r => r.id === editingId)?.createdAt || new Date().toISOString()) : new Date().toISOString()
    };

    if (editingId) {
        const idx = DB.days[day].findIndex(r => r.id === editingId);
        if (idx >= 0) DB.days[day][idx] = record;
    } else DB.days[day].push(record);

    saveDB();
    renderRecords();
    const wasEditing = !!editingId;
    clearForm();
    toast(wasEditing ? 'Actualizado' : 'Guardado');
}

function editRecord(id) {
    const rec = getCurrentRecords().find(r => r.id === id);
    if (!rec) return;
    editingId = id;
    document.getElementById('fTel').value = rec.telefono || '';
    document.getElementById('fNombre').value = rec.nombre || '';
    document.getElementById('fRecarga').value = rec.recarga || '';
    document.getElementById('fIdUsuario').value = rec.idUsuario || '';
    document.getElementById('fReferencia').value = rec.referencia || '';
    document.getElementById('fMonto').value = fmtAmount(rec.monto || 0);

    const selJ = document.getElementById('fJuego');
    ensureOption(selJ, rec.juego || '');
    selJ.value = rec.juego || '';

    const selB = document.getElementById('fBanco');
    ensureOption(selB, rec.banco || '');
    selB.value = rec.banco || '';

    document.getElementById('saveBtnText').innerText = 'ACTUALIZAR';
    document.getElementById('cancelBtn').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function ensureOption(selectEl, value) {
    if (!value) return;
    const exists = Array.from(selectEl.options).some(o => o.value === value);
    if (!exists) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value + ' (histórico)';
        selectEl.appendChild(opt);
    }
}

function deleteRecord(id) {
    if (!confirm('¿Eliminar este registro?')) return;
    const day = getCurrentDay();
    if (!DB.days[day]) return;
    DB.days[day] = DB.days[day].filter(r => r.id !== id);
    saveDB();
    renderRecords();
    toast('Eliminado');
}

// ============ AUTOCOMPLETE ============
function setupAutocomplete() {
    const tel = document.getElementById('fTel');
    const nom = document.getElementById('fNombre');
    const ban = document.getElementById('fBanco');
    const jue = document.getElementById('fJuego');
    tel.addEventListener('input', () => {
        const k = normalizePhone(tel.value);
        if (!k || k.length < 8) return;
        const c = clientsServer[k];
        if (c) {
            if (c.firstName && !nom.value) nom.value = (c.firstName + ' ' + (c.lastName || '')).trim();
        }
    });
}

// ============ LISTAS ============
async function loadLists() {
    try {
        const res = await fetch(`${LISTS_URL}?t=${Date.now()}`, { credentials: 'include' });
        const data = await res.json();
        listsServer.bancos = Array.isArray(data.bancos) ? data.bancos : [];
        listsServer.juegos = Array.isArray(data.juegos) ? data.juegos : [];
        renderSelectOptions();
        renderListsEditor();
    } catch (e) { toast('Error al cargar listas', 'error'); }
}

function renderSelectOptions() {
    const selJ = document.getElementById('fJuego');
    const selB = document.getElementById('fBanco');
    const currentJ = selJ.value;
    const currentB = selB.value;
    selJ.innerHTML = '<option value="">— Selecciona —</option>' +
        listsServer.juegos.map(j => `<option value="${escapeHtml(j)}">${escapeHtml(j)}</option>`).join('');
    selB.innerHTML = '<option value="">— Selecciona —</option>' +
        listsServer.bancos.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
    if (currentJ) { ensureOption(selJ, currentJ); selJ.value = currentJ; }
    if (currentB) { ensureOption(selB, currentB); selB.value = currentB; }
}

function renderListsEditor() {
    document.getElementById('bancosCount').innerText = listsServer.bancos.length + ' items';
    document.getElementById('juegosCount').innerText = listsServer.juegos.length + ' items';
    document.getElementById('bancosList').innerHTML = listsServer.bancos.map((b, i) => `
        <div class="list-item flex items-center gap-2 p-2 bg-black/40 border border-slate-800 rounded-xl">
            <input type="text" class="flex-1 bg-transparent text-white text-sm" value="${escapeHtml(b)}" onchange="updateListItem('bancos',${i},this.value)">
            <button onclick="removeListItem('bancos',${i})" class="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>`).join('') || '<p class="text-xs text-gray-500 italic text-center py-4">Sin bancos.</p>';
    document.getElementById('juegosList').innerHTML = listsServer.juegos.map((j, i) => `
        <div class="list-item flex items-center gap-2 p-2 bg-black/40 border border-slate-800 rounded-xl">
            <input type="text" class="flex-1 bg-transparent text-white text-sm" value="${escapeHtml(j)}" onchange="updateListItem('juegos',${i},this.value)">
            <button onclick="removeListItem('juegos',${i})" class="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>`).join('') || '<p class="text-xs text-gray-500 italic text-center py-4">Sin juegos.</p>';
    lucide.createIcons();
}

function updateListItem(key, idx, val) {
    const t = val.trim();
    if (!t) { toast('No puede estar vacío', 'error'); renderListsEditor(); return; }
    if (listsServer[key].some((x, i) => i !== idx && x.toLowerCase() === t.toLowerCase())) {
        toast('Ya existe', 'error');
        renderListsEditor();
        return;
    }
    listsServer[key][idx] = t;
    renderListsEditor();
}

function removeListItem(key, idx) {
    if (!confirm('¿Eliminar?')) return;
    listsServer[key].splice(idx, 1);
    renderListsEditor();
    renderSelectOptions();
}

function addBanco() {
    const i = document.getElementById('newBanco');
    const v = i.value.trim();
    if (!v) return;
    if (listsServer.bancos.some(b => b.toLowerCase() === v.toLowerCase())) { toast('Ya existe', 'error'); return; }
    listsServer.bancos.push(v);
    i.value = '';
    renderListsEditor();
    renderSelectOptions();
}

function addJuego() {
    const i = document.getElementById('newJuego');
    const v = i.value.trim();
    if (!v) return;
    if (listsServer.juegos.some(j => j.toLowerCase() === v.toLowerCase())) { toast('Ya existe', 'error'); return; }
    listsServer.juegos.push(v);
    i.value = '';
    renderListsEditor();
    renderSelectOptions();
}

async function saveLists() {
    if (listsServer.bancos.length === 0 || listsServer.juegos.length === 0) {
        toast('Debe haber al menos 1 banco y 1 juego', 'error');
        return;
    }
    try {
        const res = await fetch(`${LISTS_URL}?action=save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ bancos: listsServer.bancos, juegos: listsServer.juegos })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) { toast(data.error || 'Error', 'error'); return; }
        listsServer.bancos = data.lists.bancos;
        listsServer.juegos = data.lists.juegos;
        renderListsEditor();
        renderSelectOptions();
        toast('Listas guardadas');
    } catch (e) { toast('Error de conexión', 'error'); }
}

// ============ RENDER RECARGAS ============
function renderRecords() {
    const records = getCurrentRecords();
    const search = (document.getElementById('searchBox').value || '').toLowerCase().trim();
    const filtered = search ? records.filter(r =>
        (r.nombre || '').toLowerCase().includes(search) ||
        (r.telefono || '').toLowerCase().includes(search) ||
        (r.juego || '').toLowerCase().includes(search) ||
        (r.referencia || '').toLowerCase().includes(search) ||
        (r.idUsuario || '').toLowerCase().includes(search)
    ) : records;

    const total = records.reduce((s, r) => s + (Number(r.monto) || 0), 0);
    const count = records.length;
    const avg = count > 0 ? total / count : 0;
    document.getElementById('sumCount').innerText = count;
    document.getElementById('sumTotal').innerText = fmtAmount(total);
    document.getElementById('sumAvg').innerText = fmtAmount(avg);
    document.getElementById('footerTotal').innerText = 'Bs. ' + fmtAmount(total);

    document.getElementById('emptyState').classList.toggle('hidden', filtered.length > 0);

    document.getElementById('recordsTbody').innerHTML = filtered.map((r, i) => `
        <tr class="border-t border-slate-800 hover:bg-white/[0.02]">
            <td class="px-3 py-2.5 text-xs text-gray-500 font-mono">${i + 1}</td>
            <td class="px-3 py-2.5 text-sm text-white font-semibold">${escapeHtml(r.nombre || '—')}</td>
            <td class="px-3 py-2.5 text-xs text-gray-300 font-mono hidden sm:table-cell">${escapeHtml(r.telefono || '—')}</td>
            <td class="px-3 py-2.5 text-xs text-white">${escapeHtml(r.juego || '—')}</td>
            <td class="px-3 py-2.5 text-xs text-gray-300 hidden md:table-cell">${escapeHtml(r.recarga || '—')}</td>
            <td class="px-3 py-2.5 text-xs text-cyber-cyan font-mono hidden md:table-cell">${escapeHtml(r.idUsuario || '—')}</td>
            <td class="px-3 py-2.5 text-xs text-gray-300 font-mono hidden lg:table-cell">${escapeHtml(r.referencia || '—')}</td>
            <td class="px-3 py-2.5 text-xs text-gray-300 hidden lg:table-cell">${escapeHtml(r.banco || '—')}</td>
            <td class="px-3 py-2.5 text-sm text-right font-orbitron font-bold text-emerald-400 whitespace-nowrap">${fmtAmount(r.monto)}</td>
            <td class="px-3 py-2.5">
                <div class="flex gap-1 justify-center">
                    <button onclick="editRecord('${r.id}')" class="w-7 h-7 rounded-md bg-cyber-cyan/10 border border-cyber-cyan/30 text-cyber-cyan flex items-center justify-center"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
                    <button onclick="deleteRecord('${r.id}')" class="w-7 h-7 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                </div>
            </td>
        </tr>`).join('');
    lucide.createIcons();
}

// ============ CLIENTES ============
async function loadClients() {
    try {
        const res = await fetch(`${CLIENTS_URL}?action=list`, { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) { toast(data.error || 'Error', 'error'); return; }
        clientsServer = {};
        (data.clients || []).forEach(c => { clientsServer[c.phone] = c; });
        renderClients();
    } catch (e) { toast('Sin conexión', 'error'); }
}

function renderClients() {
    const list = document.getElementById('clientsList');
    const empty = document.getElementById('clientsEmpty');
    const q = (document.getElementById('clientSearch').value || '').toLowerCase().trim();
    const arr = Object.values(clientsServer)
        .filter(c => !q || (c.phone || '').includes(q) || (c.firstName || '').toLowerCase().includes(q) || (c.lastName || '').toLowerCase().includes(q))
        .sort((a, b) => (a.firstName || '').localeCompare(b.firstName || ''));

    if (arr.length === 0) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    list.innerHTML = arr.map(c => `
        <div class="glass-card rounded-2xl p-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-cyber-cyan/10 border border-cyber-cyan/30 flex items-center justify-center shrink-0">
                <i data-lucide="user" class="w-5 h-5 text-cyber-cyan"></i>
            </div>
            <div class="flex-1 min-w-0">
                <span class="font-bold text-white text-sm">${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}</span>
                ${c.cedula ? `<span class="text-[10px] text-gray-500 font-mono ml-2">${escapeHtml(c.cedula)}</span>` : ''}
                <p class="text-xs text-cyber-cyan font-mono mt-0.5">${escapeHtml(c.phone)}</p>
            </div>
            <div class="flex gap-1.5">
                <a href="https://wa.me/${escapeHtml(c.phone)}" target="_blank" class="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center"><i data-lucide="message-square" class="w-4 h-4"></i></a>
                <button onclick="openClientModal('${escapeHtml(c.phone)}')" class="w-8 h-8 rounded-lg bg-cyber-cyan/10 border border-cyber-cyan/30 text-cyber-cyan flex items-center justify-center"><i data-lucide="pencil" class="w-4 h-4"></i></button>
            </div>
        </div>`).join('');
    lucide.createIcons();
}

function openClientModal(phone = null) {
    editingClientPhone = phone;
    const deleteBtn = document.getElementById('deleteClientBtn');
    if (phone) {
        const c = clientsServer[phone];
        if (!c) return;
        document.getElementById('clientModalTitle').innerText = 'Editar Cliente';
        document.getElementById('cm-phone').value = c.phone || '';
        document.getElementById('cm-firstName').value = c.firstName || '';
        document.getElementById('cm-lastName').value = c.lastName || '';
        document.getElementById('cm-cedula').value = c.cedula || '';
        document.getElementById('cm-notes').value = c.notes || '';
        deleteBtn.classList.remove('hidden');
    } else {
        document.getElementById('clientModalTitle').innerText = 'Registrar Cliente';
        ['cm-phone', 'cm-firstName', 'cm-lastName', 'cm-cedula', 'cm-notes'].forEach(id => document.getElementById(id).value = '');
        deleteBtn.classList.add('hidden');
    }
    document.getElementById('clientModal').classList.remove('hidden');
    document.getElementById('clientModal').classList.add('flex');
    lucide.createIcons();
}

function closeClientModal() {
    document.getElementById('clientModal').classList.add('hidden');
    document.getElementById('clientModal').classList.remove('flex');
    editingClientPhone = null;
}

async function saveClient() {
    const phone = normalizePhone(document.getElementById('cm-phone').value);
    const firstName = document.getElementById('cm-firstName').value.trim();
    const lastName = document.getElementById('cm-lastName').value.trim();
    const cedula = document.getElementById('cm-cedula').value.trim();
    const notes = document.getElementById('cm-notes').value.trim();
    if (phone.length < 8) { toast('Teléfono inválido', 'error'); return; }
    if (!firstName || !lastName) { toast('Nombre y apellido obligatorios', 'error'); return; }

    try {
        const res = await fetch(`${CLIENTS_URL}?action=save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ phone, firstName, lastName, cedula, notes })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) { toast(data.error || 'Error', 'error'); return; }
        clientsServer[data.client.phone] = data.client;
        renderClients();
        closeClientModal();
        toast(editingClientPhone ? 'Actualizado' : 'Cliente registrado');
    } catch (e) { toast('Error de conexión', 'error'); }
}

async function deleteClient() {
    if (!editingClientPhone) return;
    if (!confirm('¿Eliminar este cliente?')) return;
    try {
        const res = await fetch(`${CLIENTS_URL}?action=delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ phone: editingClientPhone })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) { toast(data.error || 'Error', 'error'); return; }
        delete clientsServer[editingClientPhone];
        renderClients();
        closeClientModal();
        toast('Cliente eliminado');
    } catch (e) { toast('Error de conexión', 'error'); }
}

// ============ PEDIDOS ============
async function loadOrders() {
    const status = document.getElementById('ordersFilter').value;
    try {
        const res = await fetch(`${ORDERS_URL}?action=list${status ? '&status=' + status : ''}`, { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) { toast(data.error || 'Error', 'error'); return; }
        ordersCache = data.orders || [];
        renderOrders(ordersCache);
        updatePedidosBadge();
    } catch (e) { toast('Sin conexión', 'error'); }
}

async function updatePedidosBadge() {
    try {
        const res = await fetch(`${ORDERS_URL}?action=count-pending`, { credentials: 'include' });
        const data = await res.json();
        const b = document.getElementById('pedidosBadge');
        const n = data.count || 0;
        if (n > 0) { b.classList.remove('hidden'); b.innerText = n; }
        else b.classList.add('hidden');
    } catch (e) {}
}

function renderOrders(orders) {
    const list = document.getElementById('ordersList');
    const empty = document.getElementById('ordersEmpty');
    if (!orders.length) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');

    list.innerHTML = orders.map(o => {
        const statusCls = 'status-' + (o.status || 'pending');
        const statusLabel = { pending: 'Pendiente', verified: 'Verificado', completed: 'Completado', rejected: 'Rechazado' }[o.status || 'pending'];
        const packagesHtml = (o.packages || []).map(p => `• ${escapeHtml(p.name)} x${p.qty}`).join('<br>');
        const captureSrc = o.captureKey ? `/api/captures/${escapeHtml(o.id)}` : '';
        const captureHtml = captureSrc ? `<img src="${captureSrc}" class="capture-thumb mt-1" onclick="showImg(this.src)">` : '';
        const date = o.createdAt ? new Date(o.createdAt).toLocaleString('es-VE') : '';

        return `
        <div class="glass-card rounded-2xl p-4 space-y-3">
            <div class="flex items-start justify-between gap-2 flex-wrap">
                <div>
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-orbitron font-bold text-white">${escapeHtml(o.gameTitle || '—')}</span>
                        <span class="status-pill ${statusCls}">${statusLabel}</span>
                    </div>
                    <p class="text-[11px] text-gray-400 mt-0.5">${date}</p>
                </div>
                <div class="text-right">
                    <p class="font-orbitron font-black text-emerald-400">${fmtAmount(o.totalLocal || 0)} ${escapeHtml(o.currencyCode || '')}</p>
                    <p class="text-[10px] text-gray-500 font-mono">${o.totalUSDT || 0} USDT</p>
                </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div class="p-2.5 rounded-xl bg-black/40 border border-slate-800 space-y-1">
                    <p class="text-[10px] uppercase text-gray-500 font-orbitron font-bold">Cliente</p>
                    <p class="text-white font-bold">${escapeHtml(o.clientName || '—')}</p>
                    <p class="text-cyber-cyan font-mono">${escapeHtml(o.phone || '')}</p>
                </div>
                <div class="p-2.5 rounded-xl bg-black/40 border border-slate-800 space-y-1">
                    <p class="text-[10px] uppercase text-gray-500 font-orbitron font-bold">ID / Server</p>
                    <p class="text-white font-mono">${escapeHtml(o.playerId || '—')}${o.serverId ? ' (SV:' + escapeHtml(o.serverId) + ')' : ''}</p>
                </div>
                <div class="p-2.5 rounded-xl bg-black/40 border border-slate-800 space-y-1">
                    <p class="text-[10px] uppercase text-gray-500 font-orbitron font-bold">Paquetes</p>
                    <p class="text-xs text-gray-200">${packagesHtml || '—'}</p>
                </div>
                <div class="p-2.5 rounded-xl bg-black/40 border border-slate-800 space-y-1">
                    <p class="text-[10px] uppercase text-gray-500 font-orbitron font-bold">Pago</p>
                    <p class="text-white">${escapeHtml(o.paymentMethod || '—')}</p>
                    <p class="text-xs text-gray-300 font-mono">Ref: ${escapeHtml(o.reference || '—')}${o.bank ? ' · ' + escapeHtml(o.bank) : ''}</p>
                    ${captureHtml}
                </div>
            </div>
            <div class="flex gap-2 flex-wrap pt-1">
                ${o.status === 'pending' ? `
                    <button onclick="verifyOrder('${o.id}', this)" class="flex-1 py-2.5 rounded-xl bg-emerald-500 text-black font-orbitron font-bold text-xs flex items-center justify-center gap-1.5">
                        <i data-lucide="check-circle" class="w-4 h-4"></i> VERIFICAR Y REGISTRAR
                    </button>
                    <button onclick="setOrderStatus('${o.id}','rejected', this)" class="px-4 py-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/30 font-orbitron font-bold text-xs">
                        <i data-lucide="x" class="w-4 h-4"></i>
                    </button>
                ` : ''}
                ${o.status === 'verified' ? `
                    <button onclick="setOrderStatus('${o.id}','completed', this)" class="flex-1 py-2.5 rounded-xl bg-cyber-cyan text-black font-orbitron font-bold text-xs">MARCAR COMPLETADO</button>
                ` : ''}
                <button onclick="deleteOrder('${o.id}', this)" class="px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-gray-300 font-orbitron font-bold text-xs">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        </div>`;
    }).join('');
    lucide.createIcons();
}

function setBtnLoading(btn, text = 'Procesando...') {
    if (!btn) return null;
    const original = btn.innerHTML;
    btn.classList.add('processing');
    btn.innerHTML = `<span class="btn-spinner"></span><span class="ml-1">${text}</span>`;
    return original;
}
function restoreBtn(btn, original) {
    if (!btn || !original) return;
    btn.classList.remove('processing');
    btn.innerHTML = original;
    lucide.createIcons();
}
function showImg(src) {
    document.getElementById('imgModalSrc').src = src;
    const m = document.getElementById('imgModal');
    m.classList.remove('hidden');
    m.classList.add('flex');
}
function closeImgModal() {
    const m = document.getElementById('imgModal');
    m.classList.add('hidden');
    m.classList.remove('flex');
}

async function verifyOrder(id, btn) {
    if (!confirm('¿Verificar y registrar este pedido en la planilla?')) return;
    const original = setBtnLoading(btn, 'Verificando...');
    try {
        const r1 = await fetch(`${ORDERS_URL}?action=get&id=${encodeURIComponent(id)}`, { credentials: 'include' });
        const d1 = await r1.json();
        if (!r1.ok || !d1.order) { toast(d1.error || 'No encontrado', 'error'); restoreBtn(btn, original); return; }
        const o = d1.order;

        const r2 = await fetch(`${ORDERS_URL}?action=set-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ id, status: 'verified' })
        });
        const d2 = await r2.json();
        if (!r2.ok || !d2.ok) { toast(d2.error || 'Error', 'error'); restoreBtn(btn, original); return; }

        const day = (o.createdAt || '').slice(0, 10) || todayISO();
        if (!DB.days[day]) DB.days[day] = [];
        const already = DB.days[day].some(r => r.orderId === id);
        if (!already) {
            const pkgSummary = (o.packages || []).map(p => `${p.name} x${p.qty}`).join(' + ');
            DB.days[day].push({
                id: 'r-web-' + id,
                orderId: id,
                nombre: o.clientName || '—',
                telefono: o.phone || '',
                juego: o.gameTitle || '',
                recarga: pkgSummary,
                idUsuario: o.playerId || '',
                referencia: o.reference || '',
                banco: o.bank || '',
                monto: Number(o.totalLocal || 0),
                source: 'web',
                createdAt: o.createdAt || new Date().toISOString()
            });
            saveDB();
        }

        toast('Verificado y registrado');
        if (getCurrentDay() === day) renderRecords();
        loadOrders();
    } catch (e) {
        toast('Error: ' + e.message, 'error');
        restoreBtn(btn, original);
    }
}

async function setOrderStatus(id, status, btn) {
    const original = setBtnLoading(btn, 'Actualizando...');
    try {
        const res = await fetch(`${ORDERS_URL}?action=set-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ id, status })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) { toast(data.error || 'Error', 'error'); restoreBtn(btn, original); return; }
        toast('Estado actualizado');
        loadOrders();
    } catch (e) { toast('Error', 'error'); restoreBtn(btn, original); }
}

async function deleteOrder(id, btn) {
    if (!confirm('¿Eliminar este pedido?')) return;
    const original = setBtnLoading(btn, 'Eliminando...');
    try {
        const res = await fetch(`${ORDERS_URL}?action=delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) { toast(data.error || 'Error', 'error'); restoreBtn(btn, original); return; }
        toast('Eliminado');
        loadOrders();
    } catch (e) { toast('Error', 'error'); restoreBtn(btn, original); }
}

// ============ EXPORT ============
function exportXLSX() {
    const rows = getCurrentRecords().map((r, i) => ({
        'N°': i + 1,
        'Nombre': r.nombre || '',
        'Teléfono': r.telefono || '',
        'Juego': r.juego || '',
        'Recarga': r.recarga || '',
        'ID': r.idUsuario || '',
        'Referencia': r.referencia || '',
        'Banco': r.banco || '',
        'Origen': r.source || 'manual',
        'Monto (Bs.)': Number(r.monto) || 0
    }));
    if (!rows.length) { toast('No hay registros', 'error'); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 5 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 14 }];
    const total = rows.reduce((s, r) => s + (Number(r['Monto (Bs.)']) || 0), 0);
    XLSX.utils.sheet_add_aoa(ws, [['', '', '', '', '', '', '', '', 'TOTAL', total]], { origin: -1 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Planilla');
    XLSX.writeFile(wb, `X-Store_Planilla_${getCurrentDay()}.xlsx`);
    toast('Excel descargado');
}

// ============ TOAST ============
let toastTimer;
function toast(msg, type = 'success') {
    const t = document.getElementById('toast');
    document.getElementById('toastText').innerText = msg;
    const i = t.querySelector('i');
    i.setAttribute('data-lucide', type === 'error' ? 'alert-circle' : 'check-circle');
    i.className = type === 'error' ? 'w-5 h-5 text-rose-400' : 'w-5 h-5 text-emerald-500';
    t.classList.remove('hidden');
    lucide.createIcons();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', async () => {
    if (!await checkAuth()) return;
    loadDB();
    lucide.createIcons();

    document.getElementById('datePicker').value = todayISO();
    document.getElementById('datePicker').addEventListener('change', renderRecords);

    const monto = document.getElementById('fMonto');
    monto.addEventListener('blur', () => {
        const n = parseAmount(monto.value);
        if (n > 0 || monto.value.trim() !== '') monto.value = fmtAmount(n);
    });
    monto.addEventListener('focus', () => {
        const n = parseAmount(monto.value);
        monto.value = n > 0 ? String(n) : '';
    });

    ['fTel', 'fNombre', 'fRecarga', 'fIdUsuario', 'fReferencia', 'fMonto'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); saveRecord(); }
        });
    });

    setupAutocomplete();
    await loadLists();
    renderRecords();

    loadClients();
    loadOrders();

    document.getElementById('app').classList.remove('hidden');
    document.getElementById('loadingOverlay').classList.add('hidden');

    setInterval(() => { updatePedidosBadge(); }, 45000);
    setInterval(() => { if (!document.getElementById('panel-pedidos').classList.contains('hidden')) loadOrders(); }, 60000);
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeClientModal();
        closeImgModal();
    }
});
