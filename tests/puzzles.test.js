// node --test tests/*.test.js
const test = require("node:test");
const assert = require("node:assert");
const { checkAll, Runner } = require("../shared/engine.js");
const robots = require("../puzzles/parachuting-robots/puzzle.js");
const hats = require("../puzzles/prisoner-hats/puzzle.js");

const SOLUTION = "crawl:\n left\n skipNext\n goto crawl\nsprint:\n left\n goto sprint\n";

test("robots: the crawl-and-sprint program meets for every gap", () => {
  const v = checkAll(robots, robots.compile(SOLUTION));
  assert.ok(v.ok);
  assert.strictEqual(v.bars[0].value, 3); // matches the Python version (9g - 6)
  assert.strictEqual(v.bars[39].value, 354);
});

test("robots: same-speed walking fails at gap 1 and says why", () => {
  const v = checkAll(robots, robots.compile("start:\n left\n goto start\n"));
  assert.strictEqual(v.failing, 1);
  assert.match(v.detail, /never closes/);
});

test("robots: a run that can never meet stops early instead of running to the cycle limit", () => {
  const run = (src, gap) => { const st = robots.start(robots.compile(src), gap); let r; while (!(r = robots.result(st))) robots.step(st); return [r, st.cycle]; };
  let [r, cycles] = run("start:\n left\n goto start\n", 40);
  assert.ok(!r.ok && cycles < 100);
  assert.match(r.text, /never closes/);
  [r, cycles] = run("start:\n right\n left\n goto start\n", 7);  // both step back and forth forever
  assert.ok(!r.ok && cycles < 10);
  assert.match(r.text, /in place/);
});

test("robots: the page can keep a never-meeting run going for twice as long", () => {
  const prog = robots.compile("start:\n left\n goto start\n");
  const finish = linger => { const st = robots.start(prog, 40); st.linger = linger; while (!robots.result(st)) robots.step(st); return st; };
  const once = finish(1), twice = finish(2);
  assert.strictEqual(twice.cycle, 2 * once.cycle);
  assert.strictEqual(robots.result(twice).text, robots.result(once).text);
});

test("robots: on the page, drifting apart keeps going until the distance has doubled", () => {
  const prog = robots.compile("start:\n left\n skipNext\n goto start\nturn:\n right\n goto turn\n");
  const st = robots.start(prog, 3);
  st.linger = 2;
  while (!robots.result(st)) robots.step(st);
  assert.strictEqual(robots.result(st).text, "They drift apart.");
  assert.ok(st.cycle >= 2 * st.neverAt);
  assert.ok(robots.distance(st) >= 2 * st.neverDist + 10);
});

test("robots: compile errors carry a line number", () => {
  assert.throws(() => robots.compile("left\njump\n"), e => e.line === 2);
});

const strategy = name => ({
  black: () => "black",
  pairs: (seen, heard) => { const me = heard.length; return me % 2 === 0 ? (seen[0] ?? "black") : heard[me - 1]; },
  parity: (seen, heard) => {
    const b = seen.filter(h => h === "black").length;
    if (!heard.length) return b % 2 ? "black" : "white";
    let p = heard[0] === "black" ? 1 : 0;
    for (const h of heard.slice(1)) if (h === "black") p ^= 1;
    return (p + b) % 2 ? "black" : "white";
  },
}[name]);

test("hats: worst cases match the Python version", () => {
  assert.strictEqual(checkAll(hats, strategy("black"), { n: 10 }).bars.findIndex(b => b.value), 0);
  assert.strictEqual(checkAll(hats, strategy("pairs"), { n: 10 }).bars.findIndex(b => b.value), 5);
  assert.ok(checkAll(hats, strategy("parity"), { n: 10 }).ok);
});

test("hats: replaying the failing lineup stops at the first wrong guess after the back prisoner", () => {
  const v = checkAll(hats, strategy("pairs"), { n: 6 });
  const r = new Runner(hats);
  r.load(strategy("pairs"), v.failing, { stopAtMistake: true });
  r.step(100);
  assert.match(r.mistake, /^Prisoner \d said \w+ but wore \w+\.$/);
  assert.ok(r.state.guesses.length >= 2);
});

test("hats: a bad answer names the prisoner", () => {
  const r = new Runner(hats);
  r.load(() => "grey", ["black", "white"]);
  r.step();
  assert.match(r.error.message, /Prisoner 2/);  // back of a 2-prisoner line
});

