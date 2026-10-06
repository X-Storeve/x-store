// Cliente API — todas las llamadas van a /api/*
const API = {
  async getConfig() {
    const r = await fetch(`/api/config?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('config ' + r.status);
    return r.json();
  },

  async getLists() {
    const r = await fetch(`/api/lists?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return { bancos: [] };
    return r.json();
  },

  async lookupClient(phone) {
    const r = await fetch(`/api/clients?action=lookup&phone=${encodeURIComponent(phone)}`);
    return r.json();
  },

  async createOrder(payload) {
    const r = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return r.json();
  }
};