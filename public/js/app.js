/* =========================================================
   APP — Estado, login, modal, órdenes, WhatsApp
   ========================================================= */

const WHATSAPP_NUMBER = '584165570405';
const CLIENT_KEY = 'xstore_client_v1';

// ---------- Estado global ----------
let paymentMethods = [];
let gameData = {};
let maintenanceMode = false;
let config_heroCards = [];
let client = null;
let bancosList = [];

let currentOrder = {
  gameKey: null, playerId: '', serverId: '',
  packages: [], paymentMethod: '', reference: '', bank: '', capture: null
};
let currentStep = 1;
const TOTAL_STEPS = 2;

const FALLBACK_CONFIG = {
  paymentMethods: [
    { id: 'pm-1', name: 'Pago Móvil', code: 'VES', label: 'Bs.', symbol: 'Bs.', decimals: 2, icon: '🇻🇪', enabled: true, rate: 40,
      fields: [{ label: 'Banco', value: 'Mercantil' }, { label: 'Teléfono', value: '0414-1234567' }, { label: 'Cédula', value: 'V-12345678' }],
      askReference: true, askBank: true, askCapture: true, qr: '' }
  ],
  maintenance: false,
  heroCards: [
    { id: 'card-1', image: '', emoji: '💎', gradient: 'from-amber-500/20 to-red-600/30', marginTop: 0 },
    { id: 'card-2', image: '', emoji: '🔷', gradient: 'from-blue-600/20 to-purple-600/30', marginTop: 16 },
    { id: 'card-3', image: '', emoji: '🪙', gradient: 'from-cyan-600/20 to-blue-800/30', marginTop: -8 },
    { id: 'card-4', image: '', emoji: '🥇', gradient: 'from-rose-600/20 to-orange-600/30', marginTop: 8 }
  ],
  games: {}
};

