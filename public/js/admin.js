/* =========================================================
   ADMIN.JS — Panel de administración X-Store
   ========================================================= */

const API_CONFIG = '/api/config';
const API_LISTS  = '/api/lists';
const AUTH_URL   = '/api/auth';

let config = { games:{}, paymentMethods:[], heroCards:[], maintenance:false };
let listsServer = { bancos:[], juegos:[] };
let editingGameKey = null;
let editingPaymentId = null;
let tempPackages = [];
let tempFields = [];
let tempQr = '';

const GRADIENT_OPTIONS = [
    { value:'from-amber-500/20 to-red-600/30', label:'🟠 Ámbar → Rojo' },
    { value:'from-blue-600/20 to-purple-600/30', label:'🔵 Azul → Púrpura' },
    { value:'from-cyan-600/20 to-blue-800/30', label:'🩵 Cian → Azul' },
    { value:'from-rose-600/20 to-orange-600/30', label:'🔴 Rosa → Naranja' },
    { value:'from-emerald-500/20 to-teal-600/30', label:'💚 Esmeralda → Teal' },
    { value:'from-fuchsia-600/20 to-pink-600/30', label:'💗 Fucsia → Rosa' },
    { value:'from-violet-600/20 to-indigo-600/30', label:'💜 Violeta → Índigo' },
    { value:'from-yellow-400/20 to-amber-600/30', label:'🟡 Amarillo → Ámbar' },
    { value:'from-slate-500/20 to-slate-800/40', label:'⚫ Gris → Negro' },
    { value:'from-cyber-cyan/20 to-cyber-magenta/30', label:'⚡ Cian → Magenta' }
];

function showLoading(text='Cargando...'){ document.getElementById('loadingText').innerText=text; document.getElementById('loadingOverlay').classList.remove('hidden'); }
function hideLoading(){ document.getElementById('loadingOverlay').classList.add('hidden'); }
function setSyncStatus(text, ok=true){ const d=document.getElementById('syncDot'); d.className=`w-1.5 h-1.5 rounded-full ${ok?'bg-emerald-400':'bg-rose-400'}`; document.getElementById('syncStatus').innerText=text; }
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toObject(input){ if(!input)return{}; if(Array.isArray(input)){ const o={}; Object.keys(input).forEach(k=>o[k]=input[k]); return o; } return typeof input==='object'?input:{}; }

document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();

    // Verificar auth
    try {
        const res = await fetch(`${AUTH_URL}?action=guard`);
        if (!res.ok){ location.replace('/login.html?next=admin.html'); return; }
        const data = await res.json();
        if (!data.ok){ location.replace('/login.html?next=admin.html'); return; }
    } catch(e){ location.replace('/login.html?next=admin.html'); return; }

    document.getElementById('adminApp').classList.remove('hidden');

    // Event listeners
    document.getElementById('gm-idEnabled')?.addEventListener('change', toggleIdOptionsUI);
    document.getElementById('gm-idMode')?.addEventListener('change', toggleIdOptionsUI);
    document.getElementById('pm-qr-url')?.addEventListener('input', updateQrPreview);
    document.getElementById('pm-qr-file')?.addEventListener('change', onQrFileSelected);

    await loadConfig();
    await loadListsAdmin();
    hideLoading();
    renderGamesAdmin();
    renderPaymentsAdmin();
    renderHeroAdmin();
    updateMaintenanceBtn();
    lucide.createIcons();
});

async function logout(){
    try { await fetch(`${AUTH_URL}?action=logout`, { method:'POST' }); } catch(e){}
    location.replace('/login.html');
}

async function loadConfig(){
    try {
        setSyncStatus('Sincronizando...', true);
        const res = await fetch(`${API_CONFIG}?t=${Date.now()}`, { cache:'no-cache' });
        if (!res.ok) throw new Error('HTTP '+res.status);
        const data = await res.json();
        config.games = toObject(data.games || {});
        config.paymentMethods = Array.isArray(data.paymentMethods) ? data.paymentMethods : [];
        config.maintenance = data.maintenance === true;
        config.heroCards = Array.isArray(data.heroCards) ? data.heroCards : [];
        setSyncStatus('Sincronizado', true);
    } catch(e){ setSyncStatus('Sin conexión', false); toast('Sin conexión', 'error'); }
}

