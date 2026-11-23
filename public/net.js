/* Talks to the server (or, in the demo page, to an in-browser copy of it). Gives the app a small database-like API. */
(function () {
  const demo = !!window.KFIT_DEMO;
  let token = null;
  try { token = localStorage.getItem('kfit_token'); } catch (e) {}
  let dstore = null;
  if (demo) { const db = KStore.emptyDb(); dstore = KStore.create(db, {}); dstore.seed(window.KFIT_DEMO_SEED); }

  const N = { demo, onAuthLost() {}, onStatus() {}, hasToken: () => !!token };
  const setToken = t => { token = t; try { t ? localStorage.setItem('kfit_token', t) : localStorage.removeItem('kfit_token'); } catch (e) {} };

  async function api(method, url, body) {
    if (demo) { // same rules as the server, in this page
      await new Promise(r => setTimeout(r, 40));
      try {
        const u = new URL(url, 'http://x'), p = u.pathname;
        if (p === '/api/staff-list') return dstore.staffList();
        if (p === '/api/login') { const s = dstore.login(body.id, body.pin); setToken('demo:' + s.id); return { token: 'demo:' + s.id, me: s }; }
        const user = dstore.userFor((token || '').replace('demo:', ''));
        if (p === '/api/me') return dstore.clean(user);
        if (p === '/api/sync') return JSON.parse(JSON.stringify(dstore.sync(user, u.searchParams.get('since'))));
        if (p === '/api/activity') return dstore.activity(user, u.searchParams.get('from'));
        if (p === '/api/bulk') return dstore.bulk(user, body.ops);
        const d = p.match(/^\/api\/doc\/(\w+)\/(.+)$/);
        if (d) return JSON.parse(JSON.stringify(dstore.write(user, method === 'PUT' ? 'set' : method === 'PATCH' ? 'update' : 'delete', d[1], decodeURIComponent(d[2]), body)));
      } catch (e) { e.status = e.status || 500; if (e.status === 401 && token) { setToken(null); N.onAuthLost(); } throw e; }
      throw Object.assign(new Error('Not found'), { status: 404 });
    }
    let r;
    try {
      r = await fetch(url, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) { N.onStatus(false); throw Object.assign(new Error('Offline'), { status: 0 }); }
    N.onStatus(true);
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) {
      const err = Object.assign(new Error((j && j.error) || 'Error'), { status: r.status });
      if (r.status === 401 && token && url !== '/api/login') { setToken(null); stop(); N.onAuthLost(); }
      throw err;
    }
    return j;
  }
  N.api = api;
  N.staffList = () => api('GET', '/api/staff-list');
  N.me = () => api('GET', '/api/me');
  N.login = async (id, pin) => { const r = await api('POST', '/api/login', { id, pin }); setToken(r.token); return r.me; };
  N.logout = () => { setToken(null); stop(); cache = fresh(); rev = 0; subs.length = 0; };
  N.activity = from => api('GET', '/api/activity?from=' + encodeURIComponent(from || ''));
  N.downloads = {
    save: async ({ filename, data }) => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(data); a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    }
  };

  /* local copy of the data, kept fresh by asking the server for changes */
  const COLS = ['staff', 'leads', 'renewals', 'activity', 'config'];
  const fresh = () => ({ staff: {}, leads: {}, renewals: {}, activity: {}, config: {} });
  let cache = fresh(), rev = 0, timer = null, running = false, pulling = false;
  const subs = []; // {col, id?, where, cb}

  const wrap = d => ({ id: d.id, exists: true, data: () => d });
  function emit(cols) {
    subs.forEach(s => {
      if (!cols.has(s.col)) return;
      if (s.id) { const d = cache[s.col][s.id]; s.cb(d ? wrap(d) : { exists: false, data: () => undefined }); }
      else s.cb({ docs: Object.values(cache[s.col]).filter(s.filter).map(wrap) });
    });
  }
  async function pull() {
    if (pulling || !token) return; pulling = true;
    try {
      const r = await api('GET', '/api/sync?since=' + rev);
      const ch = new Set();
      if (r.full) { COLS.forEach(c => { cache[c] = {}; ch.add(c); }); }
      COLS.forEach(c => (r.docs[c] || []).forEach(d => { cache[c][d.id] = d; ch.add(c); }));
      (r.del || []).forEach(([c, id]) => { if (cache[c] && cache[c][id]) { delete cache[c][id]; ch.add(c); } });
      const first = rev === 0; rev = r.rev;
      if (first) COLS.forEach(c => ch.add(c));
      if (ch.size) emit(ch);
    } catch (e) { /* offline or signed out: onStatus / onAuthLost already told the app */ }
    pulling = false;
  }
  function start() {
    if (running) return; running = true; pull();
    timer = setInterval(() => { if (!document.hidden) pull(); }, 4000);
  }
  function stop() { running = false; clearInterval(timer); }
  N.start = start; N.stop = stop; N.pull = pull;
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
  window.addEventListener('online', () => pull());

  async function write(method, path, data) {
    const [c, id] = path.split('/');
    const r = await api(method, '/api/doc/' + c + '/' + encodeURIComponent(id), data);
    if (method === 'DELETE') delete cache[c][id]; else cache[c][id] = r;
    emit(new Set([c]));
    return r;
  }
  N.db = {
    collection(col) {
      const q = { filters: [], where(f, op, v) { this.filters.push([f, op, v]); return this; },
        onSnapshot(cb) { const filter = d => q.filters.every(([f, op, v]) => op === '>=' ? d[f] >= v : op === '==' ? d[f] === v : true); subs.push({ col, filter, cb }); if (rev) cb({ docs: Object.values(cache[col]).filter(filter).map(wrap) }); return () => {}; } };
      return q;
    },
    doc(path) {
      const [c, id] = path.split('/');
      return {
        set: d => write('PUT', path, d), update: d => write('PATCH', path, d), delete: () => write('DELETE', path),
        onSnapshot(cb) { subs.push({ col: c, id, cb }); if (rev) cb(cache[c][id] ? wrap(cache[c][id]) : { exists: false, data: () => undefined }); return () => {}; }
      };
    }
  };
  N.bulk = async ops => api('POST', '/api/bulk', { ops });
  window.KNet = N;
})();
