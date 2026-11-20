import { getState, update, exportJSON, importJSON, exportCSV, resetAll, replaceSessions, recomputeVerdicts } from '../store.js';
import { convertWeight } from '../engine.js';
import { generateDemo } from '../demo.js';
import { esc, roundTo } from '../util.js';
import { actions, toast, shareFile, rerender } from '../ui.js';

export function render() {
  const st = getState();
  const s = st.settings;
  const hasDemo = st.sessions.some((x) => x.demo);
  const sw = (name, label, sub = '') => `<label class="switch"><span>${label}${sub ? `<br><small>${sub}</small>` : ''}</span>
    <input type="checkbox" name="${name}" ${s[name] ? 'checked' : ''}></label>`;
  return `<h1>Settings</h1>
    <div class="card">
      <label class="field"><span>Units</span>
        <div class="seg">${['kg', 'lb'].map((u) => `<button data-act="unit" data-u="${u}" class="${s.unit === u ? 'on' : ''}">${u}</button>`).join('')}</div></label>
      <label class="field"><span>Default weight increment (${s.unit}). Override per machine during a workout.</span>
        <input type="number" inputmode="decimal" step="any" name="increment" value="${esc(s.increment)}"></label>
      <label class="field"><span>Get-ready countdown (seconds)</span>
        <input type="number" inputmode="numeric" name="prepSeconds" value="${esc(s.prepSeconds)}"></label>
      <label class="field"><span>Cadence cue during the set</span>
        <select name="cadence">${[['off', 'Off'], ['4-4', '4 s up / 4 s down'], ['5-5', '5 s up / 5 s down'], ['10-10', '10 s up / 10 s down (SuperSlow)']]
          .map(([v, l]) => `<option value="${v}" ${s.cadence === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${sw('sound', 'Sounds', 'Countdown beeps, target-zone chime. Plays even with the silent switch on (iOS 17+).')}
      ${sw('wakeLock', 'Keep screen on during workouts')}
      ${sw('readinessPrompt', 'Ask how I feel before each workout', 'Feeds the readiness insight.')}
    </div>

    <h2>Your data</h2>
    <div class="card">
      <p class="muted">Everything is stored on this phone only. Export a backup regularly (e.g. to Files or iCloud Drive), because deleting the Home Screen app also deletes its data.</p>
      <div class="btn-row" style="margin-top:10px"><button data-act="export">Export backup</button><button data-act="import">Restore backup</button></div>
      <button data-act="csv" style="width:100%;margin-top:10px">Export CSV (spreadsheet)</button>
      <input type="file" accept="application/json,.json" name="importFile" class="hidden">
    </div>
    <div class="card">
      <h3>Demo data</h3>
      <p class="muted">Load about 5 months of simulated Foundation Five training to explore the charts and insights. <b>This replaces your history</b>, so export a backup first.</p>
      <div class="btn-row" style="margin-top:10px">
        <button data-act="demo">Load demo</button>
        ${hasDemo ? '<button data-act="clear-demo">Remove demo data</button>' : ''}
      </div>
    </div>
    <button class="danger big ghost" data-act="reset">Erase all data</button>

    <h2>How Myodose works</h2>
    <div class="card stack" style="font-size:15px">
      <p><b>One set to failure.</b> Each exercise is a single set, done slowly and smoothly until you can’t move the weight despite your full effort (momentary muscular failure). Time under load (TUL) is recorded automatically.</p>
      <p><b>Progression.</b> Each set gets a capacity score from load and TUL (an Epley-style estimate, calibrated to your own rep speed), so “heavier but shorter” is still counted as progress. Stay at the same load and beat your time. Once you pass the top of the TUL window, the load goes up.</p>
      <p><b>Verdict and rest.</b> After each session, your exercises are compared with last time. Progress means keep the gap. A plateau or a drop means you need more recovery, so the gap is extended. Long layoffs aren’t mistaken for under-recovery. Intensity techniques add rest.</p>
      <p><b>Insights.</b> Time of day, exercise order, transition speed, readiness and rest gap are compared against your own trend, and a finding only appears once there’s enough data.</p>
      <p class="muted">Not medical advice. Check with a doctor before training to failure.</p>
    </div>

    <h2>References</h2>
    <div class="card stack" style="font-size:14px">
      <p>McGuff, D. &amp; Little, J. (2009). <i>Body by Science: A Research-Based Program for Strength Training, Body Building, and Complete Fitness in 12 Minutes a Week</i>. McGraw-Hill.</p>
      <p class="muted">Routines and time-under-load ranges are general training approaches informed by this literature. Myodose is independent and is not affiliated with, or endorsed by, any author or publisher.</p>
    </div>
    <p class="muted" style="text-align:center;font-size:12px">Myodose v1.0 · works offline</p>`;
}

export function mount(root) {
  const set = (k, v) => update((st) => { st.settings[k] = v; });
  const onChange = (ev) => {
    const el = ev.target;
    if (el.name === 'importFile') {
      const file = el.files?.[0];
      if (!file) return;
      file.text().then((txt) => {
        if (!confirm('Restore this backup? It replaces all current data.')) return;
        try { const n = importJSON(txt); toast(`Restored ${n} workouts`); rerender(); }
        catch (e) { alert('Could not restore: ' + e.message); }
      });
      return;
    }
    if (el.type === 'checkbox') set(el.name, el.checked);
    else if (el.name === 'increment' || el.name === 'prepSeconds') {
      const v = Number(el.value);
      if (v > 0) set(el.name, v);
    } else if (el.name === 'cadence') set('cadence', el.value);
  };
  root.addEventListener('change', onChange);

  const off = actions(root, {
    unit: (el) => {
      const u = el.dataset.u;
      const st = getState();
      if (st.settings.unit === u) return;
      update((s) => {
        s.settings.increment = u === 'kg' ? 2.5 : 5;
        // Convert per-machine increments too; logged sets keep their own unit and convert on display.
        Object.values(s.exerciseSettings).forEach((x) => { if (x.increment) x.increment = roundTo(convertWeight(x.increment, s.settings.unit, u), 0.5); });
        s.settings.unit = u;
      });
      rerender();
    },
    export: () => shareFile(`myodose-backup-${new Date().toISOString().slice(0, 10)}.json`, exportJSON(), 'application/json'),
    csv: () => shareFile(`myodose-${new Date().toISOString().slice(0, 10)}.csv`, exportCSV(), 'text/csv'),
    import: () => root.querySelector('[name="importFile"]').click(),
    demo: () => {
      if (getState().sessions.some((x) => !x.demo) && !confirm('Replace your workout history with demo data? Export a backup first if you want to keep it.')) return;
      replaceSessions(generateDemo({ unit: getState().settings.unit }));
      toast('Demo data loaded'); rerender();
    },
    'clear-demo': () => {
      update((s) => { s.sessions = s.sessions.filter((x) => !x.demo); recomputeVerdicts(); });
      toast('Demo data removed'); rerender();
    },
    reset: () => {
      if (!confirm('Erase ALL workouts, routines and settings from this phone? This cannot be undone.')) return;
      resetAll(); toast('All data erased'); rerender();
    },
  });
  return () => { off(); root.removeEventListener('change', onChange); };
}
