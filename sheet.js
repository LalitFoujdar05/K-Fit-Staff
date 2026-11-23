'use strict';
/* Builds the tables that are copied to a Google Sheet (one way: app -> sheet). */
const KIND = { call: 'Call', counselling: 'Counselling', whatsapp: 'WhatsApp', renewal: 'Renewal call', walkin: 'Walk-in', note: 'Update' };
const DAYS = 60, TZ = 330;
const ymd = ts => new Date(ts + TZ * 6e4).toISOString().slice(0, 10);
const hm = ts => new Date(ts + TZ * 6e4).toISOString().slice(11, 16);
const num = v => (typeof v === 'number' ? v : v === '' || v == null ? '' : Number(v) || '');

function build(db, now) {
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

  return {
    updated: ymd(now) + ' ' + hm(now) + ' IST',
    sheets: [
      { name: 'Daily summary', textCols: [], rows: [['Date', 'Staff', 'Role', 'Calls', 'Calls connected', 'Counselling', 'WhatsApp leads', 'Renewal calls', 'Walk-ins', 'Memberships sold', 'Renewed']]
        .concat(daily.map(s => [s.date, name(s.staff), role(s.staff), s.call, s.connected, s.counselling, s.whatsapp, s.renewal, s.walkin, s.sold, s.renewed])) },
      { name: 'Activity log', textCols: [], rows: [['Date', 'Time', 'Staff', 'Role', 'What', 'Result', 'Person', 'Status set', 'Note']]
        .concat(acts.map(a => [a.date, hm(a.ts), name(a.staff), role(a.staff), KIND[a.kind] || a.kind, a.outcome || '', a.refName || '', a.toStatus || '', a.note || ''])) },
      { name: 'Leads', textCols: [3], rows: [['Lead ID', 'Enquiry date', 'Name', 'Phone', 'Plan', 'Status', 'Next follow-up', 'Assigned to', 'Remark', 'Follow-up history']]
        .concat(leads.map(l => [l.id, l.date || '', l.name || '', l.phone || '', l.plan || '', l.status || '', l.next || '', l.by || '', l.remarks || '', (l.hist || []).join(' | ')])) },
      { name: 'Renewals', textCols: [3], rows: [['ID', 'Type', 'Name', 'Phone', 'Plan', 'Start', 'Expiry', 'Amount', 'Paid', 'Due', 'Renewal status', 'Priority', 'Note', 'Assigned to']]
        .concat(ren.map(r => [r.id, r.kind || '', r.name || '', r.phone || '', r.plan || '', r.start || '', r.expiry || '', num(r.amount), num(r.paid), num(r.due), r.fstatus || '', r.priority || '', r.note || '', r.by || ''])) }
    ]
  };
}
module.exports = { build };
