# K-FIT Staff App: how to explain it to your team (in to out)

## The one-line pitch
"Everything we promise a client (call, visit, payment, joining) goes into ONE place. Nothing lives in someone's head or a notebook."

## Before the meeting (you, 15 minutes)
1. Open the app link on your phone, sign in as Owner.
2. Check More > Staff: every person has the right name and role, and has their own PIN (give PINs privately, one by one).
3. Press "Copy to Google Sheet now" once so the Sheet and Calendar are filled.
4. Tell everyone to open the link in Chrome > menu > "Install app" / "Add to Home screen".

## A day in the life
### Morning (everyone, 2 minutes)
- Open app > Home. See today's calls, today's Hot list, and your own count.
- Receptionist: check the Hot list for today's visits/payments so you are ready at the desk.

### During the day
- Receptionist: every call, WhatsApp, walk-in = tap Log work (1 tap). New enquiry = add a Lead. Someone promises to visit/join/pay = add to Hot list with the date and time.
- Trainer: logs counselling and member follow-ups. Can see the Hot list so they know who is coming to the gym.
- Manager: watches the Hot list and Leads, reassigns work, closes items as Done / Missed, writes a note why.
- Owner: opens Home and Team to see who did how much; checks missed items and renewals.

### When something happens
- Visitor arrives -> open the Hot list item -> Done (it counts as a walk-in).
- Person joins -> mark Done on the linked lead (counts as a sale).
- Person did not come -> Missed + a note. Then reschedule with "Move date".
### Evening (manager, 5 minutes)
- Hot list: anything still Open from today must be closed or moved. Nothing stays "hanging".

## Who can do what
| | Receptionist | Trainer | Manager | Owner |
|---|---|---|---|---|
| Log own work | yes | yes | yes (and edit others) | yes |
| Add leads / Hot items | yes | yes | yes | yes |
| Delete leads / Hot items | no | no | yes | yes |
| See team activity | no | no | yes | yes |
| Staff, PINs, targets, Sheet copy | no | no | no | yes |

## The rules to tell your team
1. If it is not in the app, it did not happen.
2. Every Hot item has a date, a time and a person responsible.
3. Close everything the same day: Done, Missed or Moved.
4. Never share your PIN. 6 wrong tries = locked for 10 minutes.
5. Write one line in notes after every call.

## Where the data goes (in to out)
Staff phone -> app server (Render) -> database (Supabase) -> copy to Google Sheet and Google Calendar every ~90 seconds after a change -> owner sees reports in Sheet, staff see reminders in Calendar.
Backups: daily, kept 14 days.

## If something goes wrong
- "Loading..." for 30 seconds: the free server was asleep, wait and retry.
- Forgot PIN: owner resets it in More > Staff.
- Staff left: owner marks them inactive (their old work stays).
- Keep the GitHub repository PRIVATE (it holds customer phone numbers).

## AI helper and missing-update alerts
- Home shows "Missing updates" (managers: per person, with a Copy reminder button to paste in WhatsApp; staff: their own late items).
- "Ask K-Fit AI": ask who is visiting today, what was missed, or say "move Rohit's visit to tomorrow 9 PM". It shows a Confirm button; nothing changes until you tap it.
- Setup: see AI-SETUP.md.
