// AI helper checks with a pretend AI service. Run: node test/ai.test.js
const assert = require('assert'), http = require('http'), { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const ai = require('../ai.js'), K = require('../public/store.js');
const t0 = Date.parse('2026-11-28T10:00:00+05:30');
const db = K.emptyDb(); const st = K.create(db, {}); st.seed({ staff: [{ id: 'o', name: 'Boss', role: 'owner', pin: '1111' }], leads: [{ id: 'K-1', name: 'Amit', phone: '9999999999', status: 'Call', next: '2026-11-26', by: 'Boss', remarks: 'x', hist: [] }],
  hot: [{ id: 'H-1', type: 'visit', name: 'Rohit', phone: '8888888888', when: '2026-11-28', time: '6 PM', status: 'open', by: 'o', notes: [] }] });
const snap = ai.snapshot(db, t0);
assert.strictEqual(snap.today, '2026-11-28'); assert(!JSON.stringify(snap).match(/9999999999|8888888888/), 'no phone numbers sent to AI');
assert.strictEqual(snap.hot[0].name, 'Rohit'); assert.strictEqual(snap.leadsToFollowUp[0].name, 'Amit');
const good = ai.checkActions([{ do: 'move_hot', id: 'H-1', when: '2026-11-29', time: '9 PM' }, { do: 'move_hot', id: 'NOPE', when: '2026-11-29' }, { do: 'move_hot', id: 'H-1', when: 'tomorrow' }, { do: 'close_hot', id: 'H-1', status: 'deleted' }, { do: 'drop_db' }, { do: 'add_hot', type: 'visit', name: 'Sam', when: '2026-12-01' }], db);
assert.strictEqual(good.length, 2); assert.strictEqual(good[0].do, 'move_hot');
assert.strictEqual(ai.parseReply('```json\n{"reply":"hi","actions":[]}\n```').reply, 'hi');
assert.strictEqual(ai.parseReply('just text').reply, 'just text');

const mock = http.createServer((req, res) => { let b = ''; req.on('data', d => b += d); req.on('end', () => {
  if (req.headers.authorization !== 'Bearer KEY') { res.writeHead(401); return res.end('{}'); }
  const j = JSON.parse(b); assert(j.messages[0].content.includes('Rohit'));
  res.writeHead(200, { 'Content-Type': 'application/json' });
  const today = new Date(Date.now() + 330 * 6e4).toISOString().slice(0, 10);
  res.end(JSON.stringify({ choices: [{ message: { content: '<think>x</think>{"reply":"Rohit visits at 6 PM","actions":[{"do":"note_lead","id":"K-NOPE","text":"hello"},{"do":"add_hot","type":"visit","name":"Zed","when":"' + today + '"}]}' } }] }));
}); });
mock.listen(0, async () => {
  const mp = mock.address().port, port = 3900 + Math.floor(Math.random() * 90), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kai-'));
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: dir, AI_BASE_URL: 'http://127.0.0.1:' + mp + '/v1', AI_KEY: 'KEY', AI_MODEL: 'auto' }) });
  const call = async (m, u, b, tok) => { const r = await fetch('http://127.0.0.1:' + port + u, { method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}), body: b ? JSON.stringify(b) : undefined }); return { s: r.status, j: await r.json().catch(() => null) }; };
  try {
    for (let i = 0; i < 50; i++) { try { await fetch('http://127.0.0.1:' + port + '/healthz'); break; } catch (e) { await new Promise(r => setTimeout(r, 150)); } }
    const tok = (await call('POST', '/api/login', { id: 's_owner', pin: '1111' })).j.token;
    assert.strictEqual((await call('POST', '/api/ai', { messages: [{ role: 'user', content: 'hi' }] })).s, 401);
    assert.strictEqual((await call('GET', '/api/ai-status', null, tok)).j.enabled, true);
    const r = await call('POST', '/api/ai', { messages: [{ role: 'user', content: 'what is planned today?' }] }, tok);
    assert.strictEqual(r.s, 200); assert.strictEqual(r.j.reply, 'Rohit visits at 6 PM');
    assert.strictEqual(r.j.actions.length, 1, 'only the valid action survives'); assert.strictEqual(r.j.actions[0].do, 'add_hot');
    assert.strictEqual((await call('POST', '/api/ai', { messages: [] }, tok)).s, 400);
    console.log('AI HELPER CHECKS PASSED');
  } catch (e) { console.error(e); process.exitCode = 1; } finally { srv.kill(); mock.close(); }
});
