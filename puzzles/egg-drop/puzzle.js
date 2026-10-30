// The Egg Drop: rules only. Mirrors egg_drop.py.
// A 100-story building has a critical floor: the highest floor (0-100) an egg
// survives a drop from (0 = even floor 1 breaks it). The thief has two replica
// eggs. Each drop survives at or below the critical floor and breaks above it.
//
// A coded strategy is the whole search: find_floor(drop) -> highest safe floor,
// where drop(floor) drops a replica egg and returns true if it broke. Python and
// Java run it all at once and record a transcript (the floors dropped from, then
// the answer or the error), which this file replays one drop at a time.
// Played by hand, there's no answer to give: the round ends once the floor is known.
(function (root, make) {
  if (typeof module === "object" && module.exports) module.exports = make(require("../../shared/engine.js"));
  else (root.RiddleLab.puzzles = root.RiddleLab.puzzles || {})["egg-drop"] = make(root.RiddleLab);
})(typeof self !== "undefined" ? self : globalThis, RL => {
  "use strict";
  const { ProgramError } = RL;
  const FLOORS = 100, EGGS = 2, MAX_DROPS = 200;

  // Fewest drops that always find the floor among n untested floors.
  function minDrops(eggs, n) {
    if (n <= 0) return 0;
    if (eggs <= 0) return Infinity;
    let d = 0;
    while (coverable(d, eggs) < n) d++;
    return d;
  }
  // Floors that d drops and this many eggs can always settle: C(d,1) + ... + C(d,eggs).
  function coverable(d, eggs) {
    let total = 0, c = 1;
    for (let i = 1; i <= eggs; i++) { c = (c * (d - i + 1)) / i; total += c; }
    return total;
  }
  const BEST = minDrops(EGGS, FLOORS);   // 14

  const cases = () => Array.from({ length: FLOORS + 1 }, (_, crit) => ({ crit }));

  // Why drop() can't drop from this floor now, or null if it can.
  function badDrop(s, f) {
    if (!s.eggs) return "Both replica eggs are already broken.";
    if (!Number.isInteger(f) || f < 1 || f > FLOORS) return `drop() needs a floor from 1 to ${FLOORS}, but got ${typeof f === "string" ? f : JSON.stringify(f)}.`;
    if (s.drops.length >= MAX_DROPS) return `More than ${MAX_DROPS} drops.`;
    return null;
  }

  // Run a JavaScript findFloor(drop) for one critical floor and record what it did.
  function transcript(findFloor, crit) {
    const s = { eggs: EGGS, drops: [] };
    const drop = f => {
      const why = badDrop(s, f);
      if (why) throw new ProgramError(why);
      s.drops.push(f);
      if (f > crit) { s.eggs--; return true; }
      return false;
    };
    try { return { drops: s.drops, answer: findFloor(drop) }; }
    catch (e) { return { drops: s.drops, error: e.message, line: e.line || 0 }; }
  }
  const fromFunction = findFloor => crit => transcript(findFloor, crit);
  // Python and Java send one transcript per critical floor (answers[i] for crits[i]).
  function fromAnswers(crits, answers) {
    const byCrit = new Map(crits.map((crit, i) => [crit, answers[i]]));
    return crit => byCrit.get(crit);
  }

  // strategy: crit -> transcript, or null when played by hand.
  // unlucky (by hand only): no fixed floor; the museum answers each drop in whichever
  // way leaves the most drops to go.
  function start(strategy, { crit, unlucky = false }) {
    const s = { crit: unlucky ? null : crit, unlucky, safe: 0, broken: FLOORS + 1, eggs: EGGS, drops: [], answer: null };
    s.plan = strategy ? strategy(crit) : null;
    return s;
  }

  const known = s => s.broken - s.safe === 1;

  function breaks(s, f) {
    if (!s.unlucky) return f > s.crit;
    return minDrops(s.eggs - 1, f - s.safe - 1) > minDrops(s.eggs, s.broken - f - 1);
  }

  function dropFrom(s, f) {
    const why = badDrop(s, f);
    if (why) throw new ProgramError(why);
    const broke = breaks(s, f);
    if (broke) { s.broken = Math.min(s.broken, f); s.eggs--; } else s.safe = Math.max(s.safe, f);
    s.drops.push({ floor: f, broke });
    // the unlucky museum settles on a floor once the game is over
    if (s.unlucky && (known(s) || !s.eggs)) s.crit = known(s) ? s.safe : s.broken - 1;
  }

  // input: a floor chosen by hand. With a coded strategy, each step replays one drop,
  // and the step after the last drop gives its answer.
  function step(s, input) {
    if (!s.plan) return dropFrom(s, input);
    const p = s.plan;
    if (s.drops.length < p.drops.length) return dropFrom(s, p.drops[s.drops.length]);
    if (p.error) throw new ProgramError(p.error, p.line);
    const a = p.answer;
    if (!Number.isInteger(a) || a < 0 || a > FLOORS) throw new ProgramError(`find_floor has to return a floor from 0 to ${FLOORS}, but returned ${typeof a === "string" ? a : JSON.stringify(a ?? null)}.`);
    s.answer = a;
  }

  const plural = n => `${n} drop${n === 1 ? "" : "s"}`;
  const floorText = f => (f ? `floor ${f}` : "0 (even floor 1 breaks an egg)");
  function result(s) {
    const n = s.drops.length;
    if (s.plan) {
      if (s.answer === null) return null;
      return s.answer === s.crit
        ? { ok: true, score: n, text: `Said ${floorText(s.answer)}, correct, after ${plural(n)}.` }
        : { ok: false, score: n, wrong: true, text: `Said ${floorText(s.answer)}, but the highest safe floor is ${s.crit}.` };
    }
    if (known(s)) return { ok: true, score: n, text: s.safe ? `Floor ${s.safe} is the highest safe floor. Found in ${plural(n)}.` : `Even floor 1 breaks an egg. Found in ${plural(n)}.` };
    if (!s.eggs) return { ok: false, score: n, text: `Both eggs broke after ${plural(n)}, and the floor could still be anything from ${s.safe} to ${s.broken - 1}.` };
    return null;
  }
  function mistake(s) {
    if (s.plan && s.answer !== null && s.answer !== s.crit) return `find_floor said ${s.answer}, but the highest safe floor is ${s.crit}.`;
    if (!s.plan && !s.eggs && !known(s)) return `Both eggs broke, but the floor could still be anything from ${s.safe} to ${s.broken - 1}.`;
    if (s.drops.length > BEST) return `That was drop ${s.drops.length}. The best plan never needs more than ${BEST}.`;
    return null;
  }

  function judge(rows) {
    const wrong = rows.filter(r => !r.result.ok);
    const worst = Math.max(...rows.map(r => r.result.score));
    const ok = !wrong.length && worst <= BEST;
    let headline, detail;
    if (wrong.length) {
      headline = `Wrong floor in ${wrong.length} of ${rows.length} cases.`;
      detail = "find_floor has to be sure before it answers.";
    } else if (!ok) {
      headline = `Always right, but needs up to ${worst} drops.`;
      detail = `There's a plan that never needs more than ${BEST}.`;
    } else {
      headline = `Right every time, in at most ${worst} drops.`;
      detail = `No plan can promise fewer than ${BEST}.`;
    }
    return {
      ok, headline, detail, worst, limit: BEST,
      failing: ok ? null : (wrong[0] || rows.find(r => r.result.score === worst)).c,
      bars: rows.map(r => ({
        label: r.c.crit, tick: r.c.crit % 10 === 0, value: r.result.score,
        fail: !r.result.ok || r.result.score > BEST, c: r.c,
        tip: r.result.ok
          ? `Highest safe floor ${r.c.crit}: right after ${plural(r.result.score)}`
          : `Highest safe floor ${r.c.crit}: wrong answer after ${plural(r.result.score)}`,
      })),
    };
  }

  return { id: "egg-drop", FLOORS, EGGS, BEST, MAX_DROPS, minDrops, cases, start, step, result, mistake, judge, transcript, fromFunction, fromAnswers, known };
});