// ============ CLIENTE ============
function loadClientFromStorage() {
  try {
    const raw = localStorage.getItem(CLIENT_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (c && c.phone) return c;
  } catch (e) {}
  return null;
}
function saveClientToStorage(c) {
  try { localStorage.setItem(CLIENT_KEY, JSON.stringify(c)); } catch (e) {}
}
function clearClientStorage() {
  try { localStorage.removeItem(CLIENT_KEY); } catch (e) {}
}

function showPhoneLogin() { document.getElementById('phoneLoginScreen').classList.remove('hidden'); }
function hidePhoneLogin() { document.getElementById('phoneLoginScreen').classList.add('hidden'); }
function hideNotRegistered() { document.getElementById('notRegisteredScreen').classList.add('hidden'); }

function showNotRegistered(phone) {
  document.getElementById('notRegisteredScreen').classList.remove('hidden');
  const msg = `Hola, quiero registrarme en X-Store.%0A%0AMi número es: ${phone}`;
  document.getElementById('waRequestLink').href = `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
}

function resetLogin() {
  hideNotRegistered();
  const inp = document.getElementById('loginPhone');
  if (inp) inp.value = '';
  const st = document.getElementById('phoneStatus');
  if (st) st.classList.add('hidden');
  const btn = document.getElementById('phoneLoginBtn');
  if (btn) btn.disabled = true;
  showPhoneLogin();
}

async function doPhoneLogin() {
  const phone = normalizePhone(document.getElementById('loginPhone').value);
  if (phone.length < 8) return;
  const btn = document.getElementById('phoneLoginBtn');
  btn.disabled = true;
  btn.innerHTML = 'VERIFICANDO...';
  try {
    const data = await API.lookupClient(phone);
    if (data.found) {
      client = {
        phone: data.client.phone,
        firstName: data.client.firstName,
        lastName: data.client.lastName
      };
      saveClientToStorage(client);
      hidePhoneLogin();
      hideNotRegistered();
      updateClientBadge();
    } else {
      hidePhoneLogin();
      showNotRegistered(phone);
    }
  } catch (e) {
    const st = document.getElementById('phoneStatus');
    st.classList.remove('hidden');
    st.className = 'text-[11px] mt-1.5 text-rose-400';
    st.innerText = 'Error de conexión';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="log-in" class="w-5 h-5"></i><span>CONTINUAR</span>';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

function logoutClient() {
  if (!confirm('¿Cerrar sesión en este dispositivo?')) return;
  client = null;
  clearClientStorage();
  const el = document.getElementById('clientBadge');
  el.classList.add('hidden');
  el.classList.remove('flex');
  resetLogin();
}

function updateClientBadge() {
  if (!client) return;
  const el = document.getElementById('clientBadge');
  el.classList.remove('hidden');
  el.classList.add('flex');
  const name = `${client.firstName || ''} ${client.lastName || ''}`.trim() || client.phone;
  document.getElementById('clientNameBadge').innerText = name;
}

// ============ CONFIG ============
async function fetchConfig() {
  try {
    const cfg = await API.getConfig();
    applyConfig(cfg);
  } catch (e) {
    console.error('Config error', e);
    if (!gameData || Object.keys(gameData).length === 0) applyConfig(FALLBACK_CONFIG);
  }
}

async function fetchLists() {
  try {
    const data = await API.getLists();
    bancosList = Array.isArray(data.bancos) ? data.bancos : [];
  } catch (e) {
    bancosList = [];
  }
}

function applyConfig(cfg) {
  maintenanceMode = cfg.maintenance === true;
  const ms = document.getElementById('maintenanceScreen');
  if (maintenanceMode) {
    ms.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    return;
  }
  ms.classList.add('hidden');
  document.body.style.overflow = '';

  paymentMethods = (cfg.paymentMethods && cfg.paymentMethods.length)
    ? cfg.paymentMethods
    : FALLBACK_CONFIG.paymentMethods;

  paymentMethods.forEach(pm => {
    if (typeof pm.rate !== 'number' || pm.rate <= 0) pm.rate = 1;
    if (!Array.isArray(pm.fields)) pm.fields = [];
    if (typeof pm.qr !== 'string') pm.qr = '';
  });

  const games = toObject(cfg.games);
  Object.keys(games).forEach(k => {
    const g = games[k];
    if (typeof g.idEnabled !== 'boolean') g.idEnabled = true;
    if (!g.idMode) g.idMode = 'id';
    if (typeof g.paused !== 'boolean') g.paused = false;
    if (typeof g.discount !== 'number') g.discount = 0;
    if (typeof g.logo !== 'string') g.logo = '';
    if (!Array.isArray(g.tags)) g.tags = [];
    g.packages = (g.packages || []).map(p => ({
      id: p.id || ('pkg-' + Math.random().toString(36).slice(2, 8)),
      name: String(p.name || 'Sin nombre'),
      price: (isFinite(Number(p.price)) && Number(p.price) > 0) ? Number(p.price) : 0.01
    }));
  });
  gameData = games;

  config_heroCards = (cfg.heroCards && cfg.heroCards.length === 4)
    ? cfg.heroCards
    : FALLBACK_CONFIG.heroCards;

  if (document.getElementById('gamesGrid')) {
    renderHeroCards();
    renderGameCards();
    renderPaymentMethodsPublic();
  }
}

// ============ MODAL ============
function openRechargeModal(key) {
  const data = gameData[key];
  if (!data) return;
  if (!client) { showPhoneLogin(); return; }

  currentOrder = {
    gameKey: key, playerId: '', serverId: '',
    packages: [], paymentMethod: '', reference: '', bank: '', capture: null
  };

  document.getElementById('modalGameTitle').innerText = `Recargar ${data.title}`;
  const mi = document.getElementById('modalGameIcon');
  if (data.logo) {
    mi.innerHTML = `<img src="${data.logo}" class="w-full h-full object-cover rounded-xl">`;
    mi.classList.add('overflow-hidden', 'p-0');
  } else {
    mi.innerHTML = data.icon || '🎮';
    mi.classList.remove('overflow-hidden', 'p-0');
  }

  const dEl = document.getElementById('modalGameDiscount');
  if (data.discount > 0 && !data.paused) {
    dEl.classList.remove('hidden');
    dEl.innerText = `🔥 OFERTA -${data.discount}%`;
  } else dEl.classList.add('hidden');

  const pn = document.getElementById('pausedNotice');
  const wrap = document.getElementById('stepContentWrap');
  const stepper = document.getElementById('stepStepper');

  if (data.paused) {
    pn.classList.remove('hidden');
    wrap.classList.add('hidden');
    stepper.classList.add('hidden');
    document.getElementById('nextBtn').classList.add('hidden');
    document.getElementById('backBtn').classList.add('hidden');
    document.getElementById('sendOrderBtn').classList.add('hidden');
    document.getElementById('rechargeModal').classList.remove('hidden');
    document.body.classList.add('modal-open');
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  } else {
    pn.classList.add('hidden');
    wrap.classList.remove('hidden');
    stepper.classList.remove('hidden');
  }

  ['playerIdInput', 'playerIdInput2', 'serverIdInput', 'refInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const bankSel = document.getElementById('bankInput');
  if (bankSel) { bankSel.value = ''; renderBankOptions(); }
  removeCapture();

  configureIdStep(data);
  renderPaymentMethodsModal();
  renderPackages();
  updateLiveTotal();
  updateSummary();

  currentStep = 1;
  renderStep();

  document.getElementById('rechargeModal').classList.remove('hidden');
  document.body.classList.add('modal-open');
  setTimeout(() => {
    const needsId = data.idEnabled !== false && data.idMode !== 'no_id';
    if (needsId) document.getElementById('playerIdInput')?.focus();
  }, 120);
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeRechargeModal() {
  document.getElementById('rechargeModal').classList.add('hidden');
  document.body.classList.remove('modal-open');
}

// ============ STEPPER ============
function renderStep() {
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const dot = document.getElementById('stepDot' + i);
    const line = document.getElementById('stepLine' + i);
    const panel = document.getElementById('stepPanel' + i);
    dot.classList.remove('active', 'done');
    if (i < currentStep) dot.classList.add('done');
    if (i === currentStep) dot.classList.add('active');
    if (line) {
      if (i < currentStep) line.classList.add('done');
      else line.classList.remove('done');
    }
    if (panel) panel.classList.toggle('active', i === currentStep);
  }

  document.getElementById('backBtn').classList.toggle('hidden', currentStep === 1);
  document.getElementById('nextBtn').classList.toggle('hidden', currentStep === TOTAL_STEPS);
  document.getElementById('sendOrderBtn').classList.toggle('hidden', currentStep !== TOTAL_STEPS);

  if (currentStep === 2) {
    renderPaymentFields();
    renderQR();
    renderBankOptions();
    togglePaymentDataSection();
  }
  updateStepButtonsState();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updateStepButtonsState() {
  const nextBtn = document.getElementById('nextBtn');
  const sendBtn = document.getElementById('sendOrderBtn');
  if (currentStep === TOTAL_STEPS) {
    sendBtn.disabled = !canSubmit();
  } else {
    nextBtn.disabled = !canAdvanceFromStep1();
  }
}

function canAdvanceFromStep1() {
  const data = gameData[currentOrder.gameKey];
  if (!data) return false;
  const needsId = data.idEnabled !== false && data.idMode !== 'no_id';
  if (needsId) {
    const minLen = data.minIdLength || 4;
    if (data.idMode === 'id_server') {
      if (currentOrder.playerId.length < minLen || currentOrder.serverId.length < 2) return false;
    } else {
      if (currentOrder.playerId.length < minLen) return false;
    }
  }
  if (!currentOrder.paymentMethod) return false;
  if (currentOrder.packages.length === 0) return false;
  return true;
}

function nextStep() {
  if (currentStep === 1 && !canAdvanceFromStep1()) { showStepError(); return; }
  if (currentStep < TOTAL_STEPS) { currentStep++; renderStep(); }
}
function prevStep() {
  if (currentStep > 1) { currentStep--; renderStep(); }
}

function showStepError() {
  const data = gameData[currentOrder.gameKey];
  const needsId = data && data.idEnabled !== false && data.idMode !== 'no_id';
  if (needsId) {
    const minLen = data.minIdLength || 4;
    const idOk = data.idMode === 'id_server'
      ? (currentOrder.playerId.length >= minLen && currentOrder.serverId.length >= 2)
      : (currentOrder.playerId.length >= minLen);
    if (!idOk) { alert('Ingresa correctamente tu ID.'); return; }
  }
  if (!currentOrder.paymentMethod) { alert('Selecciona un método de pago.'); return; }
  if (currentOrder.packages.length === 0) { alert('Selecciona al menos un paquete.'); return; }
}

// ============ ID ============
function configureIdStep(data) {
  const sw = document.getElementById('idSimpleWrap');
  const srw = document.getElementById('idServerWrap');
  const nw = document.getElementById('noIdWrap');
  const helper = document.getElementById('idHelperText');
  const enabled = data.idEnabled !== false && data.idMode !== 'no_id';
  const mode = enabled ? (data.idMode || 'id') : 'no_id';
  sw.classList.add('hidden');
  srw.classList.add('hidden');
  nw.classList.add('hidden');
  if (mode === 'no_id') {
    nw.classList.remove('hidden');
    helper.classList.add('hidden');
  } else if (mode === 'id_server') {
    srw.classList.remove('hidden');
    helper.classList.remove('hidden');
    helper.innerText = 'ID + Server obligatorios.';
  } else {
    sw.classList.remove('hidden');
    helper.classList.remove('hidden');
    helper.innerText = 'Copia correctamente el ID.';
  }
}

function validateIdInput() {
  const data = gameData[currentOrder.gameKey];
  if (!data) return;
  const mode = data.idMode || 'id';
  if (mode === 'id_server') {
    currentOrder.playerId = document.getElementById('playerIdInput2').value.trim();
    currentOrder.serverId = document.getElementById('serverIdInput').value.trim();
  } else {
    currentOrder.playerId = document.getElementById('playerIdInput').value.trim();
    currentOrder.serverId = '';
  }
  updateSummary();
  updateStepButtonsState();
}

// ============ MÉTODOS DE PAGO ============
function renderPaymentMethodsModal() {
  const grid = document.getElementById('paymentMethodsModal');
  grid.innerHTML = '';
  const enabled = paymentMethods.filter(p => p.enabled !== false);
  enabled.forEach(pm => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pay-btn glass-card p-3 rounded-xl border-slate-700 hover:border-cyber-cyan text-center flex flex-col items-center justify-center gap-1 transition-all';
    btn.setAttribute('data-pay', pm.name);
    btn.onclick = () => selectPaymentMethod(pm.name);
    btn.innerHTML = `<span class="text-2xl">${pm.icon}</span><span class="text-xs font-bold text-white">${escapeHtml(pm.name)}</span><span class="text-[10px] text-cyan-300">${escapeHtml(pm.label)}</span>`;
    if (currentOrder.paymentMethod === pm.name) btn.classList.add('selected');
    grid.appendChild(btn);
  });
}

function selectPaymentMethod(name) {
  currentOrder.paymentMethod = name;
  document.querySelectorAll('.pay-btn').forEach(b => {
    if (b.getAttribute('data-pay') === name) b.classList.add('selected');
    else b.classList.remove('selected');
  });
  renderPackages();
  updateLiveTotal();
  updateSummary();
  updateStepButtonsState();
}

// ============ PAQUETES ============
function renderPackages() {
  const data = gameData[currentOrder.gameKey];
  if (!data) return;
  const grid = document.getElementById('packageGrid');
  const hint = document.getElementById('packageHint');
  grid.innerHTML = '';
  const pm = currentOrder.paymentMethod ? getPaymentMethod(currentOrder.paymentMethod) : null;
  const currency = pm ? pm.code : null;
  if (!currency) hint.classList.remove('hidden');
  else hint.classList.add('hidden');

  (data.packages || []).forEach(pkg => {
    const finalPrice = applyDiscount(pkg.price, data.discount);
    const hasDiscount = data.discount > 0;
    const btn = document.createElement('div');
    btn.className = 'pkg-btn glass-card p-3 rounded-xl border-slate-700 text-left transition-all flex flex-col justify-between relative cursor-pointer';
    btn.setAttribute('data-pkg-id', pkg.id);
    const inOrder = currentOrder.packages.find(p => p.id === pkg.id);
    if (inOrder) btn.classList.add('selected');
    const priceText = currency ? formatPrice(finalPrice, currency) : '— — —';
    const oldPriceText = (currency && hasDiscount) ? formatPrice(pkg.price, currency) : null;

    btn.innerHTML = `
      <div class="pkg-check"></div>
      <div class="flex items-start justify-between gap-2">
        <span class="text-xs font-bold text-white pr-5 flex-1">${escapeHtml(pkg.name)}</span>
      </div>
      <div class="flex flex-col mt-2">
        ${oldPriceText ? `<span class="text-[10px] text-gray-500 line-through">${oldPriceText}</span>` : ''}
        <span class="text-xs font-orbitron ${currency ? (hasDiscount ? 'text-rose-400' : 'text-cyber-cyan') : 'text-gray-500'} font-bold">${priceText}</span>
      </div>
      ${inOrder ? `
        <div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-800">
          <span class="text-[10px] text-gray-400">Cantidad</span>
          <div class="flex items-center gap-1.5" onclick="event.stopPropagation()">
            <button class="qty-btn" onclick="changeQty('${pkg.id}', -1)">−</button>
            <span class="qty-num">${inOrder.qty}</span>
            <button class="qty-btn" onclick="changeQty('${pkg.id}', 1)">+</button>
          </div>
        </div>` : ''}`;
    btn.onclick = () => togglePackage(pkg);
    grid.appendChild(btn);
  });
  updatePkgCounter();
}

function togglePackage(pkg) {
  const idx = currentOrder.packages.findIndex(p => p.id === pkg.id);
  if (idx >= 0) currentOrder.packages.splice(idx, 1);
  else currentOrder.packages.push({ ...pkg, qty: 1 });
  renderPackages();
  updateLiveTotal();
  updateSummary();
  updateStepButtonsState();
}

function changeQty(pkgId, delta) {
  const item = currentOrder.packages.find(p => p.id === pkgId);
  if (!item) return;
  item.qty = Math.max(1, Math.min(99, item.qty + delta));
  renderPackages();
  updateLiveTotal();
  updateSummary();
  updateStepButtonsState();
}

function updatePkgCounter() {
  const c = document.getElementById('pkgCounter');
  const totalUnits = currentOrder.packages.reduce((s, p) => s + p.qty, 0);
  if (totalUnits > 0) {
    c.classList.remove('hidden');
    c.innerText = `${totalUnits} unidad${totalUnits > 1 ? 'es' : ''}`;
  } else c.classList.add('hidden');
}

// ============ TOTAL EN VIVO ============
function updateLiveTotal() {
  const item = gameData[currentOrder.gameKey];
  const pm = currentOrder.paymentMethod ? getPaymentMethod(currentOrder.paymentMethod) : null;
  const liveTotal = document.getElementById('liveTotal');
  const liveSummary = document.getElementById('livePkgSummary');
  const hint = document.getElementById('liveTotalHint');

  if (!item) {
    liveTotal.innerText = '—';
    liveSummary.innerText = '—';
    hint.classList.remove('hidden');
    return;
  }

  if (currentOrder.packages.length === 0) {
    liveSummary.innerText = 'Ninguno';
    liveTotal.innerText = '—';
    hint.classList.remove('hidden');
    hint.innerText = 'Selecciona paquetes para ver el total';
    return;
  }
  hint.classList.add('hidden');

  const totalUnits = currentOrder.packages.reduce((s, p) => s + p.qty, 0);
  liveSummary.innerText = `${currentOrder.packages.length} paquete${currentOrder.packages.length > 1 ? 's' : ''} · ${totalUnits} ud${totalUnits > 1 ? 's' : ''}`;

  if (pm) {
    liveTotal.innerText = formatPrice(calcTotal(), pm.code);
  } else {
    liveTotal.innerText = '— elige método —';
  }
}

// ============ PASO 2 ============
function togglePaymentDataSection() {
  const pm = currentOrder.paymentMethod ? getPaymentMethod(currentOrder.paymentMethod) : null;
  if (!pm) return;
  document.getElementById('refWrap').style.display = pm.askReference ? '' : 'none';
  document.getElementById('bankWrap').style.display = pm.askBank ? '' : 'none';
  document.getElementById('captureWrap').style.display = pm.askCapture ? '' : 'none';
}

function renderPaymentFields() {
  const list = document.getElementById('paymentFieldsList');
  list.innerHTML = '';
  const pm = currentOrder.paymentMethod ? getPaymentMethod(currentOrder.paymentMethod) : null;
  if (!pm) return;
  const fields = (pm.fields || []).filter(f => f.label && f.value);
  if (fields.length === 0) {
    list.innerHTML = '<p class="text-[11px] text-gray-500 italic text-center py-2">No hay datos configurados.</p>';
    return;
  }
  fields.forEach(f => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg bg-black/40 border border-slate-800';
    row.innerHTML = `
      <div class="flex flex-col min-w-0 flex-1">
        <span class="text-[9px] text-gray-500 uppercase font-orbitron font-bold">${escapeHtml(f.label)}</span>
        <span class="text-xs text-white font-mono truncate">${escapeHtml(f.value)}</span>
      </div>
      <button type="button" onclick="copyText('${escapeHtml(f.value).replace(/'/g, "\\'")}', this)" class="copy-btn shrink-0">COPIAR</button>`;
    list.appendChild(row);
  });
}

function renderQR() {
  const qrBox = document.getElementById('qrBox');
  const qrImg = document.getElementById('qrImage');
  const pm = currentOrder.paymentMethod ? getPaymentMethod(currentOrder.paymentMethod) : null;
  if (pm && pm.qr && pm.qr.trim() !== '') {
    qrBox.classList.remove('hidden');
    qrImg.src = pm.qr;
  } else {
    qrBox.classList.add('hidden');
    qrImg.src = '';
  }
}

function renderBankOptions() {
  const sel = document.getElementById('bankInput');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— Selecciona tu banco —</option>' +
    bancosList.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
  if (current) sel.value = current;
}

function validatePaymentData() {
  currentOrder.reference = document.getElementById('refInput').value.trim();
  currentOrder.bank = document.getElementById('bankInput').value.trim();
  updateSummary();
  updateStepButtonsState();
}

// ============ CAPTURA ============
function onCaptureSelected(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { alert('Solo imágenes'); return; }
  if (file.size > 5 * 1024 * 1024) { alert('Imagen muy grande (máx 5MB)'); return; }
  compressImage(file, 1000, 0.75).then(dataUrl => {
    currentOrder.capture = dataUrl;
    document.getElementById('capturePreview').classList.remove('hidden');
    document.getElementById('captureImg').src = dataUrl;
    const st = document.getElementById('captureStatus');
    st.innerText = `✓ Imagen lista (${Math.round(dataUrl.length / 1024)} KB)`;
    st.className = 'text-[10px] text-emerald-400 mt-1';
    updateSummary();
    updateStepButtonsState();
  });
}