async function saveConfig(){
    try {
        setSyncStatus('Guardando...', true);
        const res = await fetch(API_CONFIG, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
                games: config.games,
                paymentMethods: config.paymentMethods,
                maintenance: config.maintenance,
                heroCards: config.heroCards
            })
        });
        if (!res.ok) throw new Error('HTTP '+res.status);
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Error');
        setSyncStatus('Sincronizado', true);
        return true;
    } catch(e){ setSyncStatus('Error', false); toast('Error al guardar: '+e.message, 'error'); return false; }
}

async function reloadFromServer(){
    if(!confirm('¿Recargar desde el servidor? Se perderán cambios sin guardar.'))return;
    showLoading('Recargando...');
    await loadConfig(); await loadListsAdmin();
    hideLoading(); renderGamesAdmin(); renderPaymentsAdmin(); renderHeroAdmin(); updateMaintenanceBtn();
    toast('Recargado');
}

function switchTab(tab){
    ['games','payments','lists','hero','backup'].forEach(t=>{
        document.getElementById('panel-'+t).classList.toggle('hidden', t!==tab);
        const btn=document.getElementById('tab-'+t);
        if(t===tab){ btn.classList.add('text-cyber-cyan','border-b-2','border-cyber-cyan'); btn.classList.remove('text-gray-400'); }
        else { btn.classList.remove('text-cyber-cyan','border-b-2','border-cyber-cyan'); btn.classList.add('text-gray-400'); }
    });
    lucide.createIcons();
}

// ============ LISTAS ============
async function loadListsAdmin(){
    try {
        const res = await fetch(`${API_LISTS}?t=${Date.now()}`, { cache:'no-cache' });
        const data = await res.json();
        listsServer.bancos = Array.isArray(data.bancos) ? data.bancos : [];
        listsServer.juegos = Array.isArray(data.juegos) ? data.juegos : [];
        renderListsAdmin();
    } catch(e){ toast('Error al cargar listas','error'); }
}
function renderListsAdmin(){
    document.getElementById('adminBancosCount').innerText = listsServer.bancos.length + ' items';
    document.getElementById('adminJuegosCount').innerText = listsServer.juegos.length + ' items';
    document.getElementById('adminBancosList').innerHTML = listsServer.bancos.map((b,i)=>`
        <div class="list-item">
            <input type="text" value="${escapeHtml(b)}" onchange="updateListItemAdmin('bancos',${i},this.value)">
            <button onclick="moveItemAdmin('bancos',${i},-1)" class="mini-btn bg-slate-800 text-gray-400 ${i===0?'opacity-30 pointer-events-none':''}"><i data-lucide="chevron-up" class="w-3.5 h-3.5"></i></button>
            <button onclick="moveItemAdmin('bancos',${i},1)" class="mini-btn bg-slate-800 text-gray-400 ${i===listsServer.bancos.length-1?'opacity-30 pointer-events-none':''}"><i data-lucide="chevron-down" class="w-3.5 h-3.5"></i></button>
            <button onclick="removeListItemAdmin('bancos',${i})" class="mini-btn bg-rose-500/10 text-rose-400 border border-rose-500/30"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </div>`).join('') || '<p class="text-xs text-gray-500 italic text-center py-4">Sin bancos.</p>';
    document.getElementById('adminJuegosList').innerHTML = listsServer.juegos.map((j,i)=>`
        <div class="list-item">
            <input type="text" value="${escapeHtml(j)}" onchange="updateListItemAdmin('juegos',${i},this.value)">
            <button onclick="moveItemAdmin('juegos',${i},-1)" class="mini-btn bg-slate-800 text-gray-400 ${i===0?'opacity-30 pointer-events-none':''}"><i data-lucide="chevron-up" class="w-3.5 h-3.5"></i></button>
            <button onclick="moveItemAdmin('juegos',${i},1)" class="mini-btn bg-slate-800 text-gray-400 ${i===listsServer.juegos.length-1?'opacity-30 pointer-events-none':''}"><i data-lucide="chevron-down" class="w-3.5 h-3.5"></i></button>
            <button onclick="removeListItemAdmin('juegos',${i})" class="mini-btn bg-rose-500/10 text-rose-400 border border-rose-500/30"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </div>`).join('') || '<p class="text-xs text-gray-500 italic text-center py-4">Sin juegos.</p>';
    lucide.createIcons();
}
function updateListItemAdmin(key,idx,val){
    const t = val.trim();
    if (!t){ toast('No puede estar vacío','error'); renderListsAdmin(); return; }
    if (listsServer[key].some((x,i)=>i!==idx && x.toLowerCase()===t.toLowerCase())){ toast('Ya existe','error'); renderListsAdmin(); return; }
    listsServer[key][idx] = t; renderListsAdmin();
}
function moveItemAdmin(key,idx,delta){
    const arr=listsServer[key]; const j=idx+delta;
    if (j<0||j>=arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    renderListsAdmin();
}
function removeListItemAdmin(key,idx){ if(!confirm('¿Eliminar?'))return; listsServer[key].splice(idx,1); renderListsAdmin(); }
function adminAddBanco(){
    const i = document.getElementById('adminNewBanco'); const v = i.value.trim(); if(!v)return;
    if (listsServer.bancos.some(b=>b.toLowerCase()===v.toLowerCase())){ toast('Ya existe','error'); return; }
    listsServer.bancos.push(v); i.value=''; renderListsAdmin();
}
function adminAddJuego(){
    const i = document.getElementById('adminNewJuego'); const v = i.value.trim(); if(!v)return;
    if (listsServer.juegos.some(j=>j.toLowerCase()===v.toLowerCase())){ toast('Ya existe','error'); return; }
    listsServer.juegos.push(v); i.value=''; renderListsAdmin();
}
async function saveListsAdmin(){
    if (listsServer.bancos.length===0 || listsServer.juegos.length===0){ toast('Debe haber al menos 1 banco y 1 juego','error'); return; }
    try {
        const res = await fetch(`${API_LISTS}?action=save`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ bancos: listsServer.bancos, juegos: listsServer.juegos })
        });
        const data = await res.json();
        if (!res.ok || !data.ok){ toast(data.error||'Error','error'); return; }
        listsServer.bancos = data.lists.bancos;
        listsServer.juegos = data.lists.juegos;
        renderListsAdmin(); toast('Listas guardadas');
    } catch(e){ toast('Error de conexión','error'); }
}
async function reloadListsAdmin(){ if(!confirm('¿Recargar?'))return; await loadListsAdmin(); toast('Listas recargadas'); }

