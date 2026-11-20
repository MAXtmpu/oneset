import { sortedSessions, getSession, updateSession, deleteSession } from '../store.js';
import { VERDICTS, isLogged } from '../engine.js';
import { esc, fmtDate, fmtTime, fmtClock, fmtPct, plural } from '../util.js';
import { actions, navigate, toast } from '../ui.js';
import { sessionReport } from './summary.js';

function renderList() {
  const sessions = sortedSessions().reverse();
  if (!sessions.length) {
    return `<h1>History</h1><div class="empty"><p>No workouts yet.</p><a class="btn primary" href="#/train">Start your first workout</a></div>`;
  }
  let html = `<h1>History</h1><p class="sub">${plural(sessions.length, 'workout')}</p>`;
  let month = '';
  let open = false;
  for (const s of sessions) {
    const m = new Date(s.startedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (m !== month) {
      if (open) html += '</div>';
      html += `<h2>${esc(m)}</h2><div class="list">`;
      month = m; open = true;
    }
    const v = VERDICTS[s.verdict?.type] || VERDICTS.baseline;
    const n = s.sets.filter(isLogged).length;
    const dur = s.endedAt ? fmtClock((s.endedAt - s.startedAt) / 1000) : '';
    html += `<a class="item" href="#/history/${esc(s.id)}">
      <span class="pill ${v.tone === 'neutral' ? 'info' : v.tone}" title="${esc(v.title)}">${v.icon}</span>
      <span class="grow"><span class="title">${esc(fmtDate(s.startedAt))}</span> <small>${esc(fmtTime(s.startedAt))}</small>
        <div class="meta">${esc(s.workoutName)} · ${plural(n, 'exercise')}${dur ? ' · ' + dur : ''}${s.verdict?.meanChange != null ? ' · ' + fmtPct(s.verdict.meanChange) : ''}</div></span>
      <span class="chev">›</span></a>`;
  }
  if (open) html += '</div>';
  return html;
}

let editing = null; // set order being edited

function renderDetail(id) {
  const s = getSession(id);
  if (!s) return `<div class="empty">Session not found. <a href="#/history">Back</a></div>`;
  let html = `<p><a href="#/history">‹ History</a></p><h1>${esc(s.routineName)}</h1>` + sessionReport(s, { editable: true });
  if (editing != null) {
    const set = s.sets.find((x) => x.order === editing);
    if (set) {
      html += `<div class="card" id="edit-card"><h3>Edit ${esc(set.exerciseName)}</h3>
        <label class="field"><span>Weight (${esc(set.unit)})</span><input name="e-w" type="number" inputmode="decimal" step="any" value="${set.weight}"></label>
        <label class="field"><span>Reps</span><input name="e-r" type="number" inputmode="numeric" value="${set.reps}"></label>
        <label class="field"><span>Time under load (s)</span><input name="e-t" type="number" inputmode="decimal" step="any" value="${set.tul}"></label>
        <label class="switch"><span>Reached failure</span><input type="checkbox" name="e-f" ${set.failed === false ? '' : 'checked'}></label>
        <div class="btn-row"><button data-act="cancel-edit">Cancel</button><button class="primary" data-act="save-edit">Save</button></div></div>`;
    }
  }
  html += `<button class="danger big" data-act="delete" style="margin-top:20px">Delete workout</button>`;
  return html;
}

export function render([id]) {
  if (!id) { editing = null; return renderList(); }
  return renderDetail(id);
}

export function mount(root, [id]) {
  if (!id) return null;
  const onChange = (ev) => {
    if (ev.target.name === 'session-notes') updateSession(id, (s) => { s.notes = ev.target.value.trim(); });
  };
  root.addEventListener('change', onChange);
  const redraw = () => { root.innerHTML = renderDetail(id); };
  const off = actions(root, {
    'edit-set': (el) => { editing = Number(el.dataset.order); redraw(); root.querySelector('#edit-card')?.scrollIntoView({ behavior: 'smooth' }); },
    'cancel-edit': () => { editing = null; redraw(); },
    'save-edit': () => {
      const val = (n) => root.querySelector(`[name="${n}"]`);
      const tul = Number(val('e-t').value);
      if (!(tul > 0)) { toast('Time under load must be above 0'); return; }
      updateSession(id, (s) => {
        const set = s.sets.find((x) => x.order === editing);
        set.weight = Number(val('e-w').value) || 0;
        set.reps = Number(val('e-r').value) || 0;
        set.tul = tul;
        set.failed = val('e-f').checked;
      });
      editing = null; toast('Saved, verdicts recalculated'); redraw();
    },
    delete: () => {
      if (!confirm('Delete this workout permanently? This cannot be undone.')) return;
      deleteSession(id); navigate('#/history');
    },
  });
  return () => { off(); root.removeEventListener('change', onChange); };
}
