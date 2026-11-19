import {
  allRoutines, getRoutine, getState, update, duplicateRoutine, saveRoutine, deleteRoutine,
  allExercises, getExercise, addCustomExercise,
} from '../store.js';
import { TECHNIQUE_LIST, technique } from '../data/techniques.js';
import { PATTERNS } from '../data/exercises.js';
import { esc, uid } from '../util.js';
import { actions, navigate, toast } from '../ui.js';

function renderList() {
  const active = getState().activeRoutineId;
  const all = allRoutines();
  const item = (r) => `<a class="item" href="#/routines/${esc(r.id)}">
    <span class="grow"><span class="title">${esc(r.name)}</span> ${r.id === active ? '<span class="pill accent">ACTIVE</span>' : ''}
      <div class="meta">${esc(r.tagline || '')}</div>
      <div class="meta">${r.workouts.map((w) => esc(w.name)).join(' / ')} · every ~${r.intervalDays} days · ${r.tulMin}–${r.tulMax}s</div></span>
    <span class="chev">›</span></a>`;
  const custom = all.filter((r) => !r.builtIn);
  return `<h1>Routines</h1>
    <p class="sub">All routines follow HIT principles: one set per exercise to momentary muscular failure, slow cadence, and enough recovery time between sessions.</p>
    <h2>Suggested</h2>
    <div class="list">${all.filter((r) => r.builtIn).map(item).join('')}</div>
    <h2>Your routines</h2>
    ${custom.length ? `<div class="list">${custom.map(item).join('')}</div>` : '<p class="muted">Duplicate a suggested routine to customise it, or start from scratch.</p>'}
    <button class="big" data-act="new">+ New routine</button>
    <h2>Intensity techniques</h2>
    <p class="muted">Any exercise slot can carry one of these. The primary set is always compared like-for-like, and recovery time is added when you actually use a technique.</p>
    <div class="list">${TECHNIQUE_LIST.filter((t) => t.id !== 'none').map((t) => `
      <div class="item"><span class="pill accent">${esc(t.short)}</span><span class="grow"><span class="title">${esc(t.name)}</span>
        <div class="meta">${esc(t.description)}${t.recoveryDays ? ` Adds ~${t.recoveryDays} day${t.recoveryDays === 1 ? '' : 's'} of recovery.` : ''}</div></span></div>`).join('')}</div>`;
}

function renderDetail(id) {
  const r = getRoutine(id);
  if (!r) return `<div class="empty">Routine not found. <a href="#/routines">Back</a></div>`;
  const active = getState().activeRoutineId === r.id;
  return `<p><a href="#/routines">‹ Routines</a></p>
    <h1>${esc(r.name)}</h1>
    <p class="sub">${esc(r.tagline || '')}</p>
    ${active ? '<p><span class="pill accent">ACTIVE ROUTINE</span></p>' : `<button class="primary big" data-act="activate">Use this routine</button>`}
    ${r.description ? `<div class="card"><p>${esc(r.description)}</p></div>` : ''}
    <div class="stats-grid">
      <div class="stat"><b>${r.intervalDays}d</b><small>starting gap</small></div>
      <div class="stat"><b>${r.minIntervalDays ?? '–'}–${r.maxIntervalDays ?? '–'}d</b><small>adaptive range</small></div>
      <div class="stat"><b>${r.tulMin}–${r.tulMax}s</b><small>TUL target</small></div>
    </div>
    ${r.workouts.map((w) => `<h2>${esc(w.name)}</h2><div class="list">${w.slots.map((s, i) => {
      const t = technique(s.technique);
      return `<div class="item"><span class="muted num">${i + 1}</span><span class="grow"><span class="title">${esc(getExercise(s.exerciseId).name)}</span>
        ${t.id !== 'none' ? `<div class="meta"><span class="pill accent">${esc(t.short)}</span> ${esc(t.name)}</div>` : ''}
        ${s.tulMin ? `<div class="meta">${s.tulMin}–${s.tulMax}s</div>` : ''}</span></div>`;
    }).join('')}</div>`).join('')}
    <div class="btn-row" style="margin-top:20px">
      ${r.builtIn ? '' : `<button data-act="edit">Edit</button>`}
      <button data-act="duplicate">Duplicate${r.builtIn ? ' &amp; customise' : ''}</button>
    </div>
    ${r.builtIn ? '' : `<button class="danger big ghost" data-act="delete" style="margin-top:10px">Delete routine</button>`}`;
}

