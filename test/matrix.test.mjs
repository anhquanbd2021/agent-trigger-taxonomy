import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runMatrix, checkInvariants, TRIGGERS } from '../public/matrix.mjs';
import { SCENARIOS, AMBIENT_TURNS } from '../public/scenarios.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('embedded scenarios match examples/scenarios.json on disk', async () => {
  const onDisk = JSON.parse(await readFile(`${root}examples/scenarios.json`, 'utf8'));
  const embedded = Object.fromEntries(SCENARIOS.map(s => [s.id, {
    name: s.name, kind: s.kind, correctTrigger: s.correctTrigger, params: s.params,
  }]));
  assert.deepEqual(embedded, onDisk.scenarios);
  assert.deepEqual(AMBIENT_TURNS, onDisk.ambientTurns);
});

test('matrix diagonal is the natural fit for every workload', () => {
  const rows = runMatrix();
  for (const row of rows) {
    for (const t of TRIGGERS) {
      assert.equal(row.cells[t.id].match, t.id === row.correct);
    }
    assert.equal(row.cells[row.correct].status === 'success' || row.cells[row.correct].status === 'ok' || row.cells[row.correct].status === 'intercepted', true, `${row.task} fit`);
  }
});

test('every off-diagonal pairing carries a named failure', () => {
  const rows = runMatrix();
  const failures = new Set(['exhausted', 'wasteful', 'blind-spot', 'detected-late', 'uncontrolled']);
  for (const row of rows) {
    for (const t of TRIGGERS) {
      const c = row.cells[t.id];
      if (!c.match) assert.ok(failures.has(c.status), `${row.task} × ${t.id} should be a named mismatch, got ${c.status}`);
    }
  }
});

test('all report invariants hold', () => {
  const failed = checkInvariants().filter(([, ok]) => !ok);
  assert.deepEqual(failed, [], failed.map(([l]) => l).join('; '));
});

test('guard hook costs less than the damage it prevents', () => {
  const rows = runMatrix();
  const guard = rows.find(r => r.task === 'guard');
  const hook = guard.cells.hook;
  const cron = guard.cells.cron;
  const halt = hook.trace.find(t => t.outcome.verdict === 'halt');
  assert.equal(halt.outcome.spent, 24, 'hook caps spend at 24');
  const cronFinal = cron.trace.at(-1).outcome.spent;
  assert.equal(cronFinal, 40, 'cron can only watch spend reach 40');
});