// ============ JUEGOS ============
function renderGamesAdmin(){
    const c = document.getElementById('gamesAdminList'); c.innerHTML='';
    const keys = Object.keys(config.games);
    if (keys.length===0){ c.innerHTML='<div class="glass-card p-8 rounded-2xl text-center text-gray-400">No hay juegos.</div>'; return; }
    keys.forEach(key => {
        const g = config.games[key];
        const idInfo = (g.idEnabled===false||g.idMode==='no_id') ? '<span class="text-amber-400">Sin ID</span>' : (g.idMode==='id_server'?'<span class="text-purple-300">ID+Server</span>':'<span class="text-cyber-cyan">Solo ID</span>');
        const pausedBadge = g.paused?'<span class="bg-amber-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full ml-2">⏸</span>':'';
        const discBadge = (g.discount>0 && !g.paused)?`<span class="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full ml-2">-${g.discount}%</span>`:'';
        const tagsHtml = (g.tags||[]).map(t=>`<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/30">${escapeHtml(t)}</span>`).join('');
        const logoHtml = g.logo?`<img src="${g.logo}" class="w-10 h-10 rounded-lg object-cover border border-slate-700">`:`<span class="text-2xl">${g.icon}</span>`;
        const card = document.createElement('div');
        card.className='glass-card rounded-2xl p-5 flex flex-col md:flex-row gap-4 items-center'+(g.paused?' opacity-70':'');
        card.innerHTML = `
            <div class="w-24 h-20 rounded-xl bg-cover bg-center shrink-0 border border-slate-700" style="background-image:url('${g.cover}')"></div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                    ${logoHtml}<h3 class="font-orbitron font-bold text-white truncate">${escapeHtml(g.title)}</h3>
                    <span class="text-[10px] font-mono text-gray-500 bg-slate-800 px-2 py-0.5 rounded">${key}</span>${pausedBadge}${discBadge}
                </div>
                <p class="text-xs text-gray-400 mt-1 truncate">${escapeHtml(g.description||'')}</p>
                <div class="flex gap-1 mt-1 flex-wrap">${tagsHtml}</div>
                <p class="text-[11px] mt-1">${(g.packages||[]).length} paquete(s) · ${idInfo}</p>
            </div>
            <div class="flex gap-2 flex-wrap">
                <button onclick="togglePause('${key}')" class="${g.paused?'bg-emerald-500/10 text-emerald-400 border-emerald-500/30':'bg-amber-500/10 text-amber-400 border-amber-500/30'} px-3 py-2 rounded-lg border font-orbitron text-xs font-bold flex items-center gap-1.5">
                    <i data-lucide="${g.paused?'play':'pause'}" class="w-3.5 h-3.5"></i> ${g.paused?'Reactivar':'Pausar'}
                </button>
                <button onclick="openGameModal('${key}')" class="px-3 py-2 rounded-lg bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/30 font-orbitron text-xs font-bold flex items-center gap-1.5">
                    <i data-lucide="pencil" class="w-3.5 h-3.5"></i> Editar
                </button>
            </div>`;
        c.appendChild(card);
    });
    lucide.createIcons();
}
async function togglePause(key){
    const g = config.games[key]; if(!g) return;
    if (!confirm(`¿${g.paused?'Reactivar':'Pausar'} "${g.title}"?`)) return;
    g.paused = !g.paused;
    if (await saveConfig()){ renderGamesAdmin(); toast(g.paused?'Pausado':'Reactivado'); }
}
function openGameModal(key=null){
    editingGameKey = key;
    const dbtn = document.getElementById('deleteGameBtn');
    if (key){
        const g = config.games[key];
        document.getElementById('gameModalTitle').innerText='Editar: '+g.title;
        document.getElementById('gm-key').value=key;
        document.getElementById('gm-title').value=g.title;
        document.getElementById('gm-icon').value=g.icon;
        document.getElementById('gm-logo').value=g.logo||'';
        document.getElementById('gm-discount').value=g.discount||0;
        document.getElementById('gm-minId').value=g.minIdLength||8;
        document.getElementById('gm-cover').value=g.cover||'';
        document.getElementById('gm-desc').value=g.description||'';
        document.getElementById('gm-tags').value=(g.tags||[]).join(', ');
        document.getElementById('gm-idMode').value=g.idMode||'id';
        document.getElementById('gm-idEnabled').checked=g.idEnabled!==false;
        tempPackages = JSON.parse(JSON.stringify(g.packages||[]));
        dbtn.classList.remove('hidden');
    } else {
        document.getElementById('gameModalTitle').innerText='Nuevo Juego';
        document.getElementById('gm-key').value='(auto)';
        document.getElementById('gm-title').value='';
        document.getElementById('gm-icon').value='🎮';
        document.getElementById('gm-logo').value='';
        document.getElementById('gm-discount').value=0;
        document.getElementById('gm-minId').value=8;
        document.getElementById('gm-cover').value='';
        document.getElementById('gm-desc').value='';
        document.getElementById('gm-tags').value='';
        document.getElementById('gm-idMode').value='id';
        document.getElementById('gm-idEnabled').checked=true;
        tempPackages = [];
        dbtn.classList.add('hidden');
    }
    toggleIdOptionsUI(); renderPackagesEditor();
    document.getElementById('gameModal').classList.remove('hidden');
    document.body.style.overflow='hidden';
    lucide.createIcons();
}
function closeGameModal(){ document.getElementById('gameModal').classList.add('hidden'); document.body.style.overflow=''; editingGameKey=null; tempPackages=[]; }
function toggleIdOptionsUI(){
    const en=document.getElementById('gm-idEnabled').checked;
    const md=document.getElementById('gm-idMode').value;
    const w=document.getElementById('gm-idOptions');
    const m=document.getElementById('gm-minIdWrap');
    if(!en) w.classList.add('opacity-40','pointer-events-none'); else w.classList.remove('opacity-40','pointer-events-none');
    if(en && md!=='no_id') m.classList.remove('hidden'); else m.classList.add('hidden');
}
function renderPackagesEditor(){
    const c=document.getElementById('packagesContainer'); c.innerHTML='';
    if(tempPackages.length===0){ c.innerHTML='<p class="text-xs text-gray-500 italic text-center py-4">Sin paquetes.</p>'; return; }
    tempPackages.forEach((pkg,idx)=>{
        const row=document.createElement('div');
        row.className='flex gap-2 items-center bg-black/40 border border-slate-800 rounded-xl p-2';
        row.innerHTML=`
            <input type="text" class="input-field flex-1 text-xs" value="${(pkg.name||'').replace(/"/g,'&quot;')}" onchange="updatePkg(${idx},'name',this.value)">
            <input type="number" step="0.01" min="0" class="input-field w-28 text-xs font-mono" value="${pkg.price}" onchange="updatePkg(${idx},'price',parseFloat(this.value))">
            <span class="text-[10px] text-gray-500">USDT</span>
            <button onclick="removePkg(${idx})" class="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`;
        c.appendChild(row);
    });
    lucide.createIcons();
}
function addPackageRow(){ tempPackages.push({ id:'pkg-'+Date.now()+'-'+Math.random().toString(36).slice(2,6), name:'Nuevo paquete', price:1.00 }); renderPackagesEditor(); }
function updatePkg(idx,f,v){ if(tempPackages[idx]) tempPackages[idx][f]=v; }
function removePkg(idx){ tempPackages.splice(idx,1); renderPackagesEditor(); }
async function saveGame(){
    const title=document.getElementById('gm-title').value.trim();
    const icon=document.getElementById('gm-icon').value.trim()||'🎮';
    const logo=document.getElementById('gm-logo').value.trim();
    const discount=Math.max(0,Math.min(99,parseInt(document.getElementById('gm-discount').value)||0));
    const minId=parseInt(document.getElementById('gm-minId').value)||8;
    const cover=document.getElementById('gm-cover').value.trim();
    const desc=document.getElementById('gm-desc').value.trim();
    const tagsRaw=document.getElementById('gm-tags').value.trim();
    const tags=tagsRaw?tagsRaw.split(',').map(t=>t.trim()).filter(Boolean):[];
    const idMode=document.getElementById('gm-idMode').value;
    const idEnabled=document.getElementById('gm-idEnabled').checked;

    if(!title){ toast('Nombre obligatorio','error'); return; }
    if(tempPackages.length===0){ toast('Agrega paquetes','error'); return; }

    let key=editingGameKey;
    if(!key){ key=title.toLowerCase().replace(/[^a-z0-9]/g,'')||('game'+Date.now()); let base=key,i=1; while(config.games[key]){ key=base+i; i++; } }
    const existingPaused = editingGameKey && config.games[editingGameKey] ? config.games[editingGameKey].paused : false;
    const safePackages = tempPackages.map(p=>({
        id: p.id || ('pkg-'+Date.now()+'-'+Math.random().toString(36).slice(2,6)),
        name: String(p.name||'Sin nombre').trim()||'Sin nombre',
        price: (isFinite(Number(p.price))&&Number(p.price)>0)?Number(p.price):0.01
    }));
    config.games[key]={ title, icon, minIdLength:minId, cover, description:desc, logo, tags, idMode:idEnabled?idMode:'no_id', idEnabled, paused: existingPaused||false, discount, packages:safePackages };

    const btn=document.getElementById('saveGameBtn');
    btn.disabled=true; btn.innerText='GUARDANDO...';
    const ok=await saveConfig();
    btn.disabled=false; btn.innerText='GUARDAR';
    if(ok){ renderGamesAdmin(); closeGameModal(); toast('Guardado'); }
}
async function deleteGame(){
    if(!editingGameKey) return;
    if(!confirm(`¿Eliminar "${config.games[editingGameKey].title}"?`)) return;
    delete config.games[editingGameKey];
    if(await saveConfig()){ renderGamesAdmin(); closeGameModal(); toast('Eliminado'); }
}

