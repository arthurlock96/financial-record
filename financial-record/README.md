# Financial Record

A personal money and debt record book that works as a **website** and as a **phone app** (an installable PWA).

## What it does
- **Home:** wallet card with your balance and this month's money in/out, bills progress ring, spending by category, debts summary, 6-month chart.
- **Records:** money in & out with a tap-to-pick category icon grid. List view or **calendar view** with daily totals and bill due dates.
- **Monthly bills:** a checklist for each month with three kinds of bill:
  - **Instalments** (car loan, house loan, 0% phone plan): monthly amount × number of months, months already paid, balance left, and end date.
  - **Credit cards:** enter each statement, then pay full, minimum (set % and floor) or part. Shows how much of your limit is used.
  - **Fixed monthly expenses** (rent, phone, insurance, streaming).
  Each bill shows Paid / Due soon / Late. Paying a bill can also add it to Money out automatically.
- **Debts:** who you owe and who owes you, partial payments, due dates and late warnings.
- **Privacy:** the eye icon hides all amounts on screen.
- The currency is picked from the phone's region (RM, S$, Rp, ₱, ฿, ¥…) and can be changed under Backup & settings.
- **Backup:** download a `.json` backup (restore it on any device) or a `.csv` you can open in Excel or Google Sheets.
- **Works offline** once it has been opened once, and installs on Android and iPhone home screens.

## Files
| File | Purpose |
|---|---|
| `index.html` | Page structure |
| `styles.css` | Look and layout (phone + desktop, light + dark) |
| `app.js` | All app logic. Data is saved in the browser (`localStorage`) |
| `manifest.webmanifest`, `icons/` | Lets phones install it like an app |
| `sw.js` | Offline support. Change `VERSION` in it whenever you update the app |

## Try it on your computer
```bash
cd ledger-app
python3 -m http.server 8000
# open http://localhost:8000
```

## Put it online (free)
Any static host works. Pick one:
- **Netlify Drop:** go to https://app.netlify.com/drop and drag the `ledger-app` folder in.
- **GitHub Pages:** push this folder to a GitHub repo, then Settings → Pages → deploy from the `main` branch.
- **Cloudflare Pages / Vercel:** connect the repo; there's no build step and the output folder is the root.

It must be served over **https** for phone installs and offline mode to work. All of the hosts above do that.

## Install on a phone
- **Android (Chrome):** open your site, tap ⋮ → *Install app*.
- **iPhone (Safari):** open your site, tap Share → *Add to Home Screen*.

## Important: where your data lives
Records are stored **only on the device and browser you use**. Your phone and computer do not sync yet.
Use **Backup → Download backup** regularly. Clearing browser data deletes your records.

## Next steps (roadmap)
1. **Accounts + sync across devices:** add a backend such as Supabase or Firebase (both have free tiers) with login, so the phone and the website share the same data.
2. **App store versions (optional):** wrap the same code with Capacitor to publish to the Google Play Store and the Apple App Store.
3. Extras: recurring bills, budgets per category, receipt photos, PIN or fingerprint lock, interest on loans, and reminders before due dates.
