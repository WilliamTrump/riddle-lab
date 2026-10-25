// Prisoner Hats: rules only. Mirrors prisoner_hats.py.
// lineup[0] is the back of the line (speaks first); lineup[n - 1] is the front.
(function (root, make) {
  if (typeof module === "object" && module.exports) module.exports = make(require("../../shared/engine.js"));
  else (root.RiddleLab.puzzles = root.RiddleLab.puzzles || {})["prisoner-hats"] = make(root.RiddleLab);
})(typeof self !== "undefined" ? self : globalThis, RL => {
  "use strict";
  const { ProgramError } = RL;

  // Strategies are written in Python or Java and run elsewhere (a worker, or the
  // local server) on whole lineups at once. This turns those answers back into a
  // guess(seen, heard) function: a prisoner's seen + heard pins down their answer.
  const key = (seen, heard) => seen.join(",") + "|" + heard.join(",");
  function fromGuesses(lineups, answers) {
    const table = new Map();
    lineups.forEach((lineup, j) => lineup.forEach((_, i) =>
      table.set(key(lineup.slice(i + 1), answers[j].slice(0, i)), answers[j][i])));
    return (seen, heard) => table.get(key(seen, heard));
  }

  const seenBy = (lineup, i) => lineup.slice(i + 1);
  const saved = s => s.guesses.reduce((k, g, i) => k + (g === s.lineup[i]), 0);

  function start(fn, lineup) { return { fn, lineup, guesses: [] }; }

  // input: a word chosen by hand; otherwise the strategy decides
  function step(s, input) {
    const i = s.guesses.length;
    let g = input;
    if (g === undefined) {
      try { g = s.fn(Object.freeze(seenBy(s.lineup, i)), Object.freeze(s.guesses.slice())); }
      catch (e) { throw new ProgramError(`Prisoner ${i + 1}: ${e.message}`); }
    }
    if (g !== "black" && g !== "white") throw new ProgramError(`Prisoner ${i + 1} said ${JSON.stringify(g)}. Return "black" or "white".`);
    s.guesses.push(g);
  }

  function result(s) {
    const n = s.lineup.length;
    if (s.guesses.length < n) return null;
    const k = saved(s);
    return { ok: k >= n - 1, score: k, text: `${k} of ${n} free` };
  }

  // The back prisoner can't be helped, so only a later wrong guess counts as a mistake.
  function mistake(s) {
    const i = s.guesses.length - 1;
    if (i < 1 || s.guesses[i] === s.lineup[i]) return null;
    return `Prisoner ${i + 1} said ${s.guesses[i]} but wore ${s.lineup[i]}.`;
  }

  function cases({ n = 10 } = {}) {
    return Array.from({ length: 2 ** n }, (_, mask) =>
      Array.from({ length: n }, (_, i) => ((mask >> i) & 1 ? "black" : "white")));
  }

  function judge(rows, { n = 10 } = {}) {
    const byScore = Array.from({ length: n + 1 }, () => []);
    rows.forEach(r => byScore[r.result.score].push(r.c));
    const worst = byScore.findIndex(list => list.length);
    const avg = rows.reduce((t, r) => t + r.result.score, 0) / rows.length;
    const ok = worst >= n - 1;
    return {
      ok,
      headline: ok ? `Always saves at least ${worst} of ${n}.` : `Worst case: only ${worst} of ${n} go free.`,
      detail: ok ? "That's the best possible." : `Average ${avg.toFixed(1)}.`,
      failing: ok ? null : byScore[worst][0],
      bars: byScore.map((list, k) => ({
        label: k, value: list.length, fail: list.length > 0 && k < n - 1, c: list[0],
        tip: `${k} free: ${list.length.toLocaleString()} lineup${list.length === 1 ? "" : "s"}`,
      })),
    };
  }

  const randomLineup = n => Array.from({ length: n }, () => (Math.random() < 0.5 ? "black" : "white"));

  return { id: "prisoner-hats", fromGuesses, cases, start, step, result, mistake, judge, seenBy, saved, randomLineup };
});