// ============ PAGOS ============
function renderPaymentsAdmin(){
    const c=document.getElementById('paymentsAdminList'); c.innerHTML='';
    if(config.paymentMethods.length===0){ c.innerHTML='<div class="glass-card p-8 rounded-2xl text-center text-gray-400">No hay métodos.</div>'; return; }
    config.paymentMethods.forEach(pm=>{
        const qrBadge = pm.qr ? '<span class="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full">QR ✓</span>' : '';
        const card=document.createElement('div');
        card.className='glass-card rounded-2xl p-4 flex items-center gap-4'+(!pm.enabled?' opacity-60':'');
        card.innerHTML=`
            <div class="w-12 h-12 rounded-xl bg-cyber-cyan/10 border border-cyber-cyan/30 flex items-center justify-center text-2xl shrink-0">${pm.icon}</div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                    <h3 class="font-orbitron font-bold text-white">${escapeHtml(pm.name)}</h3>
                    <span class="text-[10px] font-mono text-gray-500 bg-slate-800 px-2 py-0.5 rounded">${escapeHtml(pm.code)}</span>
                    ${!pm.enabled?'<span class="text-[10px] bg-slate-700 text-gray-300 px-2 py-0.5 rounded-full">Off</span>':''}
                    ${qrBadge}
                </div>
                <p class="text-xs text-gray-400 mt-1">${(pm.fields||[]).length} campos · Tasa: 1 USDT = ${pm.rate} ${escapeHtml(pm.label)}</p>
            </div>
            <button onclick="openPaymentModal('${pm.id}')" class="px-3 py-2 rounded-lg bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/30 font-orbitron text-xs font-bold flex items-center gap-1.5">
                <i data-lucide="pencil" class="w-3.5 h-3.5"></i> Editar
            </button>`;
        c.appendChild(card);
    });
    lucide.createIcons();
}
function openPaymentModal(id=null){
    editingPaymentId=id;
    const dbtn=document.getElementById('deletePaymentBtn');
    if(id){
        const pm=config.paymentMethods.find(p=>p.id===id); if(!pm)return;
        document.getElementById('paymentModalTitle').innerText='Editar: '+pm.name;
        document.getElementById('pm-name').value=pm.name;
        document.getElementById('pm-icon').value=pm.icon;
        document.getElementById('pm-code').value=pm.code;
        document.getElementById('pm-label').value=pm.label;
        document.getElementById('pm-symbol').value=pm.symbol;
        document.getElementById('pm-decimals').value=pm.decimals;
        document.getElementById('pm-rate').value=pm.rate||1;
        document.getElementById('pm-enabled').checked=pm.enabled!==false;
        document.getElementById('pm-askReference').checked=pm.askReference!==false;
        document.getElementById('pm-askBank').checked=pm.askBank!==false;
        document.getElementById('pm-askCapture').checked=pm.askCapture!==false;
        document.getElementById('pm-qr-url').value = (pm.qr && !pm.qr.startsWith('data:')) ? pm.qr : '';
        document.getElementById('pm-qr-file').value = '';
        tempQr = pm.qr || '';
        updateQrPreview();
        tempFields = JSON.parse(JSON.stringify(pm.fields||[]));
        dbtn.classList.remove('hidden');
    } else {
        document.getElementById('paymentModalTitle').innerText='Nuevo Método';
        document.getElementById('pm-name').value='';
        document.getElementById('pm-icon').value='💵';
        document.getElementById('pm-code').value='';
        document.getElementById('pm-label').value='';
        document.getElementById('pm-symbol').value='$';
        document.getElementById('pm-decimals').value=2;
        document.getElementById('pm-rate').value=1;
        document.getElementById('pm-enabled').checked=true;
        document.getElementById('pm-askReference').checked=true;
        document.getElementById('pm-askBank').checked=true;
        document.getElementById('pm-askCapture').checked=true;
        document.getElementById('pm-qr-url').value='';
        document.getElementById('pm-qr-file').value='';
        tempQr = '';
        updateQrPreview();
        tempFields=[];
        dbtn.classList.add('hidden');
    }
    renderFieldsEditor();
    document.getElementById('paymentModal').classList.remove('hidden');
    document.body.style.overflow='hidden';
    lucide.createIcons();
}
function closePaymentModal(){ document.getElementById('paymentModal').classList.add('hidden'); document.body.style.overflow=''; editingPaymentId=null; tempFields=[]; tempQr=''; }

