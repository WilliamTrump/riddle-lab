// Riddle Lab engine. Puzzles are plain objects with this shape:
//
//   id                      "prisoner-hats"
//   compile(source)         -> strategy, or throws ProgramError(message, line)
//   cases(settings)         -> every starting case to test
//   start(strategy, case)   -> state
//   step(state, input?)     advance one step (input: a move made by hand)
//   result(state)           -> null while running, else { ok, score, text }
//   judge(rows, settings)   -> { ok, headline, detail, bars, failing }
//   mistake(state)          optional: text when the last step went wrong
//
// Works in the browser (window.RiddleLab) and in Node (require).
(function (root) {
  "use strict";

  class ProgramError extends Error {
    constructor(message, line = 0) { super(message); this.line = line; }
  }

  function runCase(puzzle, strategy, c) {
    const state = puzzle.start(strategy, c);
    let r;
    while (!(r = puzzle.result(state))) puzzle.step(state);
    return r;
  }

  function checkAll(puzzle, strategy, settings = {}) {
    const rows = puzzle.cases(settings).map(c => ({ c, result: runCase(puzzle, strategy, c) }));
    return puzzle.judge(rows, settings);
  }

  // Steps one case at a time for the page to draw. Call tick(ms) every frame.
  class Runner {
    constructor(puzzle) {
      this.puzzle = puzzle;
      this.speed = 10;          // steps per second while playing
      this.playing = false;
      this.state = null;
      this.subs = new Set();
    }
    on(fn) { this.subs.add(fn); }
    emit(type, extra) { for (const fn of this.subs) fn({ type, ...extra }, this); }

    load(strategy, c, { stopAtMistake = false } = {}) {
      Object.assign(this, { strategy, c, stopAtMistake, state: this.puzzle.start(strategy, c),
        result: null, mistake: null, error: null, playing: false, acc: 0 });
      this.emit("load");
    }
    get finished() { return !!(this.result || this.mistake || this.error); }

    step(n = 1, input) {
      if (!this.state || this.finished) return 0;
      let done = 0;
      try {
        while (done < n && !this.finished) {
          this.puzzle.step(this.state, input);
          done++;
          this.result = this.puzzle.result(this.state);
          if (this.stopAtMistake && this.puzzle.mistake) this.mistake = this.puzzle.mistake(this.state);
        }
      } catch (e) { this.error = e; }
      if (this.finished) this.playing = false;
      this.emit("step", { count: done });
      return done;
    }

    // keep going after stopping at a mistake
    resume() { this.mistake = null; this.stopAtMistake = false; this.play(); }
    play() { if (!this.state || this.finished) return; this.playing = true; this.acc = 0; this.emit("play"); }
    pause() { this.playing = false; this.emit("pause"); }
    tick(ms) {
      if (!this.playing) return;
      this.acc += ms / 1000 * this.speed;
      const n = Math.floor(this.acc);
      if (n > 0) { this.acc -= n; this.step(Math.min(n, 5000)); }
    }
  }

  const RiddleLab = { ProgramError, runCase, checkAll, Runner };
  if (typeof module === "object" && module.exports) module.exports = RiddleLab;
  else root.RiddleLab = Object.assign(root.RiddleLab || {}, RiddleLab);
})(typeof self !== "undefined" ? self : globalThis);
