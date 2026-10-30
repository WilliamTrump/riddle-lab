// Riddle Lab strategy lab: shared pieces for puzzles where you code a strategy
// in Python or Java.
//
//   RiddleLab.python.run({ source, harness, required, payload })  -> result
//       Runs the player's Python in a Pyodide worker. `harness` is Python that
//       defines __run_all(payload_json) -> json string, calling the player's
//       functions on every case in one go. Rejects with { message, line }.
//   RiddleLab.runJava(puzzle, source, cases)  -> result
//       Sends Java to server.py (/api/<puzzle>/java), which compiles and runs it.
//   RiddleLab.codeEditor(textarea, { lang, onChange })
//       CodeMirror with Python/Java modes, or the plain textarea if it didn't load.
(() => {
  "use strict";
  const RL = (window.RiddleLab = window.RiddleLab || {});

  // ---------- Python (Pyodide in a worker, so a stuck strategy can be stopped) ----------
  const CDN = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
  const WORKER = `importScripts("${CDN}pyodide.js");
const ready = loadPyodide({ indexURL: "${CDN}" });
ready.then(() => postMessage({ ready: true }), e => postMessage({ fatal: String(e) }));
onmessage = async ({ data }) => {
  try {
    const py = await ready;
    const ns = py.globals.get("dict")();
    py.runPython(data.source, { globals: ns });
    for (const name of data.required) {
      if (!ns.has(name)) throw new Error("Write a function: def " + name + "(...):");
    }
    py.runPython(data.harness, { globals: ns });
    postMessage({ id: data.id, result: JSON.parse(ns.get("__run_all")(data.payload)) });
  } catch (e) {
    const text = String(e.message || e).trim();
    // the last frame in the player's code (not the harness) gives the line
    const frames = [...text.matchAll(/File "<exec>", line (\\d+)(?:, in (\\S+))?/g)];
    const last = frames[frames.length - 1];
    const line = last && last[2] !== "__run_all" ? +last[1] : 0;
    postMessage({ id: data.id, error: text.split("\\n").pop(), line });
  }
};`;
  const TIMEOUT_MS = 10000;

  RL.python = (() => {
    let worker = null, ready = null, loaded = false, nextId = 0;
    function start() {
      worker = new Worker(URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" })));
      const failed = { message: "Python couldn't load. Check your internet connection." };
      ready = new Promise((res, rej) => {
        worker.addEventListener("message", function once(e) {
          if (e.data.ready) { worker.removeEventListener("message", once); loaded = true; res(); }
          else if (e.data.fatal) rej(failed);
        });
        worker.addEventListener("error", () => rej(failed));
      });
      ready.catch(() => { worker = null; });
    }
    return {
      warm() { if (!worker) start(); },
      get loaded() { return loaded; },
      async run({ source, harness, required, payload }) {
        if (!worker) start();
        await ready;
        const id = ++nextId;
        return new Promise((res, rej) => {
          const timer = setTimeout(() => {
            worker.terminate(); worker = null; loaded = false;
            rej({ message: `Took longer than ${TIMEOUT_MS / 1000} seconds. Is there an endless loop?` });
          }, TIMEOUT_MS);
          worker.addEventListener("message", function on(e) {
            if (e.data.id !== id) return;
            worker.removeEventListener("message", on); clearTimeout(timer);
            e.data.error ? rej({ message: e.data.error, line: e.data.line }) : res(e.data.result);
          });
          worker.postMessage({ id, source, harness, required, payload: JSON.stringify(payload) });
        });
      },
    };
  })();

  // ---------- Java (compiled and run by server.py with your own javac) ----------
  RL.runJava = async (puzzle, source, cases) => {
    const needServer = { message: "Java needs the local server. Run: python3 server.py" };
    let res;
    try {
      res = await fetch(`/api/${puzzle}/java`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, cases }),
      });
    } catch { throw needServer; }
    // static hosts (GitHub Pages, http.server) answer 404, 405 or 501 to a POST
    if ([404, 405, 501].includes(res.status)) throw needServer;
    if (!res.ok) throw { message: `The server said ${res.status}.` };
    const data = await res.json();
    if (data.error) throw { message: data.error, line: data.line };
    return data.result;
  };

  // ---------- Code editor ----------
  const MODES = { python: { name: "python", version: 3 }, java: "text/x-java" };
  RL.codeEditor = (textarea, { lang = "python", onChange = () => {} } = {}) => {
    const cm = window.CodeMirror ? CodeMirror.fromTextArea(textarea, {
      theme: "riddle", mode: MODES[lang], lineNumbers: true, indentUnit: 4, tabSize: 4,
      matchBrackets: true, autoCloseBrackets: true, electricChars: true,
      extraKeys: {
        Tab: c => c.somethingSelected() ? c.indentSelection("add") : c.replaceSelection(" ".repeat(c.getOption("indentUnit")), "end"),
        "Shift-Tab": c => c.indentSelection("subtract"),
      },
    }) : null;
    if (cm) cm.on("change", () => onChange());
    else {
      textarea.addEventListener("input", () => onChange());
      textarea.addEventListener("keydown", e => {
        if (e.key === "Tab" && !e.shiftKey) {
          e.preventDefault();
          textarea.setRangeText("    ", textarea.selectionStart, textarea.selectionEnd, "end");
          onChange();
        }
      });
    }
    let errMark = null;
    return {
      get: () => (cm ? cm.getValue() : textarea.value),
      set(v) {
        if (cm) { cm.setValue(v); cm.clearHistory(); }   // setValue fires "change"
        else { textarea.value = v; onChange(); }
      },
      setLang(l) { if (cm) cm.setOption("mode", MODES[l]); },
      markError(line) {
        if (!cm) return;
        if (errMark) { cm.removeLineClass(errMark, "background", "cm-error-line"); errMark = null; }
        if (line > 0 && line <= cm.lineCount()) errMark = cm.addLineClass(line - 1, "background", "cm-error-line");
      },
      refresh() { if (cm) cm.refresh(); },   // call after the editor is unhidden
    };
  };
})();
