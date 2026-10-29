// Riddle Lab shared shell: the click-to-play video and the hint ladder.
// Puzzle pages listen for "shell:load-solution" to put the answer into their sandbox.
(() => {
  "use strict";

  // Video: show a poster first, and only load YouTube once someone presses play.
  document.querySelectorAll("[data-video]").forEach(box => {
    const id = box.dataset.video, title = box.dataset.videoTitle || "Puzzle video";
    const frame = box.querySelector(".video-frame");
    frame.innerHTML = `<button class="video-poster" type="button" aria-label="Play: ${title}">
        <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="">
        <span class="play"><svg viewBox="0 0 16 16"><path d="M4 2.5v11l9-5.5z"/></svg></span>
      </button>`;
    frame.querySelector("button").addEventListener("click", () => {
      frame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0"
        title="${title}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
    });
    if (location.protocol === "file:") {
      const note = box.querySelector(".video-note");
      if (note) note.innerHTML += ` YouTube won't play videos on pages opened as a file. Run the local server from the README, or <a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">watch it on YouTube</a>.`;
    }
  });

  // Hint ladder: each rung unlocks the next; the solution asks once before opening.
  document.querySelectorAll(".ladder").forEach(ladder => {
    const rungs = [...ladder.querySelectorAll(".rung")];
    const sync = () => rungs.forEach((r, i) => {
      r.querySelector(".rung-btn").disabled = i > 0 && !rungs[i - 1].classList.contains("open");
    });
    rungs.forEach(r => {
      const btn = r.querySelector(".rung-btn"), body = r.querySelector(".rung-body"), text = btn.querySelector(".t");
      btn.setAttribute("aria-expanded", "false");
      btn.addEventListener("click", () => {
        if (r.classList.contains("open")) return;
        if (r.classList.contains("solution") && !r.dataset.armed) {
          r.dataset.armed = "1";
          text.textContent = "Sure? Click again to show the answer";
          return;
        }
        r.classList.add("open");
        body.hidden = false;
        btn.setAttribute("aria-expanded", "true");
        if (r.classList.contains("solution")) text.textContent = "Solution";
        sync();
      });
    });
    sync();
  });

  document.querySelectorAll("[data-load-solution]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.dispatchEvent(new CustomEvent("shell:load-solution"));
      const target = document.querySelector("[data-sandbox]");
      if (target) target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    });
  });
})();

