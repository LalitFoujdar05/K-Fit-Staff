// Runs the Google script's calendar logic against a pretend Google Calendar. Run: node test/gs.test.js
const vm = require('vm'), fs = require('fs'), assert = require('assert'), path = require('path');
const { build, parseTime } = require('../sheet.js');
assert.strictEqual(parseTime('6 PM'), '18:00'); assert.strictEqual(parseTime('7:30 am'), '07:30'); assert.strictEqual(parseTime('12 AM'), '00:00'); assert.strictEqual(parseTime('18:45'), '18:45'); assert.strictEqual(parseTime('Evening'), ''); assert.strictEqual(parseTime('13 pm'), '');
let log = { created: 0, deleted: 0 }, evs = [];
const mkEv = (title, start, end, o, allDay) => { const tags = {}; const ev = { title, start, end, desc: o.description, allDay, alive: true, tags, rem: [], getTag: k => tags[k] || null, setTag: (k, v) => { tags[k] = v; }, deleteEvent: () => { ev.alive = false; log.deleted++; }, removeAllReminders: () => {}, addPopupReminder: m => ev.rem.push(m) }; evs.push(ev); log.created++; return ev; };
const cal = { getEvents: () => evs.filter(e => e.alive), createEvent: (t, s, e, o) => mkEv(t, s, e, o, false), createAllDayEvent: (t, d, o) => mkEv(t, d, d, o, true) };
let calCount = 0, extra = null;
const ctx = { Utilities: { parseDate: (s) => new Date(s.replace(' ', 'T') + ':00+05:30') }, CalendarApp: { Color: { GREEN: 'g' }, getCalendarsByName: () => (calCount ? [cal] : []), createCalendar: () => { calCount++; return cal; }, getAllCalendars: () => [] }, SpreadsheetApp: {}, LockService: {}, ContentService: {}, console };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'google-sheet-script.gs'), 'utf8'), ctx);
const db = { d: { staff: { s1: { id: 's1', name: 'Ms Harsha' } }, leads: {}, renewals: { r1: { id: 'r1', name: 'Old Member', plan: '6 months', expiry: '2026-12-02', kind: 'Membership', fstatus: 'Thinking', phone: '9000000001', due: 3000 }, r2: { id: 'r2', name: 'Done Member', expiry: '2026-12-03', fstatus: 'Renewed' } }, activity: {}, config: {}, hot: {
  h1: { id: 'h1', type: 'visit', name: 'Rohit', phone: '9876543210', when: '2026-11-28', time: '6 PM', detail: 'trial', by: 's1', status: 'open', notes: [{ by: 's1', text: 'confirmed' }] },
  h2: { id: 'h2', type: 'pay', name: 'Asha', when: '2026-11-29', time: 'Evening', amount: 9000, by: 's1', status: 'open', notes: [] },
  h3: { id: 'h3', type: 'join', name: 'Cancelled One', when: '2026-11-29', by: 's1', status: 'cancelled', notes: [] },
  h4: { id: 'h4', type: 'visit', name: 'Far Future', when: '2027-06-01', by: 's1', status: 'open', notes: [] } } }, del: [] };
const now = new Date('2026-11-27T10:00:00+05:30').getTime();
const p1 = build(db, now, { renewals: false });
assert.deepStrictEqual(p1.events.map(e => e.key).sort(), ['hot:h1', 'hot:h2']); // cancelled and far-future left out
const msg = ctx.syncCalendar(JSON.parse(JSON.stringify(p1.events)), p1.calendarWindow);
assert.ok(/2 events \(2 new, 0 changed, 0 removed\)/.test(msg), msg);
const e1 = evs.find(e => e.getTag('kfit') === 'hot:h1'), e2 = evs.find(e => e.getTag('kfit') === 'hot:h2');
assert.ok(!e1.allDay && e1.rem[0] === 30 && /Visiting: Rohit/.test(e1.title) && /9876543210/.test(e1.desc) && e1.start.toISOString() === '2026-11-28T12:30:00.000Z');
assert.ok(e2.allDay && /When: Evening/.test(e2.desc));
// nothing changed: nothing is touched
let before = JSON.stringify(log); ctx.syncCalendar(JSON.parse(JSON.stringify(p1.events)), p1.calendarWindow); assert.strictEqual(JSON.stringify(log), before, 'no churn when unchanged');
// person is moved to the next day, other item is closed, one is cancelled
db.d.hot.h1.when = '2026-11-30'; db.d.hot.h2.status = 'done'; db.d.hot.h2.when = '2026-11-28'; delete db.d.hot.h1.notes;
db.d.hot.h1.notes = [];
let p2 = build(db, now, {}); let m2 = ctx.syncCalendar(JSON.parse(JSON.stringify(p2.events)), p2.calendarWindow); assert.ok(/2 changed/.test(m2), m2);
assert.ok(evs.filter(e => e.alive && e.getTag('kfit') === 'hot:h2')[0].title.startsWith('✓'));
db.d.hot.h1.status = 'cancelled'; p2 = build(db, now, {}); m2 = ctx.syncCalendar(JSON.parse(JSON.stringify(p2.events)), p2.calendarWindow); assert.ok(/1 removed/.test(m2), m2);
// someone's own event on the same calendar is never touched
const own = mkEv('Dentist', new Date(), new Date(), {}, false); ctx.syncCalendar([], p2.calendarWindow); assert.ok(own.alive, 'own events are left alone');
// membership expiry events when switched on
const p3 = build(db, now, { renewals: true }); assert.deepStrictEqual(p3.events.filter(e => e.key.startsWith('ren:')).map(e => e.key), ['ren:r1']);
console.log('CALENDAR SCRIPT CHECKS PASSED');
