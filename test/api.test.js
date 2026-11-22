// Checks the rules in store.js and the HTTP server. Run: node test/api.test.js
const assert = require('assert'), { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const S = require('../public/store.js');
const db = S.emptyDb(); const st = S.create(db, { hash: p => 'h' + p, check: (p, h) => h === 'h' + p });
st.seed({ staff: [{ id: 'o', name: 'Owner', role: 'owner', pin: '1111' }, { id: 'm', name: 'Manager', role: 'manager', pin: '2222' }, { id: 'r', name: 'Ms R', role: 'receptionist', pin: '3333' }, { id: 'r2', name: 'Ms Q', role: 'receptionist', pin: '3334' }], leads: [{ id: 'K-1', name: 'A', status: 'Walk-in', hist: [] }] });
const u = id => st.userFor(id); const throws = (f, code) => { try { f(); } catch (e) { assert.strictEqual(e.status, code, e.message); return; } assert.fail('should throw ' + code); };
assert.strictEqual(st.login('r', '3333').pinHash, undefined);
throws(() => st.login('r', '0000'), 401);
for (let i = 0; i < 6; i++) throws(() => st.login('r2', '0000'), 401);
throws(() => st.login('r2', '0000'), 429);
// permissions
throws(() => st.write(u('r'), 'set', 'staff', 'x', { name: 'X', role: 'owner', pin: '1234' }), 403);
throws(() => st.write(u('r'), 'set', 'config', 'targets', { call: 1 }), 403);
throws(() => st.write(u('r'), 'delete', 'leads', 'K-1'), 403);
st.write(u('r'), 'update', 'leads', 'K-1', { status: 'Call' });
throws(() => st.write(u('r'), 'set', 'activity', 'a1', { id: 'a1', staff: 'r2', kind: 'call', date: '2026-11-22' }), 403);
st.write(u('r'), 'set', 'activity', 'a1', { id: 'a1', staff: 'r', kind: 'call', date: '2026-11-22', ts: 1 });
throws(() => st.write(u('r2'), 'delete', 'activity', 'a1'), 403);
st.write(u('m'), 'delete', 'activity', 'a1');
// staff rules
const nw = st.write(u('o'), 'set', 'staff', 's_new', { name: 'Ms New', role: 'trainer', pin: '4444' });
assert.strictEqual(nw.pinHash, undefined); assert.strictEqual(st.login('s_new', '4444').name, 'Ms New');
throws(() => st.write(u('o'), 'set', 'staff', 's_x', { name: 'ms new', role: 'trainer', pin: '5555' }), 400);
throws(() => st.write(u('o'), 'set', 'staff', 's_y', { name: 'Y', role: 'trainer' }), 400);
st.write(u('o'), 'update', 'staff', 's_new', { name: 'Ms New' }); assert.ok(st.login('s_new', '4444'));
st.write(u('o'), 'set', 'staff', 's_new', { name: 'Ms New', role: 'trainer', active: false });
throws(() => st.login('s_new', '4444'), 401);
throws(() => st.write(u('o'), 'update', 'staff', 'o', { active: false }), 400); // last owner
// sync: full, then only changes, then deletions
const f = st.sync(u('r'), 0); assert.ok(f.full && f.docs.leads.length === 1 && f.docs.staff.every(x => !x.pinHash));
st.write(u('r'), 'update', 'leads', 'K-1', { remarks: 'x' });
const c = st.sync(u('r'), f.rev); assert.strictEqual(c.docs.leads.length, 1); assert.strictEqual(c.docs.staff.length, 0);
st.write(u('m'), 'delete', 'leads', 'K-1'); assert.deepStrictEqual(st.sync(u('r'), c.rev).del, [['leads', 'K-1']]);
// bulk
const b = st.bulk(u('r'), [['set', 'leads/N-1', { name: 'B' }], ['set', 'staff/zz', { name: 'Z', role: 'owner', pin: '1234' }]]); assert.strictEqual(b.ok, 1); assert.strictEqual(b.failed.length, 1);
console.log('store checks passed');

// HTTP
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kfit-')); const port = 3600 + Math.floor(Math.random() * 300);
const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: dir }) });
const call = async (m, p, body, tok) => { const r = await fetch('http://127.0.0.1:' + port + p, { method: m, headers: Object.assign({ 'content-type': 'application/json' }, tok ? { authorization: 'Bearer ' + tok } : {}), body: body && JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch (e) {} return { s: r.status, j }; };
(async () => {
  await new Promise(r => setTimeout(r, 1200));
  const list = (await call('GET', '/api/staff-list')).j; assert.ok(list.length >= 1);
  const id = list[0].id; assert.strictEqual((await call('POST', '/api/login', { id, pin: 'nope' })).s, 401);
  assert.strictEqual((await call('GET', '/api/sync')).s, 401);
  assert.strictEqual((await call('GET', '/api/sync', null, 'bad.token')).s, 401);
  const ok = await call('POST', '/api/login', { id, pin: fs.existsSync(path.join(__dirname, '..', 'seed.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seed.json'))).staff.find(x => x.id === id).pin : '1234' });
  assert.strictEqual(ok.s, 200); const t = ok.j.token;
  const sy = await call('GET', '/api/sync?since=0', null, t); assert.strictEqual(sy.s, 200);
  assert.ok(!JSON.stringify(sy.j).includes('pinHash'));
  assert.strictEqual((await call('GET', '/../server.js')).s === 200, false);
  const raw = await fetch('http://127.0.0.1:' + port + '/..%2fserver.js'); assert.ok(raw.status >= 400);
  console.log('http checks passed'); srv.kill(); console.log('ALL API CHECKS PASSED');
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
