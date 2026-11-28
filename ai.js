'use strict';
/* K-Fit Staff: the AI helper. Works with any "OpenAI-style" service (OpenAI, FreeLLMAPI, Groq, Gemini-compatible...).
   Settings (Render > Environment):  AI_BASE_URL (ends with /v1), AI_KEY, AI_MODEL.   The AI only PROPOSES changes; a person taps Confirm in the app. */
const OPEN = new Set(['Walk-in', 'Visited', 'Whatsapp Chat', 'Whatsapp Call', 'Call', 'Contacted', 'Price Issue']);
const TYPES = ['visit', 'join', 'pay', 'friends', 'upgrade', 'freeze', 'other'];
const ymd = ts => new Date(ts + 330 * 6e4).toISOString().slice(0, 10);
const hhmm = ts => new Date(ts + 330 * 6e4).toISOString().slice(11, 16);
const cut = (s, n) => String(s || '').replace(/\s+/g, ' ').slice(0, n);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !isNaN(new Date(s));

/* A small, phone-number-free picture of the business for the AI. */
function snapshot(db, now) {
  const t = ymd(now), d = db.d, name = id => (d.staff[id] || {}).name || '';
  const week = ymd(now - 3 * 864e5), soon = ymd(now + 10 * 864e5);
  const hot = Object.values(d.hot).filter(x => x.status === 'open' || (x.when >= week))
    .sort((a, b) => a.when.localeCompare(b.when)).slice(0, 80)
    .map(x => ({ id: x.id, type: x.type, name: x.name, when: x.when, time: x.time || '', status: x.status, by: name(x.by), detail: cut(x.detail, 60), amount: x.amount || 0, lastNote: cut(((x.notes || []).filter(n => !n.sys).slice(-1)[0] || {}).text, 80) }));
  const lead = l => ({ id: l.id, name: l.name, status: l.status, next: l.next || '', by: l.by || '', remark: cut(l.remarks, 70), last: cut((l.hist || []).slice(-1)[0], 60) });
  const leads = Object.values(d.leads).filter(l => OPEN.has(l.status) && l.next && l.next <= ymd(now + 2 * 864e5)).sort((a, b) => a.next.localeCompare(b.next)).slice(0, 60).map(lead);
  const lost = Object.values(d.leads).filter(l => !OPEN.has(l.status) && l.status !== 'Membership Sold' && (l.lastTouch || 0) > now - 14 * 864e5).slice(0, 25).map(lead);
  const ren = Object.values(d.renewals).filter(r => r.fstatus !== 'Renewed' && r.fstatus !== 'Not Interested' && r.expiry >= ymd(now - 15 * 864e5) && r.expiry <= soon).slice(0, 40)
    .map(r => ({ id: r.id, name: r.name, plan: r.plan, expiry: r.expiry, due: r.due || 0, status: r.fstatus, by: r.by || '' }));
  const acts = Object.values(d.activity).filter(a => a.date === t);
  const done = {}; acts.forEach(a => { const n = name(a.staff) || '?'; (done[n] = done[n] || {})[a.kind] = ((done[n] || {})[a.kind] || 0) + 1; });
  return { today: t, nowTime: hhmm(now), staff: Object.values(d.staff).filter(s => s.active !== false).map(s => s.name + ' (' + s.role + ')'), hot, leadsToFollowUp: leads, recentlyLost: lost, renewalsSoon: ren, workLoggedToday: done };
}

const SYSTEM = snap => `You are the assistant inside the K-FIT CLUB gym staff app (Jaipur, India). Be short, clear and practical. Reply in the language the user writes in (English or Hinglish).
Use ONLY the DATA below. Never invent people, dates or numbers. If the answer is not in the data, say so. Dates are YYYY-MM-DD, India time. Never show phone numbers.
Hot list = people expected to visit/join/pay/bring friends/upgrade/freeze. An open Hot item whose date is before today is "missing an update". A lead whose "next" date is before today was not followed up.
You may PROPOSE changes; nothing changes until a person taps Confirm. Allowed actions (use the real ids from DATA):
{"do":"move_hot","id":"H-..","when":"YYYY-MM-DD","time":"6 PM"}   (time optional)
{"do":"close_hot","id":"H-..","status":"done|missed|cancelled"}
{"do":"note_hot","id":"H-..","text":"..."}
{"do":"lead_next","id":"K-..","next":"YYYY-MM-DD"}
{"do":"note_lead","id":"K-..","text":"..."}
{"do":"add_hot","type":"visit|join|pay|friends|upgrade|freeze|other","name":"..","when":"YYYY-MM-DD","time":"..","detail":".."}
Answer with ONLY a JSON object: {"reply":"your answer (plain text, short lines)","actions":[ ... ]}. Use "actions":[] when nothing should change.
DATA:
${JSON.stringify(snap)}`;

