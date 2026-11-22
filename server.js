'use strict';
/* K-Fit Staff server. No packages to install. Needs Node 18 or newer.  Run:  node server.js */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const { create, emptyDb, HttpError } = require('./public/store.js');

const PORT = +process.env.PORT || 3000;
const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PUBLIC = path.join(__dirname, 'public');
const TOKEN_DAYS = +process.env.TOKEN_DAYS || 30;
fs.mkdirSync(path.join(DATA, 'backups'), { recursive: true });

/* secret for sign-in tokens, made once and kept */
const secretFile = path.join(DATA, 'secret.txt');
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
const SECRET = process.env.SECRET || fs.readFileSync(secretFile, 'utf8').trim();

/* PINs are stored as salted scrypt hashes */
const hash = pin => { const salt = crypto.randomBytes(12).toString('hex'); return salt + ':' + crypto.scryptSync(pin, salt, 32).toString('hex'); };
const check = (pin, h) => { const [salt, k] = String(h).split(':'); if (!salt || !k) return false; const x = crypto.scryptSync(pin, salt, 32); const y = Buffer.from(k, 'hex'); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/* data lives in one file, written safely and often */
const dbFile = path.join(DATA, 'db.json');
let db = emptyDb();
if (fs.existsSync(dbFile)) db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
let timer = null, lastBackup = '';
function flush() {
  clearTimeout(timer); timer = null;
  const tmp = dbFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, dbFile);
  const day = new Date(Date.now() + 330 * 6e4).toISOString().slice(0, 10);
  if (day !== lastBackup) {
    lastBackup = day; fs.copyFileSync(dbFile, path.join(DATA, 'backups', 'db-' + day + '.json'));
    fs.readdirSync(path.join(DATA, 'backups')).sort().slice(0, -21).forEach(f => fs.unlinkSync(path.join(DATA, 'backups', f)));
  }
}
const save = () => { if (!timer) timer = setTimeout(flush, 400); };
const store = create(db, { save, hash, check, tz: +process.env.TZ_OFFSET_MIN || 330 });

const seedPaths = [path.join(DATA, 'seed.json'), path.join(__dirname, 'seed.json')];
const seedFile = seedPaths.find(p => fs.existsSync(p));
if (!Object.keys(db.d.staff).length) {
  if (seedFile) { store.seed(JSON.parse(fs.readFileSync(seedFile, 'utf8'))); flush(); console.log('Loaded starter data from', seedFile, '-', Object.keys(db.d.leads).length, 'leads,', Object.keys(db.d.renewals).length, 'renewals,', Object.keys(db.d.staff).length, 'staff'); }
  else {
    const pin = process.env.ADMIN_PIN || '1234';
    store.seed({ staff: [{ id: 's_owner', name: 'Owner', role: 'owner', pin, active: true }] }); flush();
    console.log('No seed.json found. Created one owner login, "Owner", PIN', pin);
  }
}

/* tokens */
const b64 = b => Buffer.from(b).toString('base64url');
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
const makeToken = id => { const p = b64(JSON.stringify({ id, exp: Date.now() + TOKEN_DAYS * 864e5 })); return p + '.' + sign(p); };
function readToken(t) {
  const [p, s] = String(t || '').split('.'); if (!p || !s) return null;
  const a = Buffer.from(sign(p)), b = Buffer.from(s); if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.exp > Date.now() ? o : null; } catch (e) { return null; }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const HEAD = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' };

function send(req, res, status, body, type, extra) {
  const h = Object.assign({ 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, HEAD, extra);
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  if (buf.length > 1024 && /gzip/.test(req.headers['accept-encoding'] || '') && !/image\//.test(h['Content-Type'])) { buf = zlib.gzipSync(buf); h['Content-Encoding'] = 'gzip'; }
  h['Content-Length'] = buf.length; res.writeHead(status, h); res.end(buf);
}
function readBody(req) {
  return new Promise((ok, no) => {
    let n = 0; const parts = [];
    req.on('data', c => { n += c.length; if (n > 6e6) { no(new HttpError(413, 'Too large')); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { ok(parts.length ? JSON.parse(Buffer.concat(parts).toString()) : {}); } catch (e) { no(new HttpError(400, 'Bad JSON')); } });
    req.on('error', no);
  });
}

async function api(req, res, url) {
  const p = url.pathname, m = req.method;
  if (p === '/api/staff-list' && m === 'GET') return send(req, res, 200, store.staffList());
  if (p === '/api/login' && m === 'POST') {
    const b = await readBody(req); const s = store.login(String(b.id || ''), b.pin);
    return send(req, res, 200, { token: makeToken(s.id), me: s });
  }
  const tok = readToken((req.headers.authorization || '').replace(/^Bearer /, ''));
  if (!tok) throw new HttpError(401, 'Signed out');
  const user = store.userFor(tok.id);
  if (p === '/api/me' && m === 'GET') return send(req, res, 200, store.clean(user));
  if (p === '/api/sync' && m === 'GET') return send(req, res, 200, store.sync(user, url.searchParams.get('since')));
  if (p === '/api/activity' && m === 'GET') return send(req, res, 200, store.activity(user, url.searchParams.get('from')));
  if (p === '/api/bulk' && m === 'POST') return send(req, res, 200, store.bulk(user, (await readBody(req)).ops));
  const d = p.match(/^\/api\/doc\/(\w+)\/([^/]+)$/);
  if (d) {
    const id = decodeURIComponent(d[2]);
    if (m === 'PUT' || m === 'PATCH') return send(req, res, 200, store.write(user, m === 'PUT' ? 'set' : 'update', d[1], id, await readBody(req)));
    if (m === 'DELETE') return send(req, res, 200, store.write(user, 'delete', d[1], id));
  }
  throw new HttpError(404, 'Not found');
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname); if (p === '/') p = '/index.html';
  const file = path.join(PUBLIC, p);
  if (!file.startsWith(PUBLIC + path.sep)) return send(req, res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, buf) => {
    if (err) return send(req, res, 404, 'Not found', 'text/plain');
    const ext = path.extname(file);
    send(req, res, 200, buf, MIME[ext] || 'application/octet-stream', { 'Cache-Control': ext === '.png' ? 'public, max-age=86400' : 'no-cache' });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/healthz') return send(req, res, 200, { ok: true });
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Not allowed');
    serveStatic(req, res, url);
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    send(req, res, e.status || 500, { error: e.status ? e.message : 'Server error' });
  }
});
server.listen(PORT, () => console.log('K-Fit Staff running on port ' + PORT + '  (data in ' + DATA + ')'));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { flush(); } catch (e) {} process.exit(0); });
