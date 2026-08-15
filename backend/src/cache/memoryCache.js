// In-memory cache replacing Redis for hackathon MVP
const store = new Map();
const ttls = new Map();

module.exports = {
  set(key, value, ttlMs = 0) {
    store.set(key, value);
    if (ttlMs > 0) {
      if (ttls.has(key)) clearTimeout(ttls.get(key));
      ttls.set(key, setTimeout(() => { store.delete(key); ttls.delete(key); }, ttlMs));
    }
  },
  get(key) { return store.get(key) || null; },
  del(key) { store.delete(key); if (ttls.has(key)) { clearTimeout(ttls.get(key)); ttls.delete(key); } },
  keys(pattern) {
    const re = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return [...store.keys()].filter(k => re.test(k));
  },
  getAll(pattern) {
    return this.keys(pattern).map(k => ({ key: k, value: store.get(k) }));
  }
};
