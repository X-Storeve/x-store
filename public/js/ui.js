/* =========================================================
   UI — Renderizado, formateo y utilidades
   ========================================================= */

// ---------- Utilidades ----------
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function toObject(input) {
  if (!input) return {};
  if (Array.isArray(input)) {
    const o = {};
    Object.keys(input).forEach(k => o[k] = input[k]);
    return o;
  }
  return typeof input === 'object' ? input : {};
}

function normalizePhone(p) {
  return String(p || '').replace(/\D/g, '');
}

// ---------- Formateo de precios ----------
function getPaymentMethod(name) {
  return paymentMethods.find(p => p.name === name);
}

function applyDiscount(price, discount) {
  const p = Number(price);
  if (!isFinite(p) || p < 0) return 0;
  const d = Number(discount) || 0;
  return d <= 0 ? p : p * (1 - d / 100);
}

function convertPrice(usdt, code) {
  const pm = paymentMethods.find(p => p.code === code);
  const p = Number(usdt);
  if (!isFinite(p)) return 0;
  if (!pm) return p;
  const r = (typeof pm.rate === 'number' && pm.rate > 0) ? pm.rate : 1;
  return p * r;
}

function formatPrice(usdt, code) {
  const pm = paymentMethods.find(p => p.code === code);
  if (!pm) return '-';
  const v = convertPrice(usdt, code);
  return `${pm.symbol} ${v.toLocaleString('es-VE', {
    minimumFractionDigits: pm.decimals,
    maximumFractionDigits: pm.decimals
  })}`;
}

// ---------- HERO ----------
function renderHeroCards() {
  const g = document.getElementById('heroCardsGrid');
  if (!g) return;
  g.innerHTML = '';
  config_heroCards.forEach(card => {
    const content = card.image
      ? `<img src="${card.image}" class="w-full h-full object-cover rounded-xl" onerror="this.outerHTML='<span class=\\'text-3xl\\'>${card.emoji}</span>'">`
      : `<span class="text-3xl">${card.emoji}</span>`;
    const el = document.createElement('div');
    el.className = 'glass-card p-3 rounded-2xl';
    if (card.marginTop) el.style.marginTop = card.marginTop + 'px';
    el.innerHTML = `<div class="h-28 rounded-xl bg-gradient-to-br ${card.gradient} flex flex-col items-center justify-center overflow-hidden">${content}</div>`;
    g.appendChild(el);
  });
}

// ---------- JUEGOS ----------
function renderGameCards() {
  const grid = document.getElementById('gamesGrid');
  if (!grid) return;
  grid.querySelectorAll('.game-card-skeleton').forEach(e => e.remove());
  grid.querySelectorAll('.game-card').forEach(e => e.remove());

  const keys = Object.keys(gameData);
  if (keys.length === 0) {
    grid.innerHTML = '<div class="col-span-full glass-card p-8 rounded-2xl text-center text-gray-400">No hay juegos disponibles.</div>';
    return;
  }

  keys.forEach(key => {
    const g = gameData[key];
    const hasDiscount = g.discount > 0 && !g.paused;
    const isPaused = g.paused;
    const logoHtml = g.logo
      ? `<img src="${g.logo}" class="w-12 h-12 rounded-xl object-cover border-2 border-cyber-cyan/40 bg-black/40" onerror="this.outerHTML='<span class=\\'text-3xl\\'>${g.icon}</span>'">`
      : `<span class="text-3xl">${g.icon}</span>`;
    const tagsHtml = (g.tags || []).length
      ? `<div class="flex flex-wrap gap-1.5">${g.tags.map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';

    const card = document.createElement('div');
    card.className = 'game-card glass-card glass-card-hover rounded-2xl overflow-hidden cursor-pointer group flex flex-col justify-between relative';
    card.setAttribute('onclick', `openRechargeModal('${key}')`);
    card.setAttribute('data-title', `${g.title.toLowerCase()} ${key}`);

    card.innerHTML = `
      ${hasDiscount ? `<div class="badge-discount">-${g.discount}%</div>` : ''}
      <div class="relative h-48 overflow-hidden bg-gradient-to-b from-cyan-600/30 to-slate-900">
        <div class="absolute inset-0 bg-cover bg-center group-hover:scale-110 transition-transform duration-500" style="background-image: url('${g.cover}');"></div>
        <div class="absolute inset-0 bg-gradient-to-t from-[#12121e] via-[#12121e]/40 to-transparent"></div>
        ${isPaused ? `<div class="paused-overlay"><div class="text-3xl">⏸</div><p class="font-orbitron font-bold text-amber-400 text-sm">PAUSADO</p></div>` : ''}
        <div class="absolute bottom-3 left-4 right-4 z-10 flex items-center gap-3">
          <div class="shrink-0">${logoHtml}</div>
          <h3 class="font-orbitron text-xl font-bold text-white drop-shadow-lg">${escapeHtml(g.title)}</h3>
        </div>
      </div>
      <div class="p-5 space-y-3 flex-1 flex flex-col justify-between">
        <div class="space-y-2">
          <p class="text-xs text-gray-400">${escapeHtml(g.description || 'Recarga al instante.')}</p>
          ${tagsHtml}
        </div>
        <div class="flex items-center justify-between pt-2 border-t border-slate-800">
          <span class="text-xs text-gray-400">${isPaused ? 'No disponible' : 'Ver precios'}</span>
          <button class="px-4 py-2 rounded-lg ${isPaused ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-cyber-cyan/10 text-cyber-cyan border-cyber-cyan/30'} font-orbitron text-xs font-bold border">${isPaused ? 'Pausado' : 'Recargar'}</button>
        </div>
      </div>`;
    grid.appendChild(card);
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderPaymentMethodsPublic() {
  const grid = document.getElementById('paymentMethodsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const enabled = paymentMethods.filter(p => p.enabled !== false);
  if (enabled.length === 0) {
    grid.innerHTML = '<div class="col-span-full glass-card p-8 rounded-2xl text-center text-gray-400">No hay métodos de pago.</div>';
    return;
  }
  enabled.forEach(pm => {
    const card = document.createElement('div');
    card.className = 'glass-card p-6 rounded-2xl border-slate-800 hover:border-cyber-cyan/50 transition-all text-center space-y-4';
    card.innerHTML = `
      <div class="w-16 h-16 mx-auto rounded-2xl bg-cyber-cyan/10 border border-cyber-cyan/30 flex items-center justify-center text-3xl">${pm.icon}</div>
      <h3 class="font-orbitron text-lg font-bold text-white">${escapeHtml(pm.name)}</h3>
      <p class="text-xs text-gray-400">Pago en ${escapeHtml(pm.label)}</p>
      <span class="inline-block px-3 py-1 rounded-full bg-cyber-cyan/10 text-cyber-cyan text-[11px] font-semibold">${escapeHtml(pm.label)}</span>`;
    grid.appendChild(card);
  });
}

// ---------- Filtro de búsqueda ----------
function filterGames(q) {
  q = (q || '').toLowerCase().trim();
  const cards = document.querySelectorAll('.game-card');
  cards.forEach(c => {
    const t = (c.getAttribute('data-title') || '').toLowerCase();
    if (t.includes(q)) {
      c.classList.remove('hidden');
      c.classList.add('flex');
    } else {
      c.classList.add('hidden');
      c.classList.remove('flex');
    }
  });
  const s1 = document.getElementById('searchInput');
  const s2 = document.getElementById('searchInputMobile');
  if (s1) s1.value = q;
  if (s2) s2.value = q;
}

// ---------- Copiar al portapapeles ----------
function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.innerText;
    btn.innerText = '✓';
    setTimeout(() => { btn.innerText = orig; }, 1200);
  }).catch(() => {});
}