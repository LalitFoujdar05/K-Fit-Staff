# Go live for free

Three free accounts, no payment card: GitHub keeps the files, Supabase keeps the data, Render runs the app. UptimeRobot stops it from falling asleep.

## 1. Supabase (the data)
1. supabase.com, sign in with GitHub, New project. Any name. Choose a database password (save it, you will not need it again). Region: Mumbai. Wait 2 minutes.
2. Left menu, SQL Editor, New query. Paste everything from `supabase-setup.sql`, press Run.
3. Project Settings, API. Copy two things: the **Project URL** (https://something.supabase.co) and the **service_role** secret key. Use the secret one (a long key, either called service_role or starting with sb_secret_), not the "anon" or "publishable" one. Keep it private.

## 2. GitHub (the files)
New **private** repository. Add file, Upload files, drag in everything inside the `kfit-staff` folder (including `public`), Commit.

## 3. Render (the app)
1. render.com, sign in with GitHub. New, Web Service, pick your repository.
2. Language: Docker. Instance type: **Free**.
3. Environment Variables, add two: `SUPABASE_URL` = the Project URL, `SUPABASE_KEY` = the service_role key.
4. Create Web Service. After about 5 minutes you get an address like https://kfit-staff.onrender.com. No disk is needed.

## 4. Keep it awake
Free Render apps sleep after 15 minutes without visitors, and the next person waits about a minute. Fix: uptimerobot.com, free account, Add monitor, type HTTP(s), URL `https://YOUR-ADDRESS/healthz`, interval 5 minutes.

## 5. First use
Open the address, sign in as Owner (1111), More, Team & PINs, change every PIN. Then install on phones: Android Chrome, Install. iPhone Safari, Share, Add to Home Screen.

## Things to know
- Your data is in Supabase, so redeploys and restarts lose nothing. The server also saves a copy for each of the last 14 days.
- Supabase pauses projects nobody touched for a week. Daily staff use prevents that. If it ever pauses, press Restore in Supabase.
- Free plans can change. If Render stops being free, this folder also runs on any other host that runs Docker or Node, with the same two settings.
- Free Render has limited memory and speed. It is fine for a team of 8 to 10.
