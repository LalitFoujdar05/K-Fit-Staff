# Copy everything to a Google Sheet (automatic, one way)

The app stays the master. Every few minutes after staff log something, the server copies it into four tabs of your Google Sheet:
**Daily summary** (calls, counselling, WhatsApp, renewal calls, walk-ins, sold, renewed per person per day), **Activity log**, **Leads**, **Renewals**.
Do not type in those four tabs, they are rewritten on every copy. Make your own tabs for your own notes and charts.

## Part A: the sheet and the script (10 minutes, signed in as lalitfoujdarbtp@gmail.com)
1. Go to sheets.google.com, click **Blank spreadsheet**. Name it "K-Fit Staff data".
2. Click **Extensions**, then **Apps Script**. A code page opens.
3. Delete everything in the editor. Open `google-sheet-script.gs` from this folder in Notepad, copy everything, paste it in.
4. On line 8, change `CHANGE-THIS-TO-A-LONG-PASSWORD` to your own password, for example `kfit-Jaipur-7391-xyz`. Use only letters, numbers and dashes. Write it down, you need it again in Part B. Click the **save** icon.
5. Click **Deploy**, then **New deployment**. Click the gear next to "Select type" and choose **Web app**.
   - Description: `copy`
   - Execute as: **Me**
   - Who has access: **Anyone**  (the password in step 4 is what protects it, and the Sheet itself stays private)
6. Click **Deploy**. Google asks you to **Authorize access**: choose your account. If it says "Google hasn't verified this app", click **Advanced**, then **Go to (project name) (unsafe)**, then **Allow**. This is your own script, so it is fine.
7. Copy the **Web app URL**. It starts with `https://script.google.com/macros/s/` and ends with `/exec`.
8. Check: paste that URL in a new browser tab. You should see `{"ok":true,"note":"K-Fit Staff sheet receiver is running"}`.

## Part B: tell the app (5 minutes)
In Render, open your service, then **Environment**, and add two variables:
- `SHEET_URL` = the Web app URL from step 7
- `SHEET_SECRET` = the exact password from step 4

Save. Render redeploys itself in a couple of minutes.

## Part C: check
1. Open the app as Owner, tap **More**. You should see **Copy to Google Sheet**.
2. Tap **Copy to Google Sheet now**. It should say "Copied to Google Sheet" and show how many rows.
3. Open your Google Sheet. The tabs fill in within seconds.
After that it is automatic: about 90 seconds after any change, never more than once every 90 seconds.

## If it says failed
- `Wrong secret`: the password in Render differs from the script. Make them identical.
- `Unexpected reply`: in Apps Script, Deploy, Manage deployments, the access must be **Anyone**. After changing the script code, choose Deploy, Manage deployments, the pencil, Version: New version, Deploy.
- `fetch failed`: the SHEET_URL has a typo.

## Good to know
- Everything is copied, including customers' phone numbers. Keep the Sheet private, and share it only with people who should see them.
- Changing a cell in the Sheet does not change the app. To change data, use the app.
- It copies the last 60 days of activity. Older activity stays in the app and in the full Excel download.
