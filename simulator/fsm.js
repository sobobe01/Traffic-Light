// The traffic-light state machine from ../TableTrafficLight.c, unchanged:
// same states, same outputs, same next-state table. tests/fsm.test.js reads the
// C file and fails if the two ever disagree.
//
// Outputs (Port B):  PB5 west red · PB4 west yellow · PB3 west green
//                    PB2 south red · PB1 south yellow · PB0 south green
// Walk lights (Port F): 0x08 walk (green) · 0x02 don't walk (red) · 0x00 off
// Inputs (Port E):   PE2 pedestrian · PE1 south car · PE0 west car
// The C comments say north/south and east/west; the lab's roads are South and
// West, so NS = South road and EW = West road.
(function (root) {
  "use strict";

  const STATE_NAMES = ["goNS", "waitNS", "goEW", "waitEW", "walk",
                       "hurryUp", "hurryUp1", "hurryUp2", "hurryUp3", "hurryUp4"];
  const [goNS, waitNS, goEW, waitEW, walk, hurryUp, hurryUp1, hurryUp2, hurryUp3, hurryUp4] =
    STATE_NAMES.map((_, i) => i);

  // { trafficLights, walkLights, time (10 ms units), next[input 0..7] }
  const FSM = [
    { out: 0x21, walk: 0x02, time: 90, next: [goNS, waitNS, goNS, waitNS, waitNS, waitNS, waitNS, waitNS] },
    { out: 0x22, walk: 0x02, time: 90, next: [goEW, goEW, goEW, goEW, walk, goEW, walk, goEW] },
    { out: 0x0C, walk: 0x02, time: 90, next: [goEW, goEW, waitEW, waitEW, waitEW, waitEW, waitEW, waitEW] },
    { out: 0x14, walk: 0x02, time: 90, next: [walk, walk, goNS, goNS, walk, walk, walk, walk] },
    { out: 0x24, walk: 0x08, time: 90, next: [walk, hurryUp, hurryUp, hurryUp, walk, hurryUp, hurryUp, hurryUp] },
    { out: 0x24, walk: 0x02, time: 90, next: Array(8).fill(hurryUp1) },
    { out: 0x24, walk: 0x00, time: 90, next: Array(8).fill(hurryUp2) },
    { out: 0x24, walk: 0x02, time: 90, next: Array(8).fill(hurryUp3) },
    { out: 0x24, walk: 0x00, time: 90, next: Array(8).fill(hurryUp4) },
    { out: 0x24, walk: 0x02, time: 90, next: [goNS, goEW, goNS, goNS, goNS, goEW, goNS, goNS] },
  ];

  function lightOf(bits, greenBit) {
    if (bits & (greenBit << 2)) return "red";
    if (bits & (greenBit << 1)) return "yellow";
    if (bits & greenBit) return "green";
    return "off";
  }

  // What each signal shows in a state.
  function signals(state) {
    const s = FSM[state];
    return {
      south: lightOf(s.out, 0x01),
      west: lightOf(s.out >> 3, 0x01),
      pedestrian: s.walk === 0x08 ? "walk" : s.walk === 0x02 ? "dont-walk" : "off",
    };
  }

  // Port E input, as the board reads it.
  function inputOf({ pedestrian, southCar, westCar }) {
    return (pedestrian ? 4 : 0) | (southCar ? 2 : 0) | (westCar ? 1 : 0);
  }

  function next(state, sensors) {
    return FSM[state].next[inputOf(sensors)];
  }

  const api = { FSM, STATE_NAMES, START: goNS, signals, inputOf, next };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TrafficFSM = api;
})(this);
