// Parachuting Robots: rules only. Mirrors parachuting_robots.py.
(function (root, make) {
  if (typeof module === "object" && module.exports) module.exports = make(require("../../shared/engine.js"));
  else (root.RiddleLab.puzzles = root.RiddleLab.puzzles || {})["parachuting-robots"] = make(root.RiddleLab);
})(typeof self !== "undefined" ? self : globalThis, RL => {
  "use strict";
  const { ProgramError } = RL;
  const MAX_CYCLES = 100000;
  const GAPS = 40;
  const OPS = { left: "left", right: "right", skipnext: "skipNext", goto: "goto" };
  const LABEL = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/;

  const stripComment = raw => raw.split(/#|\/\//)[0];

  function compile(source) {
    const ins = [], labels = new Map();
    source.split("\n").forEach((raw, i) => {
      const line = i + 1;
      let text = stripComment(raw).trim(), m;
      while ((m = LABEL.exec(text))) {
        if (labels.has(m[1])) throw new ProgramError(`"${m[1]}" is defined twice.`, line);
        labels.set(m[1], ins.length);
        text = m[2].trim();
      }
      if (!text) return;
      const parts = text.split(/\s+/);
      const op = OPS[parts[0].toLowerCase()];
      if (!op) throw new ProgramError(`"${parts[0]}" isn't an instruction.`, line);
      if (op === "goto") {
        if (parts.length !== 2) throw new ProgramError("goto needs a label, like: goto start", line);
        ins.push({ op, arg: parts[1], line });
      } else {
        if (parts.length !== 1) throw new ProgramError(`${op} takes nothing after it.`, line);
        ins.push({ op, line });
      }
    });
    for (const x of ins) if (x.op === "goto" && !labels.has(x.arg)) throw new ProgramError(`No label called "${x.arg}".`, x.line);
    return { ins, labels };
  }

  function start(program, gap) {
    return {
      program, gap, cycle: 0, met: false,
      robots: [{ name: "A", pos: 0, pc: 0 }, { name: "B", pos: gap, pc: 0 }],
      chutes: new Map([[0, 0], [gap, 1]]), // cell -> whose parachute
    };
  }

  function step(s) {
    const before = s.robots.map(r => r.pos);
    for (const r of s.robots) {
      const x = s.program.ins[r.pc];
      if (!x) continue;
      r.pc++;
      if (x.op === "left") r.pos--;
      else if (x.op === "right") r.pos++;
      else if (x.op === "skipNext") { if (s.chutes.has(r.pos)) r.pc++; }
      else r.pc = s.program.labels.get(x.arg);
    }
    s.cycle++;
    const [p, q] = s.robots.map(r => r.pos);
    s.met = p === q || (p === before[1] && q === before[0]);
  }

  const stopped = s => s.robots.every(r => r.pc >= s.program.ins.length);
  const distance = s => Math.abs(s.robots[0].pos - s.robots[1].pos);

  function why(s) {
    if (stopped(s)) return "Both robots stopped.";
    const d = distance(s);
    if (d === s.gap) return "They move in step, so the gap never closes.";
    if (d > s.gap) return "They drift apart.";
    return "They get closer, but not close enough.";
  }

  function result(s) {
    if (s.met) return { ok: true, score: s.cycle, text: `Met after ${s.cycle.toLocaleString()} cycles` };
    if (stopped(s) || s.cycle >= MAX_CYCLES) return { ok: false, score: null, text: why(s) };
    return null;
  }

  function judge(rows) {
    const failed = rows.filter(r => !r.result.ok);
    const worst = Math.max(0, ...rows.filter(r => r.result.ok).map(r => r.result.score));
    return {
      ok: !failed.length,
      headline: failed.length ? `Fails for ${failed.length} of ${rows.length} gaps.` : `Works for every gap up to ${rows.length}.`,
      detail: failed.length ? `First failure: gap ${failed[0].c}. ${failed[0].result.text}` : `Slowest: ${worst.toLocaleString()} cycles.`,
      failing: failed.length ? failed[0].c : null,
      bars: rows.map(r => ({
        label: r.c, value: r.result.ok ? r.result.score : null, fail: !r.result.ok, c: r.c,
        tip: r.result.ok ? `Gap ${r.c}: met after ${r.result.score.toLocaleString()} cycles` : `Gap ${r.c}: never met`,
      })),
    };
  }

  return {
    id: "parachuting-robots", MAX_CYCLES, GAPS,
    compile, cases: () => Array.from({ length: GAPS }, (_, i) => i + 1),
    start, step, result, judge, stopped, distance,
  };
});
