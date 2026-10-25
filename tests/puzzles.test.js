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
