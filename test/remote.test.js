// Tests free-hosting mode against a pretend Supabase. Run: node test/remote.test.js
const http = require('http'), { spawn } = require('child_process'), path = require('path'), assert = require('assert');
const rows = {}; let calls = 0;
const mock = http.createServer((q, r) => {
  let b = ''; q.on('data', c => b += c); q.on('end', () => {
    calls++; const u = new URL(q.url, 'http://x');
    if (q.headers.apikey !== 'KEY') { r.writeHead(401); return r.end('{"message":"bad key"}'); }
    if (q.method === 'GET') { const k = u.searchParams.get('key').replace('eq.', ''); r.writeHead(200); return r.end(JSON.stringify(rows[k] ? [{ value: rows[k] }] : [])); }
    if (q.method === 'POST') { const j = JSON.parse(b); rows[j.key] = j.value; r.writeHead(201); return r.end(); }
    if (q.method === 'DELETE') { const cut = u.searchParams.getAll('key').find(x => x.startsWith('lt.')).slice(3); Object.keys(rows).forEach(k => { if (k.startsWith('backup-') && k < cut) delete rows[k]; }); r.writeHead(204); return r.end(); }
  });
}).listen(0, async () => {
  const sbp = mock.address().port, port = 3900 + Math.floor(Math.random() * 90);
  const start = () => { const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: '/tmp/none-' + port, SUPABASE_URL: 'http://127.0.0.1:' + sbp, SUPABASE_KEY: process.env.TESTKEY || 'KEY' }) }); p.out = ''; p.stdout.on('data', d => p.out += d); p.stderr.on('data', d => p.out += d); return p; };
  const call = async (m, p, body, tok) => { const r = await fetch('http://127.0.0.1:' + port + p, { method: m, headers: Object.assign({ 'content-type': 'application/json' }, tok ? { authorization: 'Bearer ' + tok } : {}), body: body && JSON.stringify(body) }); return { s: r.status, j: await r.json().catch(() => null) }; };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  try {
    let s = start(); await wait(1500); assert.ok(/Supabase/.test(s.out), s.out);
    const tok = (await call('POST', '/api/login', { id: 's_owner', pin: '1111' })).j.token;
    assert.strictEqual((await call('PATCH', '/api/doc/leads/K-0003', { remarks: 'saved to cloud' }, tok)).s, 200);
    await wait(2200); assert.ok(rows.db && rows.secret && Object.keys(rows).some(k => k.startsWith('backup-')), Object.keys(rows).join());
    s.kill('SIGTERM'); await wait(600);
    s = start(); await wait(1500); // restart: data and sign-in survive
    const sy = await call('GET', '/api/sync?since=0', null, tok); assert.strictEqual(sy.s, 200);
    assert.strictEqual(sy.j.docs.leads.find(l => l.id === 'K-0003').remarks, 'saved to cloud');
    s.kill('SIGTERM'); await wait(400);
    const bad = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port + 1, DATA_DIR: '/tmp/none-b', SUPABASE_URL: 'http://127.0.0.1:' + sbp, SUPABASE_KEY: 'WRONG' }) });
    let o = ''; bad.stderr.on('data', d => o += d); bad.stdout.on('data', d => o += d);
    await wait(1200); assert.ok(/Could not start/.test(o), 'must refuse to start on a bad key: ' + o);
    console.log('REMOTE STORAGE CHECKS PASSED');
  } catch (e) { console.error(e); process.exitCode = 1; }
  mock.close(); process.exit(process.exitCode || 0);
});
