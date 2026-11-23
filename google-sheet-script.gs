/**
 * K-Fit Staff: receives the copy of your data and writes it into this Google Sheet.
 * Paste this whole file into Extensions > Apps Script, change SECRET below, then Deploy as a Web app.
 * It only ever writes to the tabs: Daily summary, Activity log, Leads, Renewals. Anything you type in those tabs is overwritten
 * on the next copy, so do your own work in other tabs.
 */
const SECRET = 'CHANGE-THIS-TO-A-LONG-PASSWORD';

function doPost(e) {
  try {
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
    return out({ ok: true, rows: total });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function doGet() { return out({ ok: true, note: 'K-Fit Staff sheet receiver is running' }); }

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