// Checker panel: test every case, chart the results, replay the failing one.
//   RiddleLab.mountChecker(el, { buttonLabel, intro, run, onBar, onReplay })
//   run() returns a puzzle's judge() verdict (or a promise of one), or null on error.
//   A verdict may also set limit (a dashed target line) and bar.tick (label only those bars).
(() => {
  "use strict";
  const RL = (window.RiddleLab = window.RiddleLab || {});

  RL.mountChecker = (el, opts) => {
    el.innerHTML = `
      <div class="panel-head"><span class="label">Does it always work?</span><button class="btn" type="button" data-run></button></div>
      <div class="panel-body">
        <p class="hint" data-intro>${opts.intro}</p>
        <div class="chart" hidden><svg role="img" aria-label="Results for every case"></svg><div class="tip" hidden></div></div>
        <p class="summary" hidden></p>
        <div data-replay-row hidden><button class="btn primary" type="button" data-replay>Show me where it fails</button></div>
      </div>`;
    const q = s => el.querySelector(s);
    const btn = q("[data-run]"), chart = q(".chart"), svg = q("svg"), tip = q(".tip"), summary = q(".summary");
    let verdict = null;

    const setLabel = () => { btn.textContent = typeof opts.buttonLabel === "function" ? opts.buttonLabel() : opts.buttonLabel; };

    function clear() {
      verdict = null;
      chart.hidden = summary.hidden = q("[data-replay-row]").hidden = true;
      q("[data-intro]").hidden = false;
      setLabel();
    }

    function draw() {
      if (!verdict) return;
      const bars = verdict.bars;
      const w = Math.max(240, svg.getBoundingClientRect().width), h = 140;
      const m = { l: 44, r: 4, t: 14, b: 22 }, iw = w - m.l - m.r, ih = h - m.t - m.b, base = m.t + ih;
      const max = Math.max(1, verdict.limit || 0, ...bars.map(b => b.value || 0));
      const mag = 10 ** Math.floor(Math.log10(max));
      const top = [1, 2, 2.5, 5, 10].map(s => s * mag).find(v => v >= max);
      const y = v => base - (v / top) * ih;
      const slot = iw / bars.length, bw = Math.max(2, slot - 2);
      const every = bars.length <= 13 ? 1 : 10, ticked = bars.some(b => b.tick);
      let s = "";
      [0, top / 2, top].forEach(v => {
        s += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)"/>`;
        s += `<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v.toLocaleString()}</text>`;
      });
      bars.forEach((b, i) => {
        const x = m.l + i * slot + 1, cx = x + bw / 2;
        if (b.value) {
          const bh = Math.max(2, base - y(b.value)), r = Math.min(4, bw / 2, bh);
          s += `<path d="M${x},${base} V${base - bh + r} Q${x},${base - bh} ${x + r},${base - bh} H${x + bw - r} Q${x + bw},${base - bh} ${x + bw},${base - bh + r} V${base} Z" fill="var(${b.fail ? "--bad" : "--bars"})"/>`;
        }
        if (b.fail) s += `<text x="${cx}" y="${b.value ? y(b.value) - 4 : base - 4}" text-anchor="middle" style="fill:var(--bad);font-weight:600">✕</text>`;
        if (ticked ? b.tick : every === 1 || i === 0 || (i + 1) % every === 0) s += `<text x="${cx}" y="${h - 6}" text-anchor="middle">${b.label}</text>`;
        s += `<rect x="${m.l + i * slot}" y="${m.t}" width="${slot}" height="${ih}" fill="transparent" data-i="${i}" style="cursor:${b.c !== undefined ? "pointer" : "default"}"/>`;
      });
      s += `<line x1="${m.l}" x2="${w - m.r}" y1="${base}" y2="${base}" stroke="var(--rule-strong)"/>`;
      if (verdict.limit) {
        s += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(verdict.limit)}" y2="${y(verdict.limit)}" stroke="var(--good)" stroke-width="1.5" stroke-dasharray="5 4" pointer-events="none"/>`;
        s += `<text x="${m.l + 4}" y="${y(verdict.limit) - 5}" pointer-events="none" style="fill:var(--good);font-weight:600">best: ${verdict.limit}</text>`;
      }
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      svg.innerHTML = s;
    }

    btn.addEventListener("click", async () => {
      btn.disabled = true; btn.textContent = "Testing…";
      try { verdict = await opts.run(); } catch (e) { verdict = null; }
      btn.disabled = false; setLabel();
      if (!verdict) return;
      chart.hidden = summary.hidden = false;
      q("[data-intro]").hidden = true;
      summary.className = `summary ${verdict.ok ? "good" : "bad"}`;
      summary.innerHTML = `<span>${verdict.ok ? "✓" : "✕"} ${verdict.headline}</span>${verdict.detail ? `<span>${verdict.detail}</span>` : ""}`;
      q("[data-replay-row]").hidden = verdict.ok || verdict.failing === undefined || verdict.failing === null;
      draw();
    });
    q("[data-replay]").addEventListener("click", () => verdict && opts.onReplay(verdict.failing));

    const bar = e => verdict && e.target.dataset && e.target.dataset.i !== undefined ? verdict.bars[+e.target.dataset.i] : null;
    svg.addEventListener("mousemove", e => {
      const b = bar(e);
      if (!b) { tip.hidden = true; return; }
      const r = chart.getBoundingClientRect();
      tip.hidden = false; tip.textContent = b.tip;
      tip.style.left = `${Math.max(90, Math.min(r.width - 90, e.clientX - r.left))}px`;
      tip.style.top = `${e.clientY - r.top - 10}px`;
    });
    svg.addEventListener("mouseleave", () => { tip.hidden = true; });
    svg.addEventListener("click", e => { const b = bar(e); if (b && b.c !== undefined) opts.onBar(b.c, b); });
    new ResizeObserver(draw).observe(chart);

    clear();
    return { clear, setLabel };
  };
})();