function removeCapture() {
  currentOrder.capture = null;
  const inp = document.getElementById('captureInput');
  if (inp) inp.value = '';
  const prev = document.getElementById('capturePreview');
  if (prev) prev.classList.add('hidden');
  const st = document.getElementById('captureStatus');
  if (st) {
    st.innerText = 'JPG/PNG · máx 5MB · se comprime automáticamente';
    st.className = 'text-[10px] text-gray-500 mt-1';
  }
  updateSummary();
  updateStepButtonsState();
}

function compressImage(file, maxDim, quality) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h && w > maxDim) { h = h * (maxDim / w); w = maxDim; }
        else if (h > w && h > maxDim) { w = w * (maxDim / h); h = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ============ RESUMEN ============
function calcTotal() {
  const data = gameData[currentOrder.gameKey];
  if (!data) return 0;
  let sum = 0;
  currentOrder.packages.forEach(p => {
    sum += applyDiscount(p.price, data.discount) * p.qty;
  });
  return sum;
}

function updateSummary() {
  const item = gameData[currentOrder.gameKey];
  document.getElementById('summaryGame').innerText = item ? item.title : '-';

  if (item && item.idMode === 'id_server') {
    const sv = currentOrder.serverId ? ` (SV: ${currentOrder.serverId})` : '';
    document.getElementById('summaryId').innerText = currentOrder.playerId ? currentOrder.playerId + sv : 'Pendiente...';
  } else if (item && (item.idEnabled === false || item.idMode === 'no_id')) {
    document.getElementById('summaryId').innerText = 'No requerido';
  } else {
    document.getElementById('summaryId').innerText = currentOrder.playerId || 'Pendiente...';
  }

  const sPkg = document.getElementById('summaryPackage');
  const sList = document.getElementById('summaryPackagesList');
  if (currentOrder.packages.length === 0) {
    sPkg.innerText = 'Ninguno';
    sList.innerHTML = '';
  } else if (currentOrder.packages.length === 1) {
    const p = currentOrder.packages[0];
    sPkg.innerText = `${p.name} x${p.qty}`;
    sList.innerHTML = '';
  } else {
    const totalUnits = currentOrder.packages.reduce((s, p) => s + p.qty, 0);
    sPkg.innerText = `${currentOrder.packages.length} paquetes · ${totalUnits} uds`;
    sList.innerHTML = currentOrder.packages.map(p => `• ${escapeHtml(p.name)} x${p.qty}`).join('<br>');
  }

  document.getElementById('summaryPayment').innerText = currentOrder.paymentMethod || 'No seleccionado';

  const pm = currentOrder.paymentMethod ? getPaymentMethod(currentOrder.paymentMethod) : null;
  const totalEl = document.getElementById('summaryTotal');
  if (currentOrder.packages.length > 0 && pm && item) {
    totalEl.innerText = formatPrice(calcTotal(), pm.code);
  } else totalEl.innerText = '-';
}

function canSubmit() {
  const item = gameData[currentOrder.gameKey];
  const pm = currentOrder.paymentMethod ? getPaymentMethod(currentOrder.paymentMethod) : null;
  if (!item || !pm || !client) return false;
  if (currentOrder.packages.length === 0) return false;

  const needsId = item.idEnabled !== false && item.idMode !== 'no_id';
  if (needsId) {
    const minLen = item.minIdLength || 4;
    if (item.idMode === 'id_server') {
      if (currentOrder.playerId.length < minLen || currentOrder.serverId.length < 2) return false;
    } else {
      if (currentOrder.playerId.length < minLen) return false;
    }
  }
  if (pm.askReference && currentOrder.reference.length < 4) return false;
  if (pm.askBank && currentOrder.bank.length < 2) return false;
  if (pm.askCapture && !currentOrder.capture) return false;
  return true;
}

// ============ ENVÍO ============
async function submitOrder() {
  const item = gameData[currentOrder.gameKey];
  const pm = getPaymentMethod(currentOrder.paymentMethod);
  if (!item || !pm || !client) return;

  const totalUSDT = calcTotal();
  const totalLocal = convertPrice(totalUSDT, pm.code);

  const btn = document.getElementById('sendOrderBtn');
  btn.disabled = true;
  btn.innerHTML = '<span>ENVIANDO PEDIDO...</span>';

  const payload = {
    phone: client.phone,
    gameKey: currentOrder.gameKey,
    gameTitle: item.title,
    playerId: currentOrder.playerId,
    serverId: currentOrder.serverId,
    packages: currentOrder.packages.map(p => ({ id: p.id, name: p.name, price: p.price, qty: p.qty })),
    paymentMethod: currentOrder.paymentMethod,
    paymentFields: {},
    reference: currentOrder.reference,
    bank: currentOrder.bank,
    totalUSDT, totalLocal,
    currencyCode: pm.code,
    capture: currentOrder.capture || ''
  };

  try {
    const data = await API.createOrder(payload);
    if (!data.ok) {
      alert(data.error || 'Error al enviar. Intenta de nuevo.');
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5"></i><span>LISTO, PROCEDER A WHATSAPP</span>';
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }
    openWhatsApp(item, pm);
    showSuccessModal(item, pm);
    closeRechargeModal();
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5"></i><span>LISTO, PROCEDER A WHATSAPP</span>';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (e) {
    alert('Error de conexión');
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5"></i><span>LISTO, PROCEDER A WHATSAPP</span>';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

function buildWhatsAppText(item, pm) {
  const totalUSDT = calcTotal();
  const totalFormatted = formatPrice(totalUSDT, pm.code);
  let discountLine = '';
  if (item.discount > 0) {
    const orig = currentOrder.packages.reduce((s, p) => s + p.price * p.qty, 0);
    discountLine = `\n🔥 *Oferta:* -${item.discount}% (antes ${formatPrice(orig, pm.code)})`;
  }

  let idLine = '';
  const needsId = item.idEnabled !== false && item.idMode !== 'no_id';
  if (needsId) {
    if (item.idMode === 'id_server') idLine = `🆔 *ID:* ${currentOrder.playerId}\n🌐 *Server:* ${currentOrder.serverId}\n`;
    else idLine = `🆔 *ID:* ${currentOrder.playerId}\n`;
  } else idLine = `🆔 *ID:* No requerido\n`;

  let packagesList = '';
  currentOrder.packages.forEach((p, i) => {
    const finalPrice = applyDiscount(p.price, item.discount) * p.qty;
    packagesList += `   ${i + 1}. ${p.name} x${p.qty} → ${formatPrice(finalPrice, pm.code)}\n`;
  });

  const clientName = `${client.firstName || ''} ${client.lastName || ''}`.trim() || client.phone;

  return `*SOLICITUD DE RECARGA - X-STORE*\n` +
    `------------------------------------\n` +
    `👤 *Cliente:* ${clientName}\n` +
    `📱 *Teléfono:* ${client.phone}\n` +
    `🎮 *Juego:* ${item.title}\n` +
    idLine +
    `📦 *Paquetes:*\n${packagesList}` +
    `💳 *Método:* ${currentOrder.paymentMethod}\n` +
    `📝 *Referencia:* ${currentOrder.reference}\n` +
    (currentOrder.bank ? `🏦 *Banco emisor:* ${currentOrder.bank}\n` : '') +
    `💰 *Total:* ${totalFormatted}` +
    `${discountLine}\n` +
    `------------------------------------\n` +
    `✅ Envío el comprobante por aquí.`;
}

function openWhatsApp(item, pm) {
  const text = buildWhatsAppText(item, pm);
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`, '_blank');
}

function showSuccessModal(item, pm) {
  const text = buildWhatsAppText(item, pm);
  document.getElementById('waSuccessLink').href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
  document.getElementById('successModal').classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
function closeSuccessModal() {
  document.getElementById('successModal').classList.add('hidden');
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', async () => {
  if (typeof lucide !== 'undefined') lucide.createIcons();
  fetchConfig();
  fetchLists();

  // Links de soporte
  const waHref = `https://wa.me/${WHATSAPP_NUMBER}?text=Hola%20X-Store`;
  const s1 = document.getElementById('supportLink');
  const s2 = document.getElementById('footerSupport');
  if (s1) s1.href = waHref;
  if (s2) s2.href = waHref;

  // Login de cliente
  client = loadClientFromStorage();
  if (client) {
    try {
      const data = await API.lookupClient(client.phone);
      if (data.found) {
        client.firstName = data.client.firstName;
        client.lastName = data.client.lastName;
        saveClientToStorage(client);
        updateClientBadge();
      } else {
        clearClientStorage();
        client = null;
        showPhoneLogin();
      }
    } catch (e) {
      updateClientBadge();
    }
  } else {
    showPhoneLogin();
  }

  // Input de login
  const loginPhone = document.getElementById('loginPhone');
  const phoneStatus = document.getElementById('phoneStatus');
  const phoneBtn = document.getElementById('phoneLoginBtn');
  if (loginPhone) {
    loginPhone.addEventListener('input', () => {
      const v = normalizePhone(loginPhone.value);
      loginPhone.value = v;
      if (v.length >= 8) {
        phoneBtn.disabled = false;
        phoneStatus.classList.remove('hidden');
        phoneStatus.className = 'text-[11px] mt-1.5 text-cyber-cyan';
        phoneStatus.innerText = 'Toca CONTINUAR';
      } else {
        phoneBtn.disabled = true;
        phoneStatus.classList.add('hidden');
      }
    });
    loginPhone.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !phoneBtn.disabled) doPhoneLogin();
    });
  }

  // ESC cierra modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('rechargeModal').classList.contains('hidden')) {
      closeRechargeModal();
    }
  });

  // Refrescar config al volver a la pestaña
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      fetchConfig();
      fetchLists();
    }
  });
});