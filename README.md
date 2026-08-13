# SalaryFlow — Salary Expense Tracker

A private, offline, mobile-first app that tracks your salary cycle and tells you
exactly how much you can safely spend **per day** until your next payday.

- No sign-up, no login, no cloud account
- No backend, no database, no API keys
- 100% offline after you open it — all data stays in your browser (`localStorage`)
- Built with plain HTML, CSS and JavaScript — nothing to install, nothing to build

---

## 1. Project structure

```
salary-expense-tracker/
  index.html          → the app's single page (all screens live here)
  style.css            → all styling (light + dark theme)
  app.js                → all app logic (calculations, storage, rendering)
  manifest.json      → makes the app installable as a PWA
  sw.js                    → optional offline caching (service worker)
  README.md
  assets/
    icons/                → app icons used by manifest.json
```

You only ever need to open **`index.html`** — everything else is loaded automatically.

---

## 2. Opening the project in VS Code

1. Download/copy the whole `salary-expense-tracker` folder onto your computer.
2. Open **VS Code**.
3. Go to **File → Open Folder…** and select the `salary-expense-tracker` folder.
4. You'll see the files listed above in the Explorer sidebar on the left.

---

## 3. Running the application

You have two options. Either works.

### Option A — Just open the file (simplest)

1. In VS Code's Explorer, right-click **`index.html`**.
2. Choose **"Reveal in File Explorer"** (Windows) or copy its path.
3. Double-click `index.html` (or drag it into a browser window like Chrome or Edge).

The app will open and run fully. This is the fastest way to try it out.

> **Note:** with this method, the optional offline service worker (`sw.js`) may not
> register, because some browsers restrict service workers on `file://` pages.
> This does **not** break the app — your data still saves locally via
> `localStorage` and the app still works offline once loaded. It only means the
> "installable app" / cached-shell behavior of a PWA won't be active.

### Option B — Use a local server (recommended for full PWA support)

This enables the service worker so the app can be "installed" and reliably
reloaded offline.

1. Install the **"Live Server"** extension in VS Code (Extensions sidebar → search
   "Live Server" by Ritwick Dey → Install). This is a free, lightweight extension —
   no other setup needed.
2. Right-click `index.html` in the Explorer and choose **"Open with Live Server"**.
3. Your browser opens automatically at something like `http://127.0.0.1:5500`.

If you'd rather not install an extension, and you have Python already on your
computer, you can instead open a terminal in VS Code (**Terminal → New Terminal**)
and run:

```
python -m http.server 5500
```

then visit `http://localhost:5500` in your browser. (This is optional — the app
does not require Python to run; it's just one way to serve static files.)

---

## 4. Using the app

1. **First launch:** enter your salary amount, the date you were paid, and your
   next salary date. Pick a currency if you don't use ₹.
2. **Home:** see your remaining balance, today's safe daily spending limit, days
   left until payday, and your overall spending progress.
3. **Add an expense:** tap the **+** button, fill in the amount, category, date
   and an optional note, then save.
4. **Expenses tab:** search, filter (today / this week / this month / category)
   and sort your full expense history. Tap any expense to edit or delete it.
5. **Reports tab:** see totals, average daily spend, your top spending category,
   a full category breakdown, and a summary of the current salary cycle.
6. **Settings tab:** change your currency, switch light/dark/auto theme, update
   your salary or salary dates, manage categories, export/import a JSON backup,
   or clear all data.

All of this works with your device completely offline — nothing is sent anywhere.

---

## 5. Testing the app

Try each of these to confirm everything works as expected:

- [ ] First launch → set up salary → dashboard appears
- [ ] Add an expense → balance and daily limit update
- [ ] Delete an expense → balance updates back
- [ ] Edit an expense → all calculations refresh
- [ ] Change salary amount in Settings → dashboard recalculates
- [ ] Change next salary date → "days left" updates
- [ ] Change currency → every amount on screen updates
- [ ] Switch dark/light/auto theme → whole UI updates and stays readable
- [ ] Refresh the browser → your data is still there
- [ ] Close and reopen the browser → your data is still there
- [ ] Export a backup → a `salary-expense-backup.json` file downloads
- [ ] Import that backup → your data restores correctly
- [ ] Import a broken/invalid file → you get a friendly error, not a crash
- [ ] Delete all expenses → a friendly "No expenses yet" screen appears
- [ ] Add expenses that exceed your salary → app shows a calm overspend warning,
      never `NaN`/`Infinity`/`undefined`
- [ ] View on a small phone screen → nothing overflows or gets cut off
- [ ] View on a desktop browser window → layout stays centered and attractive

---

## 6. Troubleshooting

**My data disappeared.**
Data is stored per-browser via `localStorage`. It will be lost if you clear your
browser's site data/cookies for this page, use a different browser, or open the
file in "Incognito/Private" mode (private windows don't persist storage after
you close them). Use **Settings → Export data** regularly to keep a backup file.

**I see "No expenses yet" after adding an expense.**
Make sure the expense's date falls between your salary date and next salary
date — expenses outside the current cycle won't count toward this cycle's
totals, though they'll still appear in the full Expenses history list.

**The install/offline behavior isn't working.**
This requires Option B (a local server) above — service workers generally
don't run on pages opened directly via `file://`. The core app still works
fine without it.

**I accidentally cleared my data.**
Unfortunately this cannot be undone unless you had previously exported a
backup JSON file (Settings → Export data) — that's why "Clear all data"
asks for confirmation before proceeding.

---

## 7. Known limitations

- Data lives in a single browser's `localStorage`, so it does **not** sync
  across devices or browsers. Use Export/Import to move data manually.
- Because there's no backend, there's no way to recover data if browser
  storage is cleared without a prior export — this is the trade-off for
  keeping everything private and offline.
- The service worker (offline install/caching) needs the app to be served
  over `http://` or `https://` (e.g. via Live Server) rather than opened
  directly as a `file://` page — see Troubleshooting above.
- Charts are simple, lightweight HTML/CSS visualizations rather than a
  full charting library, by design (keeps the app fast and dependency-free).

---

Built with HTML, CSS and vanilla JavaScript only. No frameworks, no AI features,
no analytics, no ads, no external servers.
