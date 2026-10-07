// matrix.mjs — run every scenario under every trigger and label the cost of
// each wrong pairing. Diagonal cells are the natural fits.

import { runGoal, runCron, runHooks } from './engine.mjs';
import { SCENARIOS, AMBIENT_TURNS, createTask, scenarioById } from './scenarios.mjs';

export const TRIGGERS = [
  { id: 'goal', label: 'Condition', asks: 'Are we done yet?' },
  { id: 'cron', label: 'Clock', asks: 'Is it time to run again?' },
  { id: 'hook', label: 'Event', asks: 'Did a turn just happen?' },
];

export function runTrigger(triggerId, scenarioId) {
  const scenario = scenarioById(scenarioId);
  const task = createTask(scenarioId);
  let result;
  if (triggerId === 'goal') {
    result = runGoal(task);
  } else if (triggerId === 'cron') {
    result = runCron(task, { ticks: scenario.params.slots ?? scenario.params.ticks ?? 10 });
  } else if (triggerId === 'hook') {
    result = runHooks(task, { turns: AMBIENT_TURNS });
  } else {
    throw new Error(`unknown trigger: ${triggerId}`);
  }
  const verdict = task.assess(triggerId, result);
  return { ...result, ...verdict, match: triggerId === scenario.correctTrigger };
}

export function runMatrix() {
  return SCENARIOS.map(s => ({
    task: s.id,
    name: s.name,
    kind: s.kind,
    correct: s.correctTrigger,
    cells: Object.fromEntries(TRIGGERS.map(t => [t.id, runTrigger(t.id, s.id)])),
  }));
}

// Invariants the lab must always exhibit — shared by the CLI report and tests.
export function checkInvariants(rows = runMatrix()) {
  const cell = (task, trigger) => rows.find(r => r.task === task).cells[trigger];
  const migration = { goal: cell('migration', 'goal'), cron: cell('migration', 'cron'), hook: cell('migration', 'hook') };
  const monitor = { goal: cell('monitor', 'goal'), cron: cell('monitor', 'cron'), hook: cell('monitor', 'hook') };
  const guard = { goal: cell('guard', 'goal'), cron: cell('guard', 'cron'), hook: cell('guard', 'hook') };
  return [
    ['goal × migration converges', migration.goal.status === 'success' && migration.goal.runs === 6],
    ['cron × migration wastes runs', migration.cron.status === 'wasteful' && migration.cron.wastedRuns === 4],
    ['hook × migration is uncontrolled', migration.hook.status === 'uncontrolled' && migration.hook.wastedRuns === 2],
    ['goal × monitor never terminates', monitor.goal.status === 'exhausted' && monitor.goal.runs === 8],
    ['cron × monitor catches the outage', monitor.cron.status === 'ok'],
    ['hook × monitor has a blind spot', monitor.hook.status === 'blind-spot'],
    ['goal × guard cannot see the breach', guard.goal.status === 'exhausted' && guard.goal.reason === 'unobservable'],
    ['cron × guard detects late', guard.cron.status === 'detected-late'],
    ['hook × guard intercepts', guard.hook.status === 'intercepted' && guard.hook.fired === 5],
  ];
}
