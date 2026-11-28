# Google Calendar for K-Fit (simple steps)

Every Hot list item (visit, joining, payment, friends, upgrade, freeze) becomes an event in a calendar called **K-Fit Hot List**.
The app updates the calendar. It does not work the other way (changing the calendar does not change the app).

1. Upload the new files to GitHub (sheet.js, server.js, Dockerfile, public folder) and press Commit. Wait for Render to say Live.
2. Open your Google Sheet > Extensions > Apps Script. Delete the old code and paste all of `google-sheet-script.gs`.
   Keep the SAME password in the line `const SECRET = '...'` as the one you put in Render (SHEET_SECRET). Save.
3. In the top bar pick the function `authorize` and press Run. Google asks permission: Review permissions > your account > Advanced > Go to project > Allow.
4. Deploy > Manage deployments > pencil icon > Version: New version > Deploy.
5. In the app (Owner) press "Copy to Google Sheet now". The message should say "Calendar: N events".
6. Open calendar.google.com. On the left, under "My calendars", you will see **K-Fit Hot List**.
7. Share it: hover on it > three dots > Settings and sharing > Share with specific people > add staff emails (permission: "See all event details").

Optional: add `CALENDAR_RENEWALS=1` in Render > Environment to also put membership expiry dates in the calendar.

Notes: events with a time like "6 PM" or "18:30" are timed (30 min reminder). Words like "Evening" make an all-day event.
Only events made by the app are changed. Your own events in other calendars are never touched.
