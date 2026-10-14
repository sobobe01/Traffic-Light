// Intersection Monitor — draws the simulation, runs the clock, and keeps the
// offender log. The log is saved in this browser (localStorage) and can be
// exported as CSV or JSON; nothing is sent anywhere.
(function () {
  "use strict";
  const { createSim, summarizeOffenders, toCSV, REPEAT_AT } = window.TrafficSim;
  const { FSM, STATE_NAMES, signals } = window.TrafficFSM;

  const STORAGE_KEY = "traffic-sim:violations:v1";
  const MAX_SAVED = 10000; // oldest are dropped past this
  const SVG = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);

  // ----------------------------------------------------------- the log ----

  function loadViolations() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  }

  function saveViolations() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(violations.slice(-MAX_SAVED)));
    } catch {
      // Private browsing or storage full: the log still works for this session.
    }
  }

  let violations = loadViolations();
  const rememberedAtStart = violations.length;

  // ------------------------------------------------------------ the sim ----

  const sim = createSim({ seed: Date.now() % 100000 });
  let speed = 1;
  let running = true;
  let timer = null;

  function tickMs() {
    return 900 / speed; // the board waits 90 x 10 ms in every state
  }

  function step() {
    const events = sim.tick(Date.now());
    for (const event of events) {
      if (event.type === "pass") animateCar(event.car, false);
      if (event.type === "violation") {
        violations.push(event.violation);
        animateCar(event.car, true);
        camera(event.car.road, event.car.plate);
      }
      if (event.type === "cross") drawPedestrians(0);
    }
    if (events.some((e) => e.type === "violation")) {
      saveViolations();
      renderRecords();
    }
    renderScene();
    renderStats();
  }

  function schedule() {
    clearTimeout(timer);
    if (running) timer = setTimeout(() => { step(); schedule(); }, tickMs());
  }

  // ---------------------------------------------------------- the scene ----

  const COLORS = ["#4f6d8f", "#8f4f4f", "#6a8f4f", "#8f7a4f", "#5d4f8f", "#3f7f7f", "#7a7a7a", "#9a6b3f"];
  const SOUTH = { w: 22, h: 36, x: 189, frontY: 106, gap: 42, max: 3 };
  const WEST = { w: 40, h: 22, y: 189, frontX: 258, gap: 46, max: 3 };

  function el(tag, attrs, text) {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    if (text != null) node.textContent = text;
    return node;
  }

  function carShape(car, x, y, offender) {
    const g = el("g", { class: `car${offender ? " offender" : ""}`, transform: `translate(${x} ${y})` });
    if (car.road === "south") {
      g.append(el("rect", { width: SOUTH.w, height: SOUTH.h, rx: 5, fill: COLORS[car.id % COLORS.length] }));
      g.append(el("text", { x: 11, y: 18, "text-anchor": "middle", transform: "rotate(-90 11 18)", "dominant-baseline": "middle" }, car.plate));
    } else {
      g.append(el("rect", { width: WEST.w, height: WEST.h, rx: 5, fill: COLORS[car.id % COLORS.length] }));
      g.append(el("text", { x: 20, y: 11, "text-anchor": "middle", "dominant-baseline": "middle" }, car.plate));
    }
    return g;
  }

  // Cars waiting at each stop line, front car first.
  function drawQueues() {
    const group = $("cars");
    group.querySelectorAll(".queued, .more").forEach((n) => n.remove());
    sim.queues.south.slice(0, SOUTH.max).forEach((car, i) => {
      const shape = carShape(car, SOUTH.x, SOUTH.frontY - i * SOUTH.gap);
      shape.classList.add("queued");
      group.append(shape);
    });
    sim.queues.west.slice(0, WEST.max).forEach((car, i) => {
      const shape = carShape(car, WEST.frontX + i * WEST.gap, WEST.y);
      shape.classList.add("queued");
      group.append(shape);
    });
    const southMore = sim.queues.south.length - SOUTH.max;
    const westMore = sim.queues.west.length - WEST.max;
    if (southMore > 0) group.append(el("text", { class: "road-label more", x: 200, y: 32, "text-anchor": "middle" }, `+${southMore}`));
    if (westMore > 0) group.append(el("text", { class: "road-label more", x: 396, y: 248, "text-anchor": "end" }, `+${westMore}`));
  }

  // A car leaving the stop line: drawn at the front, then driven off the map.
  function animateCar(car, offender) {
    const south = car.road === "south";
    const x = south ? SOUTH.x : WEST.frontX;
    const y = south ? SOUTH.frontY : WEST.y;
    const holder = el("g", { transform: `translate(${x} ${y})` });
    const shape = carShape(car, 0, 0, offender);
    shape.classList.add("moving");
    shape.style.setProperty("--move", `${tickMs() * 1.4}ms`);
    holder.append(shape);
    $("cars").append(holder);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      shape.style.transform = south ? `translateY(${420 - y}px)` : `translateX(${-60 - x}px)`;
    }));
    setTimeout(() => holder.remove(), tickMs() * 1.5 + 50);
  }

  // The red-light camera: one flash at the stop line and the plate it read.
  function camera(road, plate) {
    const flashes = $("flashes");
    const south = road === "south";
    const flash = el("rect", south ? { class: "flash", x: 166, y: 120, width: 68, height: 40, rx: 6 }
                                   : { class: "flash", x: 240, y: 166, width: 40, height: 68, rx: 6 });
    flashes.append(flash);
    const tag = el("g", { class: "tag", transform: south ? "translate(236 128)" : "translate(262 136)" });
    tag.append(el("rect", { width: 92, height: 20, rx: 4 }));
    tag.append(el("text", { x: 46, y: 14, "text-anchor": "middle" }, `RED · ${plate}`));
    flashes.append(tag);
    setTimeout(() => flash.remove(), 700);
    setTimeout(() => tag.remove(), 1700);
  }

  function drawPedestrians(count) {
    const group = $("peds");
    group.replaceChildren();
    for (let i = 0; i < Math.min(count, 6); i++) {
      group.append(el("circle", { class: "ped", cx: 156 - (i % 3) * 12, cy: 156 - Math.floor(i / 3) * 12, r: 5 }));
    }
  }

  function renderScene() {
    const lights = signals(sim.state);
    for (const road of ["south", "west"]) {
      $(`sig-${road}`).querySelectorAll("circle").forEach((c) => c.classList.toggle("on", c.dataset.light === lights[road]));
    }
    $("sig-walk").setAttribute("class", `walk-signal ${lights.pedestrian}`);
    $("sig-walk").querySelector("text").textContent = lights.pedestrian === "walk" ? "WALK" : "DON'T";
    drawQueues();
    drawPedestrians(sim.pedestriansWaiting);

    const s = sim.sensors();
    const input = (s.pedestrian ? 4 : 0) | (s.southCar ? 2 : 0) | (s.westCar ? 1 : 0);
    $("b-state").textContent = STATE_NAMES[sim.state];
    $("b-in").textContent = input.toString(2).padStart(3, "0");
    $("b-out").textContent = `0x${FSM[sim.state].out.toString(16).toUpperCase().padStart(2, "0")}`;
    $("b-walk").textContent = `0x${FSM[sim.state].walk.toString(16).toUpperCase().padStart(2, "0")}`;
    $("b-wait").textContent = `S ${sim.queues.south.length} · W ${sim.queues.west.length} · P ${sim.pedestriansWaiting}`;
  }

  // ------------------------------------------------------------ records ----

  // Today's offences show the time only; older ones show the date.
  function fmtTime(iso, short = false) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const today = d.toDateString() === new Date().toDateString();
    return short && today
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function cell(tag, text, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text instanceof Node) node.append(text);
    else node.textContent = text;
    return node;
  }

  function plateBadge(plate) {
    return cell("span", plate, "plate");
  }

  function renderStats() {
    const offenders = summarizeOffenders(violations);
    $("t-passed").textContent = sim.stats.passed;
    $("t-red").textContent = violations.length;
    $("t-offenders").textContent = offenders.length;
    $("t-repeat").textContent = offenders.filter((o) => o.repeat).length;
  }

  function renderRecords() {
    const query = $("search").value.trim().toUpperCase().replace(/\s+/g, " ");
    const offenders = summarizeOffenders(violations).filter((o) => !query || o.plate.includes(query));

    const table = $("offenders");
    table.replaceChildren();
    const head = document.createElement("tr");
    ["Plate", "Offences", "Near peds", "Roads", "Last seen", ""].forEach((h, i) =>
      head.append(cell("th", h, i === 1 || i === 2 ? "num" : "")));
    table.append(cell("thead", head));
    const body = document.createElement("tbody");
    for (const o of offenders.slice(0, 200)) {
      const row = document.createElement("tr");
      row.append(cell("td", plateBadge(o.plate)), cell("td", o.count, "num"), cell("td", o.high, "num"),
                 cell("td", o.roads.join(", ")), cell("td", fmtTime(o.last, true)),
                 cell("td", o.repeat ? cell("span", "Repeat", "flag") : ""));
      body.append(row);
    }
    if (!offenders.length) {
      const row = document.createElement("tr");
      const td = cell("td", query ? "No plate matches that search." : "No red-light runners yet.", "empty");
      td.colSpan = 6;
      row.append(td);
      body.append(row);
    }
    table.append(body);

    const log = $("log");
    log.replaceChildren();
    const recent = violations.filter((v) => !query || v.plate.includes(query)).slice(-100).reverse();
    for (const v of recent) {
      const what = v.severity === "high"
        ? cell("span", `${v.road} road · ran the red while pedestrians were crossing`, "high")
        : cell("span", `${v.road} road · ran the red`);
      const item = document.createElement("li");
      item.append(cell("span", fmtTime(v.at), "when"), what, plateBadge(v.plate));
      log.append(item);
    }
    if (!recent.length) log.append(cell("li", "Nothing logged yet.", "empty"));

    $("memory-note").textContent =
      `${violations.length} offence(s) on file` +
      (rememberedAtStart ? `, ${rememberedAtStart} remembered from earlier sessions` : "") +
      `. A plate with ${REPEAT_AT} or more is flagged as a repeat offender. Saved in this browser only.`;
  }

  // ----------------------------------------------------------- controls ----

  $("play").addEventListener("click", () => {
    running = !running;
    $("play").textContent = running ? "Pause" : "Play";
    schedule();
  });

  document.querySelectorAll("[data-speed]").forEach((button) => {
    button.addEventListener("click", () => {
      speed = Number(button.dataset.speed);
      document.querySelectorAll("[data-speed]").forEach((b) => b.setAttribute("aria-pressed", b === button));
      schedule();
    });
  });

  $("auto").addEventListener("change", (e) => { sim.auto = e.target.checked; });

  function bindSlider(id, out, apply, format = (v) => v) {
    const input = $(id);
    const update = () => { $(out).textContent = format(Number(input.value)); apply(Number(input.value)); };
    input.addEventListener("input", update);
    update();
  }
  bindSlider("r-south", "o-south", (v) => { sim.config.carsPerMinute.south = v; });
  bindSlider("r-west", "o-west", (v) => { sim.config.carsPerMinute.west = v; });
  bindSlider("r-ped", "o-ped", (v) => { sim.config.pedestriansPerMinute = v; });
  bindSlider("r-reck", "o-reck", (v) => { sim.config.recklessness = v / 10; }, (v) => `${(v / 10).toFixed(1)}×`);

  $("add-south").addEventListener("click", () => { sim.addCar("south"); renderScene(); });
  $("add-west").addEventListener("click", () => { sim.addCar("west"); renderScene(); });
  $("add-ped").addEventListener("click", () => { sim.addPedestrian(); renderScene(); });
  $("search").addEventListener("input", renderRecords);

  function download(name, type, text) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  $("export-csv").addEventListener("click", () => download(`red-light-violations-${stamp()}.csv`, "text/csv", toCSV(violations)));
  $("export-json").addEventListener("click", () => download(`red-light-violations-${stamp()}.json`, "application/json",
    JSON.stringify({ exportedAt: new Date().toISOString(), offenders: summarizeOffenders(violations), violations }, null, 2)));

  $("clear").addEventListener("click", () => {
    if (!violations.length || !confirm(`Delete all ${violations.length} logged offences from this browser? Export first if you need them.`)) return;
    violations = [];
    saveViolations();
    renderRecords();
    renderStats();
  });

  // -------------------------------------------------------------- start ----

  renderScene();
  renderRecords();
  renderStats();
  schedule();
})();
