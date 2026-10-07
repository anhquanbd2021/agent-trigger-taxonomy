// report.mjs — print the 3x3 trigger-vs-task matrix and check the invariants.
// Exit 1 if any pairing stops behaving the way the article claims.

import { runMatrix, checkInvariants, TRIGGERS } from '../public/matrix.mjs';

const pad = (s, n) => String(s).padEnd(n);
const rows = runMatrix();

console.log('TRIGGER PICKER LAB — scenario x trigger matrix\n');
console.log(`${pad('scenario', 18)} ${pad('trigger', 8)} ${pad('status', 14)} ${pad('runs', 5)} ${pad('cost', 5)} ${pad('waste', 6)} note`);
console.log('-'.repeat(110));
for (const row of rows) {
  for (const t of TRIGGERS) {
    const c = row.cells[t.id];
    const flag = c.match ? '*' : ' ';
    console.log(
      `${pad(row.task + (c.match ? ' (fit)' : ''), 18)} ${pad(t.id, 8)} ${pad(flag + c.status, 14)} `
      + `${pad(c.runs ?? c.fired, 5)} ${pad(c.cost, 5)} ${pad(c.wastedRuns ?? 0, 6)} ${c.note}`,
    );
  }
  console.log('-'.repeat(110));
}

const checks = checkInvariants(rows);
console.log('\nINVARIANTS');
let failed = 0;
for (const [label, ok] of checks) {
  console.log(` ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed += 1;
}
if (failed) {
  console.error(`\n${failed} invariant(s) broken.`);
  process.exit(1);
}
console.log('\nAll invariants hold.');
