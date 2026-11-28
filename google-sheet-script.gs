/**
 * K-Fit Staff: receives the copy of your data and writes it into this Google Sheet.
 * Paste this whole file into Extensions > Apps Script, change SECRET below, then Deploy as a Web app.
 * It also keeps a Google Calendar called "K-Fit Hot List" up to date (one event per Hot list item).
 * It only ever writes to the tabs: Daily summary, Hot list, Activity log, Leads, Renewals. Anything you type in those tabs is overwritten
 * on the next copy, so do your own work in other tabs.
 */
const SECRET = 'CHANGE-THIS-TO-A-LONG-PASSWORD';
const CAL_NAME = 'K-Fit Hot List';
const TZ = 'Asia/Kolkata';

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const data = JSON.parse(e.postData.contents);
    if (data.secret !== SECRET) return out({ ok: false, error: 'Wrong secret' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let total = 0;
    data.sheets.forEach(function (t) {
      let sh = ss.getSheetByName(t.name) || ss.insertSheet(t.name);
      const rows = t.rows, cols = rows[0].length;
      sh.clearContents();
      if (sh.getMaxRows() < rows.length + 1) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 1 - sh.getMaxRows());
      if (sh.getMaxColumns() < cols) sh.insertColumnsAfter(sh.getMaxColumns(), cols - sh.getMaxColumns());
      (t.textCols || []).forEach(function (c) { sh.getRange(1, c + 1, sh.getMaxRows(), 1).setNumberFormat('@'); });
      sh.getRange(1, 1, rows.length, cols).setValues(rows);
      const head = sh.getRange(1, 1, 1, cols);
      head.setFontWeight('bold').setBackground('#0E6B5C').setFontColor('#ffffff');
      sh.setFrozenRows(1);
      total += rows.length - 1;
    });
    let info = ss.getSheetByName('Last updated') || ss.insertSheet('Last updated');
    info.getRange('A1').setValue('Last copied from the K-Fit app');
    info.getRange('B1').setValue(data.updated);
    let calMsg = '';
    if (data.events && data.calendarWindow) {
      try { calMsg = syncCalendar(data.events, data.calendarWindow); }
      catch (err) { calMsg = 'Calendar problem: ' + String(err).slice(0, 120); }
    }
    return out({ ok: true, rows: total, calendar: calMsg });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/** Keeps the calendar equal to the list sent by the app. Only events made by this script (tagged) are ever changed or removed. */
function syncCalendar(events, win) {
  const found = CalendarApp.getCalendarsByName(CAL_NAME);
  const cal = found.length ? found[0] : CalendarApp.createCalendar(CAL_NAME, { timeZone: TZ, color: CalendarApp.Color.GREEN });
  const from = Utilities.parseDate(win.from + ' 00:00', TZ, 'yyyy-MM-dd HH:mm');
  const to = Utilities.parseDate(win.to + ' 23:59', TZ, 'yyyy-MM-dd HH:mm');
  const have = {};
  cal.getEvents(from, to).forEach(function (ev) {
    const k = ev.getTag('kfit');
    if (!k) return;                       // not ours: leave it alone
    if (have[k]) ev.deleteEvent(); else have[k] = ev;
  });
  let made = 0, changed = 0, removed = 0;
  events.forEach(function (x) {
    const sig = JSON.stringify([x.title, x.date, x.time, x.mins, x.desc]);
    const ev = have[x.key]; delete have[x.key];
    if (ev) { if (ev.getTag('sig') === sig) return; ev.deleteEvent(); changed++; } else made++;
    let n;
    if (x.time) {
      const s = Utilities.parseDate(x.date + ' ' + x.time, TZ, 'yyyy-MM-dd HH:mm');
      n = cal.createEvent(x.title, s, new Date(s.getTime() + x.mins * 60000), { description: x.desc });
      n.removeAllReminders(); n.addPopupReminder(30);
    } else {
      n = cal.createAllDayEvent(x.title, Utilities.parseDate(x.date + ' 12:00', TZ, 'yyyy-MM-dd HH:mm'), { description: x.desc });
    }
    n.setTag('kfit', x.key); n.setTag('sig', sig);
  });
  Object.keys(have).forEach(function (k) { have[k].deleteEvent(); removed++; });
  return 'Calendar: ' + events.length + ' events (' + made + ' new, ' + changed + ' changed, ' + removed + ' removed)';
}

/** Run this once by hand (select authorize, press Run) so Google asks you to allow Calendar access. */
function authorize() {
  CalendarApp.getAllCalendars();
  SpreadsheetApp.getActiveSpreadsheet();
}

function doGet() { return out({ ok: true, note: 'K-Fit Staff sheet receiver is running' }); }

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
