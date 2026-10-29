// The Egg Drop: rules only. Mirrors egg_drop.py.
// A 100-story building has a critical floor: the highest floor (0-100) an egg
// survives a drop from (0 = even floor 1 breaks it). The thief has two replica
// eggs. Each turn she drops one from a floor; it survives at or below the
// critical floor and breaks above it. She wins when she knows the floor.
//
// A strategy is next_drop(safe, broken, eggs) -> floor, where safe is the highest
// floor an egg has survived (0 at first), broken the lowest floor one broke on
// (101 at first), and eggs how many replicas are left.
(function (root, make) {
  if (typeof module === "object" && module.exports) module.exports = make(require("../../shared/engine.js"));
  else (root.RiddleLab.puzzles = root.RiddleLab.puzzles || {})["egg-drop"] = make(root.RiddleLab);
})(typeof self !== "undefined" ? self : globalThis, RL => {
  "use strict";
  const { ProgramError } = RL;
  const FLOORS = 100, EGGS = 2;

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

  // unlucky: no fixed floor; the museum answers each drop in the way that costs the most drops
  function start(strategy, { crit, unlucky = false }) {
    return { strategy, crit: unlucky ? null : crit, unlucky, safe: 0, broken: FLOORS + 1, eggs: EGGS, drops: [] };
  }

  const known = s => s.broken - s.safe === 1;

  // Why this floor can't be dropped from next, or null if it can.
  function badFloor(s, f) {
    if (!Number.isInteger(f) || f < 1 || f > FLOORS) return `The egg has to be dropped from a floor from 1 to ${FLOORS}, but next_drop chose ${JSON.stringify(f)}.`;
    if (f <= s.safe) return `Floor ${f} is already known to be safe: an egg survived floor ${s.safe}.`;
    if (f >= s.broken) return `Floor ${f} is already known to break eggs: one broke on floor ${s.broken}.`;
    return null;
  }

  function breaks(s, f) {
    if (!s.unlucky) return f > s.crit;
    return minDrops(s.eggs - 1, f - s.safe - 1) > minDrops(s.eggs, s.broken - f - 1);
  }

  // input: a floor chosen by hand
  function step(s, input) {
    const f = input !== undefined ? input : call(() => s.strategy(s.safe, s.broken, s.eggs));
    const why = badFloor(s, f);
    if (why) throw new ProgramError(why);
    const broke = breaks(s, f);
    if (broke) { s.broken = f; s.eggs--; } else s.safe = f;
    s.drops.push({ floor: f, broke });
    // the unlucky museum settles on a floor once the game is over
    if (s.unlucky && (known(s) || !s.eggs)) s.crit = known(s) ? s.safe : s.broken - 1;
  }
  function call(fn) {
    try { return fn(); } catch (e) { throw new ProgramError(`next_drop: ${e.message}`); }
  }

  const plural = n => `${n} drop${n === 1 ? "" : "s"}`;
  function result(s) {
    const n = s.drops.length;
    if (known(s)) return { ok: true, score: n, text: s.safe ? `Floor ${s.safe} is the highest safe floor. Found in ${plural(n)}.` : `Even floor 1 breaks an egg. Found in ${plural(n)}.` };
    if (!s.eggs) return { ok: false, score: n, text: `Both eggs broke after ${plural(n)}, and the floor could still be anything from ${s.safe} to ${s.broken - 1}.` };
    return null;
  }
  function mistake(s) {
    if (!s.eggs && !known(s)) return `Both eggs broke, but the floor could still be anything from ${s.safe} to ${s.broken - 1}.`;
    if (s.drops.length > BEST) return `That was drop ${s.drops.length}. The best plan never needs more than ${BEST}.`;
    return null;
  }

  function judge(rows) {
    const lost = rows.filter(r => !r.result.ok);
    const worst = Math.max(...rows.map(r => r.result.score));
    const ok = !lost.length && worst <= BEST;
    let headline, detail;
    if (lost.length) {
      headline = `Both eggs broke before the floor was found in ${lost.length} of ${rows.length} cases.`;
      detail = "With one egg left, she can't skip a floor.";
    } else if (!ok) {
      headline = `Always finds the floor, but needs up to ${worst} drops.`;
      detail = `There's a plan that never needs more than ${BEST}.`;
    } else {
      headline = `Finds the floor every time, in at most ${worst} drops.`;
      detail = `No plan can promise fewer than ${BEST}.`;
    }
    return {
      ok, headline, detail, worst, limit: BEST,
      failing: ok ? null : (lost[0] || rows.find(r => r.result.score === worst)).c,
      bars: rows.map(r => ({
        label: r.c.crit, tick: r.c.crit % 10 === 0, value: r.result.score,
        fail: !r.result.ok || r.result.score > BEST, c: r.c,
        tip: r.result.ok
          ? `Highest safe floor ${r.c.crit}: found in ${plural(r.result.score)}`
          : `Highest safe floor ${r.c.crit}: both eggs broke after ${plural(r.result.score)}`,
      })),
    };
  }

  // Python and Java run every case at once and return the floors they dropped from
  // (answers[i] for crits[i]); this turns them back into a next_drop strategy.
  function fromAnswers(crits, answers) {
    const table = new Map(), key = (safe, broken, eggs) => `${safe},${broken},${eggs}`;
    crits.forEach((crit, i) => {
      const s = start(null, { crit });
      for (const f of answers[i]) {
        const k = key(s.safe, s.broken, s.eggs);
        if (!table.has(k)) table.set(k, f);
        if (badFloor(s, f)) break;
        if (f > crit) { s.broken = f; s.eggs--; } else s.safe = f;
      }
    });
    return (safe, broken, eggs) => {
      const k = key(safe, broken, eggs);
      if (!table.has(k)) throw new Error("gave different floors for the same situation. Does it use randomness?");
      return table.get(k);
    };
  }

  return { id: "egg-drop", FLOORS, EGGS, BEST, minDrops, cases, start, step, result, mistake, judge, fromAnswers, badFloor };
});
