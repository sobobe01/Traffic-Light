// Run with: node --test simulator/tests
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { FSM, STATE_NAMES, signals, next } = require("../fsm.js");
const { createSim, summarizeOffenders, toCSV } = require("../sim.js");

// ------------------------------------------------- the port matches the C --

test("the simulator's state table is the one in TableTrafficLight.c", () => {
  const c = fs.readFileSync(path.join(__dirname, "../../TableTrafficLight.c"), "utf8");
  const defines = Object.fromEntries([...c.matchAll(/#define\s+(\w+)\s+(\d+)/g)].map((m) => [m[1], Number(m[2])]));
  const table = c.slice(c.indexOf("STyp FSM["), c.indexOf("};", c.indexOf("STyp FSM[")));
  const rows = [...table.matchAll(/\{\s*(0x[0-9A-Fa-f]+)\s*,\s*(0x[0-9A-Fa-f]+)\s*,\s*(\d+)\s*,\s*\{([^}]*)\}\s*\}/g)];
  assert.equal(rows.length, FSM.length, "same number of states");
  rows.forEach((row, i) => {
    const nextStates = row[4].split(",").map((name) => defines[name.trim()]);
    assert.deepEqual(
      { out: parseInt(row[1], 16), walk: parseInt(row[2], 16), time: Number(row[3]), next: nextStates },
      FSM[i],
      `state ${i} (${STATE_NAMES[i]})`,
    );
  });
  STATE_NAMES.forEach((name, i) => assert.equal(defines[name], i, `#define ${name}`));
});

// ------------------------------------------------- the lab's safety rules --

test("every state shows exactly one light per road, and never two roads moving", () => {
  FSM.forEach((_, state) => {
    const s = signals(state);
    for (const road of ["south", "west"]) assert.notEqual(s[road], "off", `${STATE_NAMES[state]} ${road}`);
    const moving = (light) => light === "green" || light === "yellow";
    assert.ok(!(moving(s.south) && moving(s.west)), `${STATE_NAMES[state]}: both roads moving`);
  });
});

test("pedestrians walk, or the don't-walk flashes, only while both roads are red", () => {
  FSM.forEach((_, state) => {
    const s = signals(state);
    if (s.pedestrian !== "dont-walk") {
      assert.deepEqual([s.south, s.west], ["red", "red"], STATE_NAMES[state]);
    }
  });
});

test("a green road turns red only through yellow", () => {
  FSM.forEach((_, state) => {
    for (let input = 0; input < 8; input++) {
      const to = FSM[state].next[input];
      for (const road of ["south", "west"]) {
        if (signals(state)[road] === "green" && signals(to)[road] === "red") {
          assert.fail(`${STATE_NAMES[state]} -> ${STATE_NAMES[to]} skips yellow on ${road}`);
        }
      }
    }
  });
});

test("next() reads the sensors as Port E bits", () => {
  assert.equal(next(0, { pedestrian: false, southCar: true, westCar: false }), FSM[0].next[2]);
  assert.equal(next(2, { pedestrian: true, southCar: false, westCar: true }), FSM[2].next[5]);
});

// ------------------------------------------------------- red-light runners --

function runUntil(sim, predicate, limit = 5000) {
  for (let i = 0; i < limit; i++) {
    const events = sim.tick(Date.UTC(2026, 9, 14) + i * 900);
    const hit = events.find(predicate);
    if (hit) return hit;
  }
  return null;
}

test("a car entering on red is logged with its plate; on green it is not", () => {
  const sim = createSim({ seed: 7, recklessness: 1 });
  sim.auto = false;
  // goNS: south is green, west is red.
  sim.addCar("south", "GRN 0001");
  const passed = sim.tick(0).filter((e) => e.type === "pass" || e.type === "violation");
  assert.equal(passed[0].type, "pass");
  assert.equal(passed[0].car.plate, "GRN 0001");

  const reckless = createSim({ seed: 7, recklessness: 1000 }); // always runs a red
  reckless.auto = false;
  reckless.addCar("west", "RED 0002"); // west is red in the first state
  reckless.queues.west[0].kind = "habitual";
  const v = reckless.tick(Date.UTC(2026, 9, 14, 12)).find((e) => e.type === "violation");
  assert.ok(v, "a violation was logged");
  assert.equal(v.violation.plate, "RED 0002");
  assert.equal(v.violation.road, "West");
  assert.equal(v.violation.light, "red");
  assert.equal(v.violation.state, "goNS");
  assert.equal(v.violation.at, "2026-10-14T12:00:00.000Z");
});

test("running a red while pedestrians have the walk signal is high severity", () => {
  const sim = createSim({ seed: 3, recklessness: 1000, carsPerMinute: { south: 0, west: 0 }, pedestriansPerMinute: 0 });
  sim.auto = false;
  sim.addPedestrian();
  // Drive the machine into the walk state, then put a car on a red road.
  assert.ok(runUntil(sim, (e) => e.type === "state" && STATE_NAMES[e.to] === "walk"));
  sim.addCar("south", "PED 0003");
  sim.queues.south[0].kind = "habitual";
  const v = sim.tick(0).find((e) => e.type === "violation");
  assert.equal(v.violation.severity, "high");
  assert.equal(v.violation.pedestrianSignal, "walk");
});

test("with careful drivers and no recklessness, nobody is logged", () => {
  const sim = createSim({ seed: 11, recklessness: 0 });
  for (let i = 0; i < 2000; i++) sim.tick(i);
  assert.equal(sim.stats.ranRed, 0);
  assert.ok(sim.stats.passed > 100, "traffic still flows");
});

test("regular commuters come back, so the same plates offend more than once", () => {
  const sim = createSim({ seed: 2021 });
  const violations = [];
  for (let i = 0; i < 6000; i++) {
    for (const e of sim.tick(Date.UTC(2026, 9, 14) + i * 900)) if (e.type === "violation") violations.push(e.violation);
  }
  const offenders = summarizeOffenders(violations);
  assert.ok(violations.length > 0);
  assert.ok(offenders.some((o) => o.repeat), "at least one repeat offender");
  assert.equal(offenders.reduce((n, o) => n + o.count, 0), violations.length);
  for (let i = 1; i < offenders.length; i++) assert.ok(offenders[i - 1].count >= offenders[i].count, "worst first");
});

test("the regular commuters are the same people every session", () => {
  const a = createSim({ seed: 1 }).regulars.map((r) => r.plate);
  const b = createSim({ seed: 999 }).regulars.map((r) => r.plate);
  assert.deepEqual(a, b);
});

test("the same seed replays the same day", () => {
  const run = () => {
    const sim = createSim({ seed: 99 });
    const plates = [];
    for (let i = 0; i < 1000; i++) for (const e of sim.tick(i)) if (e.type === "violation") plates.push(e.violation.plate);
    return plates;
  };
  assert.deepEqual(run(), run());
});

// --------------------------------------------------------------- reports --

test("offender summary counts, flags repeats and keeps first/last seen", () => {
  const v = (plate, at, severity = "standard", road = "South") => ({ plate, at, severity, road });
  const offenders = summarizeOffenders([
    v("AAA 1111", "2026-10-14T10:00:00Z"),
    v("BBB 2222", "2026-10-14T10:05:00Z", "high", "West"),
    v("AAA 1111", "2026-10-14T11:00:00Z", "standard", "West"),
  ]);
  assert.deepEqual(offenders.map((o) => [o.plate, o.count, o.repeat]), [["AAA 1111", 2, true], ["BBB 2222", 1, false]]);
  assert.equal(offenders[0].first, "2026-10-14T10:00:00Z");
  assert.equal(offenders[0].last, "2026-10-14T11:00:00Z");
  assert.deepEqual(offenders[0].roads, ["South", "West"]);
});

test("CSV export has a header and quotes awkward values", () => {
  const csv = toCSV([{ at: "2026-10-14T10:00:00Z", plate: 'AB"C 1', road: "South", light: "red", severity: "standard" }]);
  const [header, row] = csv.trim().split("\n");
  assert.ok(header.startsWith("at,plate,road,light"));
  assert.ok(row.includes('"AB""C 1"'));
});