/* Keep only well-formed actions that point at real records. */
function checkActions(list, db) {
  const out = [];
  (Array.isArray(list) ? list : []).slice(0, 8).forEach(a => {
    if (!a || typeof a !== 'object') return;
    const d = db.d;
    if (['move_hot', 'close_hot', 'note_hot'].includes(a.do)) {
      const x = d.hot[a.id]; if (!x) return;
      if (a.do === 'move_hot') { if (!isDate(a.when)) return; out.push({ do: a.do, id: a.id, label: x.name + ' (' + x.type + '): ' + x.when + (x.time ? ' ' + x.time : '') + '  →  ' + a.when + (a.time ? ' ' + cut(a.time, 20) : ''), when: a.when, time: cut(a.time, 20) }); }
      else if (a.do === 'close_hot') { if (!['done', 'missed', 'cancelled'].includes(a.status)) return; out.push({ do: a.do, id: a.id, label: x.name + ' (' + x.type + ', ' + x.when + '): mark ' + ({ done: 'happened', missed: 'did not happen', cancelled: 'cancelled' })[a.status], status: a.status }); }
      else { const text = cut(a.text, 300); if (!text) return; out.push({ do: a.do, id: a.id, label: 'Note on ' + x.name + ': ' + text, text }); }
    } else if (['lead_next', 'note_lead'].includes(a.do)) {
      const l = d.leads[a.id]; if (!l) return;
      if (a.do === 'lead_next') { if (!isDate(a.next)) return; out.push({ do: a.do, id: a.id, label: 'Follow-up for ' + l.name + ': ' + (l.next || 'none') + '  →  ' + a.next, next: a.next }); }
      else { const text = cut(a.text, 300); if (!text) return; out.push({ do: a.do, id: a.id, label: 'Note on lead ' + l.name + ': ' + text, text }); }
    } else if (a.do === 'add_hot') {
      if (!TYPES.includes(a.type) || !isDate(a.when) || !cut(a.name, 60)) return;
      out.push({ do: 'add_hot', label: 'Add to Hot list: ' + cut(a.name, 60) + ' (' + a.type + ') on ' + a.when + (a.time ? ' ' + cut(a.time, 20) : ''), type: a.type, name: cut(a.name, 60), when: a.when, time: cut(a.time, 20), detail: cut(a.detail, 120) });
    }
  });
  return out;
}

function parseReply(txt) {
  txt = String(txt || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const m = txt.match(/\{[\s\S]*\}/);
  if (m) { try { const j = JSON.parse(m[0]); if (j && typeof j.reply === 'string') return j; } catch (e) {} }
  return { reply: txt.replace(/^```(?:json)?|```$/g, '').trim() || 'No answer.', actions: [] };
}

const used = {}; // per person per day
function configured(env) { return !!(env.AI_BASE_URL && env.AI_KEY); }

async function ask(env, db, user, messages, now, fetchFn) {
  const cap = +env.AI_DAILY_PER_PERSON || 40, day = ymd(now), k = user.id + day;
  if ((used[k] || 0) >= cap) { const e = new Error('Daily AI limit reached (' + cap + ' questions). Try again tomorrow.'); e.status = 429; throw e; }
  const msgs = (Array.isArray(messages) ? messages : []).slice(-8).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: cut(m.content, 1500) })).filter(m => m.content);
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') { const e = new Error('Ask a question first'); e.status = 400; throw e; }
  used[k] = (used[k] || 0) + 1;
  const base = env.AI_BASE_URL.replace(/\/+$/, '');
  const r = await (fetchFn || fetch)(base + '/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.AI_KEY },
    body: JSON.stringify({ model: env.AI_MODEL || 'auto', temperature: 0.2, max_tokens: 900, messages: [{ role: 'system', content: SYSTEM(snapshot(db, now)) }].concat(msgs) }),
    signal: AbortSignal.timeout(45000)
  });
  const t = await r.text();
  if (!r.ok) { const e = new Error('The AI service said: ' + r.status + ' ' + cut(t, 160)); e.status = 502; throw e; }
  let j; try { j = JSON.parse(t); } catch (e) { const er = new Error('The AI service sent an unreadable answer'); er.status = 502; throw er; }
  const p = parseReply(((j.choices || [])[0] || {}).message && j.choices[0].message.content);
  return { reply: String(p.reply).slice(0, 2500), actions: checkActions(p.actions, db) };
}
module.exports = { snapshot, ask, checkActions, parseReply, configured };