// ── Editor ──────────────────────────────────────────────────────────────────────────────────
let draft = null;

function exerciseOptions() {
  const exs = allExercises();
  const groups = [...PATTERNS, 'Other'];
  return groups.map((g) => {
    const list = exs.filter((e) => (e.pattern || 'Other') === g);
    return list.length ? `<optgroup label="${esc(g)}">${list.map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('')}</optgroup>` : '';
  }).join('') + `<option value="__new">+ New exercise…</option>`;
}

function renderEditor(id) {
  if (!draft || draft.id !== id) {
    const r = getRoutine(id);
    if (!r || r.builtIn) return `<div class="empty">Can’t edit this routine. <a href="#/routines">Back</a></div>`;
    draft = JSON.parse(JSON.stringify(r));
  }
  const d = draft;
  const num = (f, label, v) => `<label class="field"><span>${label}</span><input type="number" inputmode="numeric" data-f="${f}" value="${v ?? ''}"></label>`;
  const techOpts = (sel) => TECHNIQUE_LIST.map((t) => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  return `<p><a href="#/routines/${esc(d.id)}" data-act="cancel">‹ Cancel</a></p>
    <h1>Edit routine</h1>
    <label class="field"><span>Name</span><input data-f="name" value="${esc(d.name)}"></label>
    <label class="field"><span>Short description</span><input data-f="tagline" value="${esc(d.tagline || '')}"></label>
    <div class="row">${num('intervalDays', 'Starting gap (days)', d.intervalDays)}${num('minIntervalDays', 'Min gap', d.minIntervalDays)}${num('maxIntervalDays', 'Max gap', d.maxIntervalDays)}</div>
    <div class="row">${num('tulMin', 'TUL min (s)', d.tulMin)}${num('tulMax', 'TUL max (s)', d.tulMax)}</div>
    ${d.workouts.map((w, wi) => `<div class="card">
      <div class="row"><input class="grow" data-w="${wi}" data-f="wname" value="${esc(w.name)}" aria-label="Workout name">
        ${d.workouts.length > 1 ? `<button class="small danger ghost" data-act="rm-workout" data-w="${wi}">Remove</button>` : ''}</div>
      <div class="stack" style="margin-top:10px">
      ${w.slots.map((s, si) => `<div class="card tight" style="margin:0">
        <div class="row"><b class="grow">${si + 1}. ${esc(getExercise(s.exerciseId).name)}</b>
          <button class="small" data-act="up" data-w="${wi}" data-s="${si}" ${si === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button class="small" data-act="down" data-w="${wi}" data-s="${si}" ${si === w.slots.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
          <button class="small danger" data-act="rm-slot" data-w="${wi}" data-s="${si}" aria-label="Remove">✕</button></div>
        <select data-w="${wi}" data-s="${si}" data-f="technique" style="margin-top:8px" aria-label="Technique">${techOpts(s.technique || 'none')}</select>
      </div>`).join('')}
      </div>
      <div class="row" style="margin-top:10px"><select class="grow" data-add="${wi}" aria-label="Add exercise"><option value="">+ Add exercise…</option>${exerciseOptions()}</select></div>
    </div>`).join('')}
    <button class="big" data-act="add-workout">+ Add workout (for A/B rotation)</button>
    <button class="primary big" data-act="save" style="margin-top:12px">Save routine</button>`;
}

export function render([id], match) {
  if (!id) return renderList();
  if (match?.edit) return renderEditor(id);
  draft = null;
  return renderDetail(id);
}

export function mount(root, [id], match) {
  const redraw = () => { root.innerHTML = renderEditor(id); };
  const onChange = (ev) => {
    if (!match?.edit || !draft) return;
    const el = ev.target;
    const f = el.dataset.f;
    if (el.dataset.add != null) {
      let exId = el.value;
      if (!exId) return;
      if (exId === '__new') {
        const name = prompt('Exercise name (e.g. "Nautilus Hip & Back")');
        if (!name || !name.trim()) { el.value = ''; return; }
        const pattern = prompt(`Category: ${PATTERNS.join(', ')}`, 'Push');
        exId = addCustomExercise(name, PATTERNS.find((p) => p.toLowerCase() === (pattern || '').trim().toLowerCase()) || 'Other').id;
      }
      draft.workouts[Number(el.dataset.add)].slots.push({ exerciseId: exId, technique: 'none' });
      redraw();
      return;
    }
    if (!f) return;
    if (f === 'wname') draft.workouts[Number(el.dataset.w)].name = el.value;
    else if (f === 'technique') draft.workouts[Number(el.dataset.w)].slots[Number(el.dataset.s)].technique = el.value;
    else if (el.type === 'number') draft[f] = el.value === '' ? null : Number(el.value);
    else draft[f] = el.value;
  };
  root.addEventListener('change', onChange);

  const swap = (arr, i, j) => { [arr[i], arr[j]] = [arr[j], arr[i]]; };
  const slotsOf = (el) => draft.workouts[Number(el.dataset.w)].slots;
  const off = actions(root, {
    activate: () => { update((s) => { s.activeRoutineId = id; }); toast('Active routine updated'); navigate('#/train'); },
    duplicate: () => { const c = duplicateRoutine(id); navigate(`#/routines/${c.id}/edit`); },
    edit: () => navigate(`#/routines/${id}/edit`),
    delete: () => {
      if (!confirm('Delete this routine? Your workout history is kept.')) return;
      deleteRoutine(id); navigate('#/routines');
    },
    new: () => {
      const r = { id: 'r-' + uid(), name: 'My routine', tagline: '', builtIn: false, intervalDays: 7, minIntervalDays: 4,
        maxIntervalDays: 14, tulMin: 60, tulMax: 90, workouts: [{ id: 'A', name: 'Workout A', slots: [] }] };
      saveRoutine(r); navigate(`#/routines/${r.id}/edit`);
    },
    cancel: () => { draft = null; navigate(`#/routines/${id}`); },
    up: (el) => { const s = slotsOf(el); const i = Number(el.dataset.s); swap(s, i, i - 1); redraw(); },
    down: (el) => { const s = slotsOf(el); const i = Number(el.dataset.s); swap(s, i, i + 1); redraw(); },
    'rm-slot': (el) => { slotsOf(el).splice(Number(el.dataset.s), 1); redraw(); },
    'rm-workout': (el) => { draft.workouts.splice(Number(el.dataset.w), 1); redraw(); },
    'add-workout': () => {
      const letter = String.fromCharCode(65 + draft.workouts.length);
      draft.workouts.push({ id: uid(), name: `Workout ${letter}`, slots: [] });
      redraw();
    },
    save: () => {
      const d = draft;
      if (!d.name.trim()) { toast('Give the routine a name'); return; }
      if (d.workouts.some((w) => !w.slots.length)) { toast('Every workout needs at least one exercise'); return; }
      if (!(d.tulMax > d.tulMin)) { toast('TUL max must be above TUL min'); return; }
      d.intervalDays = d.intervalDays || 7;
      d.minIntervalDays = Math.min(d.minIntervalDays || d.intervalDays, d.intervalDays);
      d.maxIntervalDays = Math.max(d.maxIntervalDays || d.intervalDays * 2, d.intervalDays);
      saveRoutine(d); draft = null; toast('Routine saved'); navigate(`#/routines/${d.id}`);
    },
  });
  return () => { off(); root.removeEventListener('change', onChange); };
}

