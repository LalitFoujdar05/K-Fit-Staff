# K-Fit Staff

Your staff app: every receptionist, trainer, manager and owner signs in on their own phone with a 4-digit PIN. Calls, counselling, WhatsApp leads and renewal calls are logged, and the manager and owner see the whole team live.

All screens are the ones you designed. What changed: it now has its own small server (so everyone shares the same data), the app installs on a phone, and PINs are checked by the server instead of being visible in the data.

```
Phones (installed app)  <──internet──>  server.js  ──>  data/db.json  (one file = all your data)
```

## 1. Try it on your computer (2 minutes)

Install Node 18 or newer from nodejs.org, then in this folder:

```
node server.js
```

Open http://localhost:3000. On the first start it loads `seed.json` (your 1,135 leads, 50 renewals and 8 staff). Starting PINs: Owner 1111, Manager 2222, receptionists 3001 to 3004, trainers 4001 and 4002. **Sign in as Owner, open More, Team & PINs and change every PIN.**

## 2. Put it online so phones can reach it

It must run somewhere that is always on. Pick one:

- **A small cloud server (best).** Any VPS with 512 MB memory works (about ₹400 to ₹600 a month). Install Docker, then:
  `docker build -t kfit-staff . && docker run -d --restart unless-stopped -p 3000:3000 -v kfit-data:/data kfit-staff`
  Put HTTPS in front. With Caddy it is two lines: `app.yourdomain.in { reverse_proxy localhost:3000 }`.
- **A hosting service** such as Render or Railway: create a Web Service from this folder (it has a Dockerfile) and attach a 1 GB persistent disk mounted at `/data`. Without a disk, your data is wiped on every restart.
- **A PC at the gym.** Run `node server.js` and use a Cloudflare Tunnel for a safe HTTPS address. The PC must stay on.

HTTPS is required for installing the app.

## 3. Install on each phone

Open your address in the browser.
- **Android:** Chrome shows Install, or use the menu then Install app. Also in More, Put this app on your phone, Install.
- **iPhone:** Safari, Share, Add to Home Screen.

It opens full screen with the K-Fit icon, and stays signed in for 30 days.

Want a real Android file (.apk) too? Set `server.url` in `android-app/capacitor.config.json` to your HTTPS address, upload the folder to a private GitHub repo, and run Actions, Build Android APK. Or paste your address into pwabuilder.com. Either way is optional; the installed web app does the same job.

## Backups

All data is `data/db.json` (in Docker: `/data/db.json`). The server keeps a copy for each of the last 21 days in `data/backups/`. Copy that folder somewhere else weekly. To restore, stop the server and replace `db.json`.

## Settings (environment variables)

| Name | Default | Meaning |
| --- | --- | --- |
| `PORT` | 3000 | Port |
| `DATA_DIR` | `./data` | Where data is kept |
| `TOKEN_DAYS` | 30 | Days a phone stays signed in |
| `TZ_OFFSET_MIN` | 330 | India time |
| `ADMIN_PIN` | 1234 | Only used if there is no `seed.json` |

## What is different from your original

- Sign-in is checked by the server. PINs are stored hashed and never sent to phones. Six wrong tries lock that person for 10 minutes.
- Only the owner can change staff, PINs and targets. Only managers can delete leads and renewals or remove other people's log entries. A person can only log their own work.
- A status change with no call is saved as an update, not counted as a call. Before, changing a lead's status added one to the call count.
- Tapping Call or WhatsApp on a lead pre-selects "what did you do", so the log takes one tap less.
- Overdue follow-ups list the oldest first.
- Downloaded Excel includes all staff activity, not only the last 31 days.
- Works offline for reading; shows a banner and does not pretend changes are saved.
- The Excel import (More) now saves in batches, so 1,000 rows take seconds.

## Not tested

- Real phones. It was tested in a phone-sized browser against the real server with your data, not on actual Android or iPhone devices.
- Excel download and import. They use the same library as before, loaded from the internet (cdnjs). Please try once.
- The APK build and your hosting setup.

## Files

`server.js` server · `public/` the app (`index.html`, `net.js`, `store.js`, `sw.js`, icons) · `seed.json` your starting data (contains customer phone numbers, keep it private) · `test/api.test.js` run with `node test/api.test.js` · `android-app/` optional APK wrapper.