function updateQrPreview(){
    const url = (document.getElementById('pm-qr-url').value || '').trim();
    const img = document.getElementById('pm-qr-preview');
    const empty = document.getElementById('pm-qr-empty');
    let src = '';
    if (tempQr && tempQr.startsWith('data:')) src = tempQr;
    else if (url) src = url;
    else if (tempQr) src = tempQr;
    if (src){
        img.src = src; img.classList.remove('hidden'); empty.classList.add('hidden');
    } else {
        img.src=''; img.classList.add('hidden'); empty.classList.remove('hidden');
    }
}
function onQrFileSelected(ev){
    const file = ev.target.files[0]; if (!file) return;
    if (!file.type.startsWith('image/')){ toast('Solo imágenes','error'); return; }
    if (file.size > 3*1024*1024){ toast('Imagen muy grande (máx 3MB)','error'); return; }
    compressImage(file, 600, 0.8).then(dataUrl=>{
        tempQr = dataUrl;
        document.getElementById('pm-qr-url').value = '';
        updateQrPreview();
        toast('QR cargado');
    });
}
function removeQr(){
    tempQr = '';
    document.getElementById('pm-qr-url').value = '';
    document.getElementById('pm-qr-file').value = '';
    updateQrPreview();
    toast('QR eliminado');
}
function compressImage(file, maxDim, quality){
    return new Promise(resolve=>{
        const reader = new FileReader();
        reader.onload = e=>{
            const img = new Image();
            img.onload = ()=>{
                let w = img.width, h = img.height;
                if (w>h && w>maxDim){ h = h*(maxDim/w); w = maxDim; }
                else if (h>w && h>maxDim){ w = w*(maxDim/h); h = maxDim; }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}
function renderFieldsEditor(){
    const c=document.getElementById('fieldsContainer'); c.innerHTML='';
    if(tempFields.length===0){ c.innerHTML='<p class="text-xs text-gray-500 italic text-center py-3">Sin campos (opcional)</p>'; return; }
    tempFields.forEach((f,idx)=>{
        const row=document.createElement('div');
        row.className='flex gap-2 items-center bg-black/40 border border-slate-800 rounded-xl p-2';
        row.innerHTML=`
            <input type="text" class="input-field flex-1 text-xs" placeholder="Etiqueta" value="${(f.label||'').replace(/"/g,'&quot;')}" onchange="updateField(${idx},'label',this.value)">
            <input type="text" class="input-field flex-1 text-xs font-mono" placeholder="Valor" value="${(f.value||'').replace(/"/g,'&quot;')}" onchange="updateField(${idx},'value',this.value)">
            <button onclick="removeField(${idx})" class="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`;
        c.appendChild(row);
    });
    lucide.createIcons();
}
function addFieldRow(){ tempFields.push({label:'',value:''}); renderFieldsEditor(); }
function updateField(i,f,v){ if(tempFields[i]) tempFields[i][f]=v; }
function removeField(i){ tempFields.splice(i,1); renderFieldsEditor(); }
async function savePayment(){
    const name=document.getElementById('pm-name').value.trim();
    const icon=document.getElementById('pm-icon').value.trim()||'💳';
    const code=document.getElementById('pm-code').value.trim().toUpperCase();
    const label=document.getElementById('pm-label').value.trim()||code;
    const symbol=document.getElementById('pm-symbol').value.trim()||'$';
    const decimals=parseInt(document.getElementById('pm-decimals').value)||0;
    const rateVal=parseFloat(document.getElementById('pm-rate').value);
    const enabled=document.getElementById('pm-enabled').checked;
    const askReference=document.getElementById('pm-askReference').checked;
    const askBank=document.getElementById('pm-askBank').checked;
    const askCapture=document.getElementById('pm-askCapture').checked;
    const qrUrl=(document.getElementById('pm-qr-url').value||'').trim();
    let qr = tempQr || '';
    if (qrUrl){ qr = qrUrl; }
    if(!name||!code){ toast('Nombre y código obligatorios','error'); return; }
    if(isNaN(rateVal)||rateVal<=0){ toast('Tasa inválida','error'); return; }
    const cleanFields = tempFields.filter(f=>f.label.trim()!=='');
    if(editingPaymentId){
        const pm=config.paymentMethods.find(p=>p.id===editingPaymentId);
        if(pm){ Object.assign(pm,{ name,icon,code,label,symbol,decimals,enabled,rate:rateVal,fields:cleanFields,askReference,askBank,askCapture,qr }); }
    } else {
        config.paymentMethods.push({ id:'pm-'+Date.now(), name,icon,code,label,symbol,decimals,enabled,rate:rateVal,fields:cleanFields,askReference,askBank,askCapture,qr });
    }
    if(await saveConfig()){ renderPaymentsAdmin(); closePaymentModal(); toast('Guardado'); }
}
async function deletePayment(){
    if(!editingPaymentId)return;
    if(!confirm('¿Eliminar este método?'))return;
    config.paymentMethods=config.paymentMethods.filter(p=>p.id!==editingPaymentId);
    if(await saveConfig()){ renderPaymentsAdmin(); closePaymentModal(); toast('Eliminado'); }
}

// ============ HERO ============
function renderHeroAdmin(){
    const c=document.getElementById('heroAdminList'); if(!c)return; c.innerHTML='';
    (config.heroCards||[]).forEach((card,idx)=>{
        const prev = card.image ? `<img src="${card.image}" class="w-16 h-16 object-cover rounded-xl" onerror="this.outerHTML='<span class=\\'text-4xl\\'>${card.emoji}</span>'">` : `<span class="text-4xl">${card.emoji}</span>`;
        const row=document.createElement('div');
        row.className='glass-card rounded-2xl p-5 space-y-4';
        row.innerHTML=`
            <div class="flex items-center justify-between">
                <h4 class="font-orbitron font-bold text-white">Tarjeta ${idx+1}</h4>
                <div class="w-20 h-20 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center overflow-hidden">${prev}</div>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div><label class="block text-[10px] font-orbitron font-bold text-gray-300 uppercase mb-1">Emoji</label><input type="text" class="input-field text-sm" maxlength="4" value="${card.emoji}" onchange="updateHeroCard(${idx},'emoji',this.value)"></div>
                <div><label class="block text-[10px] font-orbitron font-bold text-gray-300 uppercase mb-1">Margen px</label><input type="number" class="input-field font-mono text-sm" step="4" min="-40" max="40" value="${card.marginTop}" onchange="updateHeroCard(${idx},'marginTop',parseInt(this.value)||0)"></div>
            </div>
            <div><label class="block text-[10px] font-orbitron font-bold text-gray-300 uppercase mb-1">URL imagen</label><input type="url" class="input-field font-mono text-xs" value="${(card.image||'').replace(/"/g,'&quot;')}" onchange="updateHeroCard(${idx},'image',this.value)"></div>
            <div><label class="block text-[10px] font-orbitron font-bold text-gray-300 uppercase mb-1">Gradiente</label>
                <select class="input-field text-sm" onchange="updateHeroCard(${idx},'gradient',this.value)">
                    ${GRADIENT_OPTIONS.map(o=>`<option value="${o.value}" ${o.value===card.gradient?'selected':''}>${o.label}</option>`).join('')}
                </select>
            </div>`;
        c.appendChild(row);
    });
    lucide.createIcons();
}
function updateHeroCard(i,f,v){ if(!config.heroCards[i])return; config.heroCards[i][f]=v; renderHeroAdmin(); }
async function saveHero(){ const b=document.getElementById('saveHeroBtn'); b.disabled=true; const o=b.innerHTML; b.innerHTML='GUARDANDO...'; const ok=await saveConfig(); b.disabled=false; b.innerHTML=o; lucide.createIcons(); if(ok) toast('Hero actualizado'); }

// ============ MANTENIMIENTO ============
async function toggleMaintenance(){
    const a=!config.maintenance;
    if(!confirm(a?'¿Activar mantenimiento?':'¿Desactivar?'))return;
    config.maintenance=a;
    if(await saveConfig()){ updateMaintenanceBtn(); toast(a?'Mantenimiento ON':'Mantenimiento OFF'); }
}
function updateMaintenanceBtn(){
    const b=document.getElementById('maintenanceBtn');
    const t=document.getElementById('maintenanceBtnText');
    if(!b || !t) return;
    if(config.maintenance){ b.className='px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-xs font-orbitron text-black border border-amber-500 flex items-center gap-1.5'; t.innerText='ON'; }
    else { b.className='px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-orbitron text-white border border-slate-700 flex items-center gap-1.5'; t.innerText='Mantenimiento'; }
}

// ============ BACKUP ============
function exportConfig(){
    const blob=new Blob([JSON.stringify(config,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`xstore-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url); toast('Descargado');
}
async function importConfig(){
    const f=document.getElementById('importFile').files[0]; if(!f){ toast('Selecciona archivo','error'); return; }
    const r=new FileReader();
    r.onload=async(e)=>{
        try {
            const p=JSON.parse(e.target.result);
            if(!p.games) throw new Error('Formato inválido');
            if(!confirm('¿Reemplazar la config actual?'))return;
            config = { ...config, ...p };
            if(await saveConfig()){ renderGamesAdmin(); renderPaymentsAdmin(); renderHeroAdmin(); updateMaintenanceBtn(); document.getElementById('importFile').value=''; toast('Importado'); }
        } catch(err){ toast('Inválido: '+err.message,'error'); }
    };
    r.readAsText(f);
}

// ============ TOAST ============
let toastTimer;
function toast(msg,type='success'){
    const t=document.getElementById('toast');
    document.getElementById('toastText').innerText=msg;
    const i=t.querySelector('i');
    i.setAttribute('data-lucide', type==='error'?'alert-circle':'check-circle');
    i.className = type==='error'?'w-5 h-5 text-rose-400':'w-5 h-5 text-emerald-400';
    t.classList.remove('hidden'); lucide.createIcons();
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.add('hidden'),3000);
}

document.addEventListener('keydown', e=>{
    if(e.key==='Escape'){
        if(!document.getElementById('gameModal').classList.contains('hidden')) closeGameModal();
        if(!document.getElementById('paymentModal').classList.contains('hidden')) closePaymentModal();
    }
});
