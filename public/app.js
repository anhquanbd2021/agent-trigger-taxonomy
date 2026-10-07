import { SCENARIOS, AMBIENT_TURNS } from './scenarios.mjs';
import { TRIGGERS, runTrigger, runMatrix } from './matrix.mjs';

const state = { scenario: 'migration', trigger: 'goal' };
const $ = id => document.getElementById(id);

const STATUS_CLASS = {
  success: 'pass', ok: 'pass', intercepted: 'pass',
  wasteful: 'warn', 'blind-spot': 'warn', uncontrolled: 'warn', 'detected-late': 'warn',
  exhausted: 'fail',
};

function fmtOutcome(o) {
  if (!o) return '—';
  if (o.verdict === 'skipped') return 'skipped — session halted';
  if (o.verdict === 'halt') return `HALT — cumulative spend ${o.spent} breached the cap`;
  if (o.verdict === 'allow') return `allow — cumulative spend ${o.spent}`;
  if (o.migrated !== undefined) return `migrated ${o.migrated}/${o.total}${o.wasted ? ' — already done, wasted' : ''}`;
  if (o.status !== undefined) return `checked slot ${o.slot}: ${o.status.toUpperCase()}`;
  if (o.spent !== undefined) return `ledger sample at slot ${o.slot}: ${o.spent}${o.breach ? ' — BREACH' : ''}`;
  return o.note ?? JSON.stringify(o);
}

function describe(trigger, e) {
  if (trigger === 'goal') {
    const v = e.verdict;
    const read = v.done ? 'DONE' : v.observable ? 'not done' : 'nothing to check';
    return `run ${e.iteration} → ${fmtOutcome(e.outcome)} → evaluate: ${read}`;
  }
  if (trigger === 'cron') {
    return `tick ${e.tick} → ${fmtOutcome(e.outcome)}${e.alreadyDone ? '  · already done' : ''}`;
  }
  return `turn ${e.i} · session ${e.turn.session} @ slot ${e.turn.at} → ${fmtOutcome(e.outcome)}`;
}

function entryClass(trigger, e) {
  const o = e.outcome || {};
  if (o.verdict === 'halt') return 'halt';
  if (o.verdict === 'skipped') return 'skipped';
  if (o.wasted || e.alreadyDone || o.breach) return 'wasted';
  if (e.verdict && e.verdict.done) return 'done';
  if (o.verdict === 'allow' || o.status === 'down') return 'done';
  return '';
}

function renderPickers() {
  const sl = $('scenario-list');
  sl.replaceChildren(...SCENARIOS.map(s => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'card'; b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(state.scenario === s.id));
    b.innerHTML = `<strong>${s.name}</strong><span>${s.blurb} · fit: ${s.correctTrigger}</span>`;
    b.addEventListener('click', () => { state.scenario = s.id; renderPickers(); run(); });
    return b;
  }));
  const tl = $('trigger-list');
  tl.replaceChildren(...TRIGGERS.map(t => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'card'; b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(state.trigger === t.id));
    b.innerHTML = `<strong>${t.label}</strong><span>"${t.asks}"</span>`;
    b.addEventListener('click', () => { state.trigger = t.id; renderPickers(); run(); });
    return b;
  }));
}

function renderMatrix() {
  const rows = runMatrix();
  const table = $('matrix');
  const head = document.createElement('tr');
  head.append(document.createElement('th'));
  for (const t of TRIGGERS) {
    const th = document.createElement('th');
    th.textContent = `${t.label} — "${t.asks}"`;
    head.append(th);
  }
  table.append(head);
  for (const row of rows) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = `${row.name} (${row.kind})`;
    tr.append(th);
    for (const t of TRIGGERS) {
      const c = row.cells[t.id];
      const td = document.createElement('td');
      if (c.match) td.className = 'fit';
      const badge = document.createElement('span');
      badge.className = `badge ${STATUS_CLASS[c.status] || 'info'}`;
      badge.textContent = c.status;
      td.append(badge, document.createTextNode(` ${c.runs ?? c.fired} runs · cost ${c.cost}`));
      const note = document.createElement('span');
      note.className = 'cell-note';
      note.textContent = c.note;
      td.append(note);
      td.addEventListener('click', () => { state.scenario = row.task; state.trigger = t.id; renderPickers(); run(); });
      tr.append(td);
    }
    table.append(tr);
  }
}

function run() {
  const r = runTrigger(state.trigger, state.scenario);
  const verdict = $('verdict');
  verdict.textContent = `${r.status}${r.match ? ' · natural fit' : ' · mismatch'}`;
  verdict.className = `badge ${STATUS_CLASS[r.status] || 'info'}`;
  const runs = r.runs ?? r.fired;
  $('stats').textContent = `${runs} runs · cost ${r.cost} · ${r.wastedRuns ?? 0} wasted`;
  const trace = $('trace');
  trace.replaceChildren(...r.trace.map(e => {
    const li = document.createElement('li');
    li.className = entryClass(state.trigger, e);
    li.textContent = describe(state.trigger, e);
    return li;
  }));
  $('note').textContent = r.note;
}

$('run').addEventListener('click', run);
renderPickers();
renderMatrix();
run();
