// Tests the one-way Google Sheet copy against a pretend Apps Script. Run: node test/sheet.test.js
const http = require('http'), { spawn } = require('child_process'), path = require('path'), assert = require('assert');
let got = null, hits = 0;
const mock = http.createServer((q, r) => { let b = ''; q.on('data', c => b += c); q.on('end', () => {
  if (q.url === '/redir' && q.method === 'POST') { hits++; got = JSON.parse(b); r.writeHead(302, { Location: '/done' }); return r.end(); }
  if (q.url === '/done') { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end(JSON.stringify(got.secret === 'pw' ? { ok: true, rows: got.sheets.reduce((n, s) => n + s.rows.length - 1, 0) } : { ok: false, error: 'Wrong secret' })); }
  r.writeHead(404); r.end(); }); }).listen(0, async () => {
  const mp = mock.address().port, port = 4100 + Math.floor(Math.random() * 90), wait = ms => new Promise(r => setTimeout(r, ms));
  const env = secret => Object.assign({}, process.env, { PORT: port, DATA_DIR: '/tmp/sheet-' + port + secret, SHEET_URL: 'http://127.0.0.1:' + mp + '/redir', SHEET_SECRET: secret, SHEET_WAIT_SEC: 1 });
  const call = async (m, p, body, tok) => { const r = await fetch('http://127.0.0.1:' + port + p, { method: m, headers: Object.assign({ 'content-type': 'application/json' }, tok ? { authorization: 'Bearer ' + tok } : {}), body: body && JSON.stringify(body) }); return { s: r.status, j: await r.json().catch(() => null) }; };
  try {
    let s = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: env('pw') }); s.stderr.on('data', d => process.stderr.write(d));
    await wait(2500); // first copy happens by itself after start
    assert.ok(got, 'first copy sent'); assert.deepStrictEqual(got.sheets.map(x => x.name), ['Daily summary', 'Hot list', 'Activity log', 'Leads', 'Renewals']);
    assert.ok(got.sheets[3].rows.length > 1000 && got.sheets[3].rows[0][0] === 'Lead ID');
    assert.ok(!JSON.stringify(got).includes('pinHash') && !/\"pin\"/.test(JSON.stringify(got)), 'no PINs in the copy');
    const ow = (await call('POST', '/api/login', { id: 's_owner', pin: '1111' })).j.token;
    const rc = (await call('POST', '/api/login', { id: 's_harsha', pin: '3001' })).j.token;
    assert.strictEqual((await call('POST', '/api/sheet-sync', {}, rc)).s, 403);
    await call('PUT', '/api/doc/activity/t1', { id: 't1', ts: Date.now(), date: new Date(Date.now() + 33e5).toISOString().slice(0, 10), staff: 's_harsha', kind: 'call', outcome: 'Connected', refName: 'Test Person', toStatus: 'Membership Sold' }, rc);
    const before = hits; const r = await call('POST', '/api/sheet-sync', {}, ow); assert.strictEqual(r.s, 200); assert.ok(r.j.last.ok, JSON.stringify(r.j)); assert.ok(hits > before);
    const daily = got.sheets[0].rows; assert.ok(daily.some(x => x[1] === 'Ms Harsha' && x[3] === 1 && x[4] === 1 && x[9] === 1), JSON.stringify(daily.slice(0, 3)));
    assert.ok(got.sheets[2].rows.some(x => x[6] === 'Test Person'));
    await call('PUT', '/api/doc/hot/h9', { id: 'h9', type: 'upgrade', name: 'Hot Person', phone: '9999999999', when: '2026-12-01', detail: '6m to 12m', amount: 12000, by: 's_harsha', status: 'open', createdBy: 's_harsha', createdAt: Date.now(), notes: [{ by: 's_harsha', ts: Date.now(), text: 'Will pay Friday' }] }, rc);
    await call('POST', '/api/sheet-sync', {}, ow); const hr = got.sheets[1].rows.find(x => x[4] === 'Hot Person'); assert.ok(hr && hr[2] === 'Plan upgrade' && hr[7] === 'Ms Harsha' && /Will pay Friday/.test(hr[9]), JSON.stringify(hr));
    assert.strictEqual((await call('GET', '/api/sheet-status', null, ow)).j.enabled, true);
    s.kill('SIGTERM'); await wait(400);
    s = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign(env('bad'), { DATA_DIR: '/tmp/sheet-x' + port }) }); await wait(2500);
    const ow2 = (await call('POST', '/api/login', { id: 's_owner', pin: '1111' })).j.token;
    const st = await call('POST', '/api/sheet-sync', {}, ow2); assert.strictEqual(st.j.last.ok, false); assert.ok(/Wrong secret/.test(st.j.last.msg));
    s.kill('SIGTERM'); console.log('SHEET COPY CHECKS PASSED');
  } catch (e) { console.error(e); process.exitCode = 1; }
  mock.close(); process.exit(process.exitCode || 0);
});
