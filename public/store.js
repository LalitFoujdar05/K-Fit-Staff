/* K-Fit Staff: the data rules. Used by server.js (real data) and by the demo page (in the browser), so both behave the same. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KStore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const COLS = ['staff', 'leads', 'renewals', 'activity', 'hot', 'config'];
  const ROLES = ['owner', 'manager', 'receptionist', 'trainer'];
  const ACT_DAYS = 35; // how much activity a phone downloads

  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const emptyDb = () => ({ rev: 0, d: { staff: {}, leads: {}, renewals: {}, activity: {}, hot: {}, config: {} }, del: [] });
  const isMgr = u => u && (u.role === 'owner' || u.role === 'manager');

  function create(db, opt) {
    opt = Object.assign({ save() {}, hash: p => p, check: (p, h) => p === h, now: () => Date.now(), tz: 330 }, opt || {});
    const fails = {};
    COLS.forEach(c => { if (!db.d[c]) db.d[c] = {}; }); // older saved data may not have every collection
    const ymd = ts => new Date(ts + opt.tz * 6e4).toISOString().slice(0, 10);
    const clean = d => { if (!d) return d; const o = Object.assign({}, d); delete o.pinHash; return o; };

    function staffList() {
      return Object.values(db.d.staff).filter(s => s.active !== false).map(s => ({ id: s.id, name: s.name, role: s.role, active: true }))
        .sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.name.localeCompare(b.name));
    }
    function login(id, pin) {
      const now = opt.now(); const f = (fails[id] = (fails[id] || []).filter(t => now - t < 10 * 6e4));
      if (f.length >= 6) throw new HttpError(429, 'Too many wrong PINs. Wait 10 minutes.');
      const s = db.d.staff[id];
      if (!s || s.active === false || !s.pinHash || !opt.check(String(pin || ''), s.pinHash)) { f.push(now); throw new HttpError(401, 'Wrong PIN'); }
      fails[id] = [];
      return clean(s);
    }
    function userFor(id) {
      const s = db.d.staff[id];
      if (!s || s.active === false) throw new HttpError(401, 'Signed out');
      return s;
    }
    function sync(user, since) {
      since = Number(since) || 0;
      const full = since <= 0 || since > db.rev;
      const out = {};
      const cutoff = ymd(opt.now() - ACT_DAYS * 864e5);
      COLS.forEach(c => {
        out[c] = Object.values(db.d[c]).filter(d => {
          if (!full && !(d._rev > since)) return false;
          if (c === 'activity' && full && !(d.date >= cutoff)) return false;
          return true;
        }).map(clean);
      });
      const del = full ? [] : db.del.filter(x => x.rev > since).map(x => [x.c, x.id]);
      return { rev: db.rev, full, docs: out, del };
    }
    function activity(user, from) {
      if (!isMgr(user)) throw new HttpError(403, 'Managers only');
      return Object.values(db.d.activity).filter(a => a.date >= (from || '0000')).sort((a, b) => a.ts - b.ts);
    }
    function ownersLeft(without, replacement) {
      const all = Object.assign({}, db.d.staff); if (without) delete all[without]; if (replacement) all[replacement.id] = replacement;
      return Object.values(all).some(s => s.role === 'owner' && s.active !== false && s.pinHash);
    }
    function check(user, mode, c, id, data, existing) {
      if (!COLS.includes(c)) throw new HttpError(404, 'Unknown collection');
      if (!/^[\w.\-]{1,90}$/.test(String(id))) throw new HttpError(400, 'Bad id');
      if (c === 'staff' || c === 'config') { if (user.role !== 'owner') throw new HttpError(403, 'Only the owner can change this'); }
      if (c === 'activity') {
        if (mode === 'delete') { if (!(isMgr(user) || (existing && existing.staff === user.id))) throw new HttpError(403, 'Not allowed'); }
        else if (mode === 'update') { if (!isMgr(user)) throw new HttpError(403, 'Not allowed'); }
        else if (!isMgr(user) && data.staff !== user.id) throw new HttpError(403, 'You can only log your own work');
      }
      if ((c === 'leads' || c === 'renewals' || c === 'hot') && mode === 'delete' && !isMgr(user)) throw new HttpError(403, 'Managers only');
      if (data && JSON.stringify(data).length > 20000) throw new HttpError(413, 'Too large');
    }
    function write(user, mode, c, id, data) {
      const existing = db.d[c] && db.d[c][id];
      check(user, mode, c, id, data, existing);
      if (mode === 'delete') {
        if (existing) {
          if (c === 'staff' && !ownersLeft(id)) throw new HttpError(400, 'Keep at least one active owner');
          delete db.d[c][id]; db.del.push({ c, id, rev: ++db.rev }); if (db.del.length > 4000) db.del.splice(0, db.del.length - 4000);
          opt.save();
        }
        return { ok: true };
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Bad data');
      let doc;
      if (mode === 'update') { if (!existing) throw new HttpError(404, 'Not found'); doc = Object.assign({}, existing, data); }
      else doc = Object.assign({}, data);
      delete doc._rev; delete doc.pinHash; doc.id = id;
      if (c === 'staff') {
        const pin = data.pin; delete doc.pin;
        doc.name = String(doc.name || '').trim().slice(0, 40); doc.role = String(doc.role || '').toLowerCase(); doc.active = doc.active !== false;
        if (!doc.name || !ROLES.includes(doc.role)) throw new HttpError(400, 'Name and role are needed');
        if (Object.values(db.d.staff).some(s => s.id !== id && s.name.toLowerCase() === doc.name.toLowerCase())) throw new HttpError(400, 'Another staff member has this name');
        if (pin != null && pin !== '') { if (!/^\d{4}$/.test(String(pin))) throw new HttpError(400, 'PIN must be 4 digits'); doc.pinHash = opt.hash(String(pin)); }
        else if (existing && existing.pinHash) doc.pinHash = existing.pinHash;
        else throw new HttpError(400, 'A new staff member needs a PIN');
        if (!ownersLeft(id, doc)) throw new HttpError(400, 'Keep at least one active owner');
      }
      doc._rev = ++db.rev; db.d[c][id] = doc; opt.save();
      return clean(doc);
    }
    function bulk(user, ops) {
      if (!Array.isArray(ops) || ops.length > 1000) throw new HttpError(400, 'Send at most 1000 records at a time');
      const failed = []; let ok = 0;
      ops.forEach(([mode, path, data], i) => {
        try { const [c, id] = String(path).split('/'); write(user, mode, c, id, data); ok++; } catch (e) { failed.push([i, e.message]); }
      });
      return { ok, failed };
    }
    /* first start: load the starter file (staff with PINs, leads, renewals) */
    function seed(s) {
      if (Object.keys(db.d.staff).length) return false;
      (s.staff || []).forEach(x => { const d = Object.assign({}, x); const pin = d.pin; delete d.pin; d.active = d.active !== false; d.pinHash = opt.hash(String(pin || '0000')); d._rev = ++db.rev; db.d.staff[d.id] = d; });
      (s.leads || []).forEach(x => { x._rev = ++db.rev; db.d.leads[x.id] = x; });
      (s.renewals || []).forEach(x => { x._rev = ++db.rev; db.d.renewals[x.id] = x; });
      (s.activity || []).forEach(x => { x._rev = ++db.rev; db.d.activity[x.id] = x; });
      (s.hot || []).forEach(x => { x._rev = ++db.rev; db.d.hot[x.id] = x; });
      if (s.targets) { db.d.config.targets = Object.assign({ id: 'targets', _rev: ++db.rev }, s.targets); }
      opt.save(); return true;
    }
    return { staffList, login, userFor, sync, activity, write, bulk, seed, clean, db };
  }
  return { create, emptyDb, HttpError, COLS, ROLES };
});
