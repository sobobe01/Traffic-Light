// The intersection: cars with plates arrive, wait, go, and sometimes run the
// red. Runs the board's state machine (fsm.js) one state at a time, exactly as
// the C main loop does: set the lights, wait the state's time, read the
// sensors, move to the next state. No page code here, so it can be tested.
(function (root) {
  "use strict";
  const FSMApi = typeof module !== "undefined" && module.exports ? require("./fsm.js") : root.TrafficFSM;

  // Small seeded random generator, so a run can be replayed.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ"; // no I, O or Q, as on real plates
  function makePlate(rand) {
    let plate = "";
    for (let i = 0; i < 3; i++) plate += LETTERS[Math.floor(rand() * LETTERS.length)];
    plate += " ";
    for (let i = 0; i < 4; i++) plate += Math.floor(rand() * 10);
    return plate;
  }

  // Poisson count for `expected` arrivals in one tick.
  function poisson(rand, expected) {
    const limit = Math.exp(-expected);
    let k = 0;
    let p = rand();
    while (p > limit) {
      k++;
      p *= rand();
    }
    return k;
  }

  const DEFAULTS = {
    seed: 2021,            // the day's traffic
    poolSeed: 2021,        // the town's regular commuters: the same every session,
                           // so a plate remembered yesterday can come back today
    carsPerMinute: { south: 10, west: 10 },
    pedestriansPerMinute: 3,
    recklessness: 1,       // multiplies every driver's chance of running a red
    regulars: 30,          // commuters who come back again and again
    habitualShare: 0.1,    // share of regulars who run reds often
    visitorShare: 0.4,     // share of arrivals who are one-off visitors
    carsPerGreen: 2,       // cars that clear the stop line in one green state
  };

  // Chance a driver at the front of a red-light queue goes anyway, per state.
  const RISK = { careful: 0.02, visitor: 0.05, habitual: 0.35 };

  function createSim(options = {}) {
    const config = { ...DEFAULTS, ...options,
                     carsPerMinute: { ...DEFAULTS.carsPerMinute, ...(options.carsPerMinute || {}) } };
    const rand = mulberry32(config.seed);
    const poolRand = mulberry32(config.poolSeed);

    const regulars = [];
    const seen = new Set();
    while (regulars.length < config.regulars) {
      const plate = makePlate(poolRand);
      if (seen.has(plate)) continue;
      seen.add(plate);
      regulars.push({ plate, kind: poolRand() < config.habitualShare ? "habitual" : "careful" });
    }

    let nextCarId = 1;
    const sim = {
      config,
      state: FSMApi.START,
      clockMs: 0,
      queues: { south: [], west: [] },
      pedestriansWaiting: 0,
      manual: { south: false, west: false, pedestrian: false }, // held sensor switches
      auto: true,
      stats: { arrived: 0, passed: 0, ranRed: 0, pedestriansCrossed: 0 },
      regulars,
    };

    function newCar(road) {
      const driver = rand() < config.visitorShare
        ? { plate: makePlate(rand), kind: "visitor" }
        : regulars[Math.floor(rand() * regulars.length)];
      return { id: nextCarId++, road, plate: driver.plate, kind: driver.kind };
    }

    sim.addCar = function (road, plate) {
      const car = plate ? { id: nextCarId++, road, plate, kind: "manual" } : newCar(road);
      sim.queues[road].push(car);
      sim.stats.arrived++;
      return car;
    };

    sim.addPedestrian = function () {
      sim.pedestriansWaiting++;
    };

    sim.sensors = function () {
      return {
        southCar: sim.queues.south.length > 0 || sim.manual.south,
        westCar: sim.queues.west.length > 0 || sim.manual.west,
        pedestrian: sim.pedestriansWaiting > 0 || sim.manual.pedestrian,
      };
    };

    // One pass of the board's main loop. Returns what happened, for the page.
    sim.tick = function (now = Date.now()) {
      const events = [];
      const state = sim.state;
      const lights = FSMApi.signals(state);
      const seconds = FSMApi.FSM[state].time / 100;

      if (sim.auto) {
        for (const road of ["south", "west"]) {
          const count = poisson(rand, (config.carsPerMinute[road] / 60) * seconds);
          for (let i = 0; i < count; i++) events.push({ type: "arrive", car: sim.addCar(road) });
        }
        const walkers = poisson(rand, (config.pedestriansPerMinute / 60) * seconds);
        for (let i = 0; i < walkers; i++) sim.addPedestrian();
      }

      const pedestriansHaveRightOfWay = lights.pedestrian === "walk" || lights.pedestrian === "off";
      for (const road of ["south", "west"]) {
        const queue = sim.queues[road];
        const light = lights[road];
        if (light === "green" || light === "yellow") {
          // Entering on yellow is legal; a yellow lets the front car through.
          const leaving = light === "green" ? config.carsPerGreen : 1;
          for (let i = 0; i < leaving && queue.length; i++) {
            const car = queue.shift();
            sim.stats.passed++;
            events.push({ type: "pass", car, light });
          }
        } else if (light === "red" && queue.length) {
          const car = queue[0];
          const risk = (RISK[car.kind] ?? 0) * config.recklessness;
          if (rand() < risk) {
            queue.shift();
            sim.stats.passed++;
            sim.stats.ranRed++;
            events.push({
              type: "violation",
              car,
              violation: {
                id: `${now}-${car.id}`,
                plate: car.plate,
                road: road === "south" ? "South" : "West",
                at: new Date(now).toISOString(),
                simSeconds: Math.round(sim.clockMs / 1000),
                light: "red",
                state: FSMApi.STATE_NAMES[state],
                pedestrianSignal: lights.pedestrian,
                pedestriansCrossing: pedestriansHaveRightOfWay,
                severity: pedestriansHaveRightOfWay ? "high" : "standard",
              },
            });
          }
        }
      }

      if (lights.pedestrian === "walk" && sim.pedestriansWaiting > 0) {
        events.push({ type: "cross", count: sim.pedestriansWaiting });
        sim.stats.pedestriansCrossed += sim.pedestriansWaiting;
        sim.pedestriansWaiting = 0;
      }

      sim.clockMs += seconds * 1000;
      const sensors = sim.sensors();
      sim.state = FSMApi.next(state, sensors);
      events.push({ type: "state", from: state, to: sim.state, input: FSMApi.inputOf(sensors) });
      return events;
    };

    return sim;
  }

  // Every plate with at least one offence, worst first. Built from the saved
  // log, so the memory of offenders survives a reload.
  function summarizeOffenders(violations) {
    const byPlate = new Map();
    for (const v of violations) {
      const entry = byPlate.get(v.plate) || { plate: v.plate, count: 0, high: 0, first: v.at, last: v.at, roads: new Set() };
      entry.count++;
      if (v.severity === "high") entry.high++;
      if (v.at < entry.first) entry.first = v.at;
      if (v.at > entry.last) entry.last = v.at;
      entry.roads.add(v.road);
      byPlate.set(v.plate, entry);
    }
    return [...byPlate.values()]
      .map((e) => ({ ...e, roads: [...e.roads].sort(), repeat: e.count >= REPEAT_AT }))
      .sort((a, b) => b.count - a.count || b.high - a.high || (a.last < b.last ? 1 : -1));
  }

  // A plate with this many offences or more is flagged as a repeat offender.
  // Chosen for the demo, not taken from any law.
  const REPEAT_AT = 2;

  const CSV_COLUMNS = ["at", "plate", "road", "light", "state", "pedestrianSignal", "pedestriansCrossing", "severity", "simSeconds", "id"];
  function toCSV(violations) {
    const cell = (value) => {
      const text = String(value ?? "");
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return [CSV_COLUMNS.join(","), ...violations.map((v) => CSV_COLUMNS.map((c) => cell(v[c])).join(","))].join("\n") + "\n";
  }

  const api = { createSim, summarizeOffenders, toCSV, makePlate, mulberry32, REPEAT_AT, RISK, DEFAULTS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TrafficSim = api;
})(this);
