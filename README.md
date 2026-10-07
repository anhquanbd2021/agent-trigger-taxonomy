# Trigger Picker Lab — companion demo

Interactive lab for the article *Condition or Clock: Three Ways to Keep an
Agent Running*. "Keep the agent running" is three mechanisms, not one — this
lab runs the same three workloads under a **condition loop** (goal), a
**clock loop** (cron), and a **stop hook** (event), then prices every wrong
pairing.

Zero dependencies — Node 20+ only. The engine, task factories, and matrix are
plain ES modules shared by the browser UI, the CLI report, and the test suite.

## The three triggers

| Trigger | Question it asks | Natural fit |
|---|---|---|
| `goal` — condition-driven | "Are we done yet?" | Converging work with a checkable finish line (migrations, refactors) |
| `cron` — clock-driven | "Is it time to run again?" | Recurring work with no end state (monitoring, polling) |
| `hook` — event-driven | "Did a turn just happen?" | Cross-cutting policy across sessions (budget guards, gates, audit) |

## The three workloads

- **Schema migration** — 40 files, +7 per run, done at 40. Fit: `goal`.
- **Uptime monitor** — 10-slot timeline, outage at slot 4, never "done".
  Fit: `cron`.
- **Budget guard** — 8 ambient turns across two sessions spend past a 20-unit
  cap; the breaching turn must be intercepted. Fit: `hook`.

The lab also runs all six *wrong* pairings and names the cost of each:
goal×monitor never terminates, cron×migration wastes 4 runs after the finish
line, hook×monitor misses the outage in an idle gap, goal×guard can't see the
breach, cron×guard detects it late, hook×migration wastes runs on unrelated
sessions' turns.

## The evaluator inspects — it never executes

In goal mode the evaluator reads state through a read-only proxy (`engine.mjs`)
and returns a verdict; any attempted write throws. The separation is enforced
by code, matching the article's claim: verdict ≠ work.

## Run it

```text
npm start       # serve the lab on :3000
npm test        # engine + matrix + server
npm run report  # 3x3 matrix + invariant check
npm run check   # both
```

## Honest limits

- Deterministic model of **trigger semantics** — when control logic fires —
  not of agent intelligence; `run()` does scripted work, not reasoning.
- Costs are abstract units, not dollars; real waste scales with model/tool
  pricing.
- Real systems combine triggers (goal loop + stop-hook cap is the common
  pairing); the lab isolates them on purpose.
- Hooks here model the after-each-turn kind; pre-tool hooks that gate
  individual tool calls are a related but distinct layer.
- Timeline "slots" are a simulated clock — nothing real sleeps or schedules.

This is an educational demo, not production infrastructure.