test("hats: answers from Python or Java become a strategy that replays the same", () => {
  const lineups = hats.cases({ n: 8 });
  const answers = lineups.map(l => { const s = hats.start(strategy("parity"), l); while (!hats.result(s)) hats.step(s); return s.guesses; });
  assert.ok(checkAll(hats, hats.fromGuesses(lineups, answers), { n: 8 }).ok);
});

const eggs = require("../puzzles/egg-drop/puzzle.js");
const FIND = {
  one: drop => { for (let f = 1; f <= 100; f++) if (drop(f)) return f - 1; return 100; },
  tens: drop => {
    let safe = 0, floor = 10;
    while (floor <= 100 && !drop(floor)) { safe = floor; floor += 10; }
    const top = Math.min(floor, 101);
    for (let f = safe + 1; f < top; f++) if (drop(f)) return f - 1;
    return top - 1;
  },
  shrinking: drop => {
    let safe = 0, gap = 14, floor;
    for (;;) {
      floor = Math.min(safe + gap, 100);
      if (drop(floor)) break;
      safe = floor;
      if (safe === 100) return 100;
      gap--;
    }
    for (let f = safe + 1; f < floor; f++) if (drop(f)) return f - 1;
    return floor - 1;
  },
};
const check = name => checkAll(eggs, eggs.fromFunction(FIND[name]));

test("eggs: worst cases match the Python version (100, 19, 14)", () => {
  assert.strictEqual(check("one").worst, 100);
  const tens = check("tens");
  assert.ok(!tens.ok);
  assert.strictEqual(tens.worst, 19);
  const v = check("shrinking");
  assert.ok(v.ok);
  assert.strictEqual(v.worst, 14);
  assert.strictEqual(v.bars.length, 101);
});

test("eggs: the best plan with two eggs and 100 floors is 14 drops", () => {
  assert.strictEqual(eggs.BEST, 14);
  assert.strictEqual(eggs.minDrops(2, 10), 4);   // the video's 10-floor example: 4, 7, 9
  assert.strictEqual(eggs.minDrops(1, 37), 37);
});

test("eggs: the replay goes one drop per step, then gives the answer", () => {
  const r = new Runner(eggs);
  r.load(eggs.fromFunction(FIND.shrinking), { crit: 100 });
  r.step(12);
  assert.strictEqual(r.state.drops.length, 12);
  assert.strictEqual(r.result, null);
  r.step();
  assert.ok(r.result.ok);
  assert.strictEqual(r.state.answer, 100);
});

test("eggs: replaying a too-slow plan stops at drop 15", () => {
  const v = check("tens");
  const r = new Runner(eggs);
  r.load(eggs.fromFunction(FIND.tens), v.failing, { stopAtMistake: true });
  r.step(200);
  assert.strictEqual(r.state.drops.length, 15);
  assert.match(r.mistake, /never needs more than 14/);
});

test("eggs: a wrong answer fails, and the replay stops on it", () => {
  const guess = drop => (drop(50) ? 0 : 75);
  const v = checkAll(eggs, eggs.fromFunction(guess));
  assert.match(v.headline, /Wrong floor in 99 of 101/);
  const r = new Runner(eggs);
  r.load(eggs.fromFunction(guess), v.failing, { stopAtMistake: true });
  r.step(10);
  assert.match(r.mistake, /find_floor said/);
});

test("eggs: a third egg is an error", () => {
  const r = new Runner(eggs);
  r.load(eggs.fromFunction(drop => { drop(100); drop(100); drop(100); return 0; }), { crit: 5 });
  r.step(10);
  assert.match(r.error.message, /Both replica eggs are already broken/);
  assert.strictEqual(r.state.drops.length, 2);
});

test("eggs: the unlucky museum makes the best plan use all 14 drops by hand", () => {
  const r = new Runner(eggs);
  r.load(null, { unlucky: true });
  while (!r.result) {
    const s = r.state;
    let f = s.safe + 1;
    if (s.eggs === 2) { let floor = 0, gap = 14; while (floor <= s.safe) { floor += gap; gap--; } f = Math.min(floor, 100); }
    r.step(1, f);
  }
  assert.ok(r.result.ok);
  assert.strictEqual(r.state.drops.length, 14);
});

test("eggs: runs recorded by Python or Java replay the same", () => {
  const crits = eggs.cases().map(c => c.crit);
  const answers = crits.map(crit => eggs.transcript(FIND.shrinking, crit));
  const v = checkAll(eggs, eggs.fromAnswers(crits, answers));
  assert.ok(v.ok);
  assert.strictEqual(v.worst, 14);
});
