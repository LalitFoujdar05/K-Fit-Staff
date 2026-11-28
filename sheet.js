'use strict';
/* Builds the tables that are copied to a Google Sheet (one way: app -> sheet). */
const KIND = { call: 'Call', counselling: 'Counselling', whatsapp: 'WhatsApp', renewal: 'Renewal call', walkin: 'Walk-in', note: 'Update' };
const HOT = { visit: 'Visiting', join: 'Joining', pay: 'Will pay', friends: 'Bringing friends', upgrade: 'Plan upgrade', freeze: 'Freezing', other: 'Other' };
const HSTAT = { open: 'Waiting', done: 'Happened', missed: 'Did not happen', cancelled: 'Cancelled' };
const DAYS = 60, TZ = 330;
const ymd = ts => new Date(ts + TZ * 6e4).toISOString().slice(0, 10);
const hm = ts => new Date(ts + TZ * 6e4).toISOString().slice(11, 16);
const num = v => (typeof v === 'number' ? v : v === '' || v == null ? '' : Number(v) || '');

const TIME12 = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i, TIME24 = /^\s*(\d{1,2}):(\d{2})\s*$/;
function parseTime(t) { // "6 PM", "6:30 pm", "18:30" -> "18:30"; anything else ("Evening") -> "" (all-day event)
  let m = TIME12.exec(t || '');
  if (m) { if (+m[1] < 1 || +m[1] > 12 || (m[2] && +m[2] > 59)) return ''; let h = +m[1] % 12; if (/pm/i.test(m[3])) h += 12; return String(h).padStart(2, '0') + ':' + (m[2] || '00'); }
  m = TIME24.exec(t || ''); if (m && +m[1] < 24 && +m[2] < 60) return String(+m[1]).padStart(2, '0') + ':' + m[2];
  return '';
}

