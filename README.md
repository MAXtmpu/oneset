# Myodose: a HIT (single set to failure) training app

This repository serves **https://myodose.app** through GitHub Pages:

| Path | What |
| --- | --- |
| `index.html`, `assets/` | The "coming soon" landing page, with screenshots of the iPhone app (`assets/shots/`, light and dark) and icons rendered from the app icon. |
| `privacy.html`, `support.html` | The privacy policy and support page that the App Store listing links to. |
| `sw.js` | Retires the web app's old service worker at the site root, so returning visitors see the landing page. |
| `app/` | The original web app, kept working at `myodose.app/app/` but no longer linked. |

The rest of this README describes the web app in `app/`.

An offline-first iPhone web app for high-intensity, single-set-to-failure strength training: one set per
exercise, slow cadence, taken to momentary muscular failure. Time under load (TUL) is
recorded automatically. After each workout you get a verdict and a recommended rest period.

## The flow in the gym

1. **Train → Start workout.** Shows the next workout in your routine (A/B routines rotate automatically) and the suggested weight for each exercise.
2. **Start exercise.** 10 s get-ready countdown with beeps, then the TUL timer starts. The ring turns green when you reach the target window and blue once you pass its ceiling.
3. **Failure: done.** Confirm weight and reps (both pre-filled). TUL is already recorded. Save, then on to the next exercise. The time between exercises is tracked.
4. **At the end you get a verdict**: *You progressed* / *Held steady* / *Recover more*, the minimum number of rest days, and next session's weights.

Useful extras: **Machine busy, do later** pushes an exercise to the end of the workout. *Machine setup* remembers seat and pad positions and the weight increment for each machine. If the app is killed mid-workout it resumes exactly where you were. The screen stays awake during workouts.

## How it decides

**Capacity score.** Each set gets a capacity score: `load × (1 + TUL / (30 × secondsPerRep))`. This is an Epley-style estimate with
TUL turned into rep-equivalents. Seconds-per-rep is the median of your own history for that exercise, so it adapts to your cadence.
"Heavier but shorter" still counts as progress, which a load × time score gets wrong.

**Verdict.** Every exercise is compared with the last time you did it, using the same technique family. More than ±1.5% is
"improved"/"regressed". If 60% or more improved, you progressed. If half or more regressed (or the average is −2% or worse),
you need more recovery. Anything else counts as held steady.

**Rest recommendation.** Starts from the routine's base gap, then adapts:
- Progressed: keep the gap you just used.
- Held steady: add about 20% (at least 1 day).
- Regressed: add about 40% (at least 2 days).
- The gap stays within the routine's min/max.
- A gap longer than the routine's max counts as a layoff, so a drop after it isn't blamed on poor recovery.
- Intensity techniques you actually did add up to +2 days.
- Two regressions in a row prompt you to consolidate.

**Next weight.** Double progression on TUL:
- Within the window: same load, beat your time.
- Over the ceiling: load goes up to land in the upper part of the window (capped at +10%, rounded to that machine's increment).
- Clearly under the floor: load comes down.

## Routines included

| Routine | Structure | Gap | TUL |
|---|---|---|---|
| Foundation Five | Seated row, chest press, pulldown, overhead press, leg press | 7 d (5–14) | 90–120 s |
| Foundation Split (A/B) | A: leg press, pulldown, chest press · B: leg curl, row, overhead press, lower back | 4 d (3–10) | 90–120 s |
| Consolidated Three | Leg press, pulldown, chest press | 10 d (7–21) | 90–120 s |
| Full-Body A/B | Two 6-exercise full-body workouts (classic HIT A/B) | 3 d (2–8) | 60–90 s |
| Upper / Lower | 6 upper / 6 lower, leg extension pre-exhausts leg press | 3 d (2–8) | 60–90 s |
| Pre-Exhaust Circuit | 4 isolation→compound pairs, zero rest | 5 d (4–12) | 60–90 s |
| Foundation Five: Intensified | Foundation Five with rest-pause, forced negatives and a static hold | 9 d (7–16) | 90–120 s |

Intensity techniques: rest-pause, forced reps, forced negatives, timed static hold, breakdown
(drop set), negative-only and pre-exhaust. They're timed as a separate phase after failure, so
the primary set stays comparable over time. Negative-only sets are only compared with other
negative-only sets. You can duplicate any routine and edit it, or build your own, with any
exercise, order, technique and TUL window.

## Insights

The Progress tab has:
- An overall strength score indexed to your first session.
- Per-exercise charts of strength, weight and TUL.
- Stalled-exercise flags.
- These analyses:
  - **Rest between workouts**: progress since the previous session, by gap length.
  - **Time of day, readiness, day of week, transition time**: performance against your own trend. Each set is compared with the average of the surrounding sessions for that exercise, so long-term progress doesn't skew it.
  - **Exercise order**: performance when an exercise is moved earlier or later than its usual slot.

A sentence only appears once each group has 3+ data points and the difference is meaningful.
**Settings → Load demo data** lets you explore all of this with five months of simulated training.

## Getting it onto your iPhone

The app is static files in `app/`: `index.html`, `styles.css`, `js/`, `icons/`, `manifest.webmanifest`, `sw.js`.
It has to be served over HTTPS once, so that iOS can install it and cache it for offline use. After that it runs with no signal.

**GitHub Pages (free):** push this folder to a GitHub repository, then Settings → Pages → deploy from branch `main` / root.
Netlify or Cloudflare Pages also work: drag the folder in.

The live site is **https://myodose.app** (the `CNAME` file tells GitHub Pages to serve it there). getmyodose.com and
myodose.co.uk forward to it from the registrar. The privacy policy is at https://myodose.app/privacy.html.

Then on the iPhone:
1. Open the URL in **Safari**.
2. Tap Share → **Add to Home Screen**.
3. Always launch it from the Home Screen icon. It runs full-screen and offline, and its data is separate from Safari's.

**Your data stays on your phone** (localStorage in the Home Screen app). The hosting URL only serves the code.
Use **Settings → Export backup** regularly (save to Files/iCloud Drive), because deleting the Home Screen app deletes its data.
**Export CSV** gives you a spreadsheet of every set.

### Updating after changes

```bash
node tools/build-sw.mjs   # refresh the offline cache list and version
git commit -am "update" && git push
```
The app shows "Update ready, tap to reload" the next time it opens online.

## Development

```bash
python3 -m http.server 8000     # then open http://localhost:8000
npm test                        # engine + insights unit tests (node --test)
python3 tools/make-icons.py     # regenerate icons from tools/icon-1024.png
```

No build step, no dependencies. Plain ES modules. Most of the logic lives in `js/engine.js`
(progression, verdict, rest), `js/insights.js` (analytics) and `js/data/` (exercises, techniques,
routines). These are pure functions with no DOM, so they can be ported to a native Swift app later.

*Not medical advice. Get medical clearance before training to failure.*