function build(db, now, opts) {
  opts = opts || {};
  const staff = db.d.staff, name = id => (staff[id] && staff[id].name) || '';
  const role = id => (staff[id] && staff[id].role) || '';
  const leads = Object.values(db.d.leads).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(a.id).localeCompare(String(b.id)));
  const ren = Object.values(db.d.renewals).sort((a, b) => String(a.expiry || '9999').localeCompare(String(b.expiry || '9999')));
  const cutoff = ymd(now - DAYS * 864e5);
  const acts = Object.values(db.d.activity).filter(a => a.date >= cutoff).sort((a, b) => b.ts - a.ts);

  const sum = {};
  acts.forEach(a => {
    const k = a.date + '|' + a.staff; const s = sum[k] || (sum[k] = { date: a.date, staff: a.staff, call: 0, connected: 0, counselling: 0, whatsapp: 0, renewal: 0, walkin: 0, sold: 0, renewed: 0 });
    if (s[a.kind] != null) s[a.kind]++;
    if (a.kind === 'call' && a.outcome === 'Connected') s.connected++;
    if (a.toStatus === 'Membership Sold') s.sold++;
    if (a.toStatus === 'Renewed') s.renewed++;
  });
  const daily = Object.values(sum).sort((a, b) => b.date.localeCompare(a.date) || name(a.staff).localeCompare(name(b.staff)));

  const hotCut = ymd(now - 90 * 864e5);
  const hot = Object.values(db.d.hot || {}).filter(h => h.status === 'open' || h.when >= hotCut).sort((a, b) => String(b.when).localeCompare(String(a.when)));
  const lastNote = h => { const n = (h.notes || []).filter(x => !x.sys).slice(-1)[0]; return n ? name(n.by) + ': ' + n.text : ''; };
  // events for Google Calendar: hot list items (and, if switched on, membership expiries) from 14 days ago to 90 days ahead
  const evFrom = ymd(now - 14 * 864e5), evTo = ymd(now + 90 * 864e5), events = [];
  Object.values(db.d.hot || {}).forEach(h => {
    if (h.status === 'cancelled' || !h.when || h.when < evFrom || h.when > evTo) return;
    const mark = h.status === 'done' ? '\u2713 ' : h.status === 'missed' ? '\u2717 ' : '';
    const t = parseTime(h.time), who = name(h.by);
    const notes = (h.notes || []).filter(x => !x.sys).slice(-3).map(x => name(x.by) + ': ' + x.text);
    events.push({ key: 'hot:' + h.id, date: h.when, time: t, mins: 60, title: mark + (HOT[h.type] || h.type) + ': ' + h.name + (who ? ' \u00b7 ' + who : ''),
      desc: [(HOT[h.type] || h.type) + (h.detail ? ': ' + h.detail : ''), h.amount ? 'Amount: Rs ' + h.amount : '', h.phone ? 'Phone: ' + h.phone : '', who ? 'Handled by: ' + who : '', h.time && !t ? 'When: ' + h.time : '', notes.length ? 'Notes:\n' + notes.join('\n') : '', 'Status: ' + (HSTAT[h.status] || h.status)].filter(Boolean).join('\n') });
  });
  if (opts.renewals) Object.values(db.d.renewals).forEach(r => {
    if (!r.expiry || r.expiry < evFrom || r.expiry > evTo || r.fstatus === 'Renewed') return;
    events.push({ key: 'ren:' + r.id, date: r.expiry, time: '', mins: 60, title: 'Expires: ' + r.name + (r.plan ? ' (' + r.plan + ')' : ''), desc: [r.kind || '', r.phone ? 'Phone: ' + r.phone : '', r.due ? 'Due: Rs ' + r.due : '', 'Renewal status: ' + (r.fstatus || '')].filter(Boolean).join('\n') });
  });
  return {
    events, calendarWindow: { from: evFrom, to: evTo },
    updated: ymd(now) + ' ' + hm(now) + ' IST',
    sheets: [
      { name: 'Daily summary', textCols: [], rows: [['Date', 'Staff', 'Role', 'Calls', 'Calls connected', 'Counselling', 'WhatsApp leads', 'Renewal calls', 'Walk-ins', 'Memberships sold', 'Renewed']]
        .concat(daily.map(s => [s.date, name(s.staff), role(s.staff), s.call, s.connected, s.counselling, s.whatsapp, s.renewal, s.walkin, s.sold, s.renewed])) },
      { name: 'Hot list', textCols: [3], rows: [['Expected on', 'Time', 'What', 'Phone', 'Person', 'Detail', 'Amount', 'Handled by', 'Status', 'Last note', 'Added by', 'Added on']]
        .concat(hot.map(h => [h.when || '', h.time || '', HOT[h.type] || h.type, h.phone || '', h.name || '', h.detail || '', num(h.amount), name(h.by), HSTAT[h.status] || h.status, lastNote(h), name(h.createdBy), h.createdAt ? ymd(h.createdAt) : ''])) },
      { name: 'Activity log', textCols: [], rows: [['Date', 'Time', 'Staff', 'Role', 'What', 'Result', 'Person', 'Status set', 'Note']]
        .concat(acts.map(a => [a.date, hm(a.ts), name(a.staff), role(a.staff), KIND[a.kind] || a.kind, a.outcome || '', a.refName || '', a.toStatus || '', a.note || ''])) },
      { name: 'Leads', textCols: [3], rows: [['Lead ID', 'Enquiry date', 'Name', 'Phone', 'Plan', 'Status', 'Next follow-up', 'Assigned to', 'Remark', 'Follow-up history']]
        .concat(leads.map(l => [l.id, l.date || '', l.name || '', l.phone || '', l.plan || '', l.status || '', l.next || '', l.by || '', l.remarks || '', (l.hist || []).join(' | ')])) },
      { name: 'Renewals', textCols: [3], rows: [['ID', 'Type', 'Name', 'Phone', 'Plan', 'Start', 'Expiry', 'Amount', 'Paid', 'Due', 'Renewal status', 'Priority', 'Note', 'Assigned to']]
        .concat(ren.map(r => [r.id, r.kind || '', r.name || '', r.phone || '', r.plan || '', r.start || '', r.expiry || '', num(r.amount), num(r.paid), num(r.due), r.fstatus || '', r.priority || '', r.note || '', r.by || ''])) }
    ]
  };
}
module.exports = { build, parseTime };
