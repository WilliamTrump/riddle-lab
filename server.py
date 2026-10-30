"""Riddle Lab local server: serves the site and runs Java strategies.

    python3 server.py              # http://127.0.0.1:8137
    PORT=9000 python3 server.py

Java strategies are compiled with your own javac, so this is for running on
your machine. Only pages served by this server can ask it to run code.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(os.environ.get("PORT", 8137))
ROOT = Path(__file__).resolve().parent
BUILD = Path(tempfile.gettempdir()) / "riddle-lab-java"
HOSTS = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}
ORIGINS = {f"http://{h}" for h in HOSTS}
MAX_BODY = 300_000
RUN_SECONDS = 10
MAX_OUTPUT_BLOCKS = 4096   # 2 MB of output (ulimit counts 512-byte blocks)
KEEP_BUILDS = 30
RUNS_AT_ONCE = threading.BoundedSemaphore(2)


def hats_ok(cases) -> bool:
    return (
        isinstance(cases, list) and 0 < len(cases) <= 4096
        and all(isinstance(l, list) and 0 < len(l) <= 12 and all(h in ("black", "white") for h in l) for l in cases)
    )


def hats_read(stdout: str, cases) -> list:
    answers = [l.split("\t") for l in stdout.splitlines()]
    if len(answers) != len(cases) or any(len(a) != len(l) for a, l in zip(answers, cases)):
        raise JavaError("The program stopped before every prisoner answered.")
    return answers


def eggdrop_ok(cases) -> bool:
    return (
        isinstance(cases, list) and 0 < len(cases) <= 512
        and all(isinstance(c, int) and not isinstance(c, bool) and 0 <= c <= 100 for c in cases)
    )


def eggdrop_read(stdout: str, cases) -> list:
    """One transcript per floor: {"drops": [...], "answer": n} or {"drops": [...], "error": text, "line": n}."""
    rows = []
    try:
        for line in stdout.splitlines():
            drops, end = line.split("\t", 1)
            row = {"drops": [int(f) for f in drops.split(",") if f]}
            if end.startswith("!"):
                at, message = end[1:].split("\t", 1)
                row.update(error=message, line=int(at))
            else:
                row["answer"] = int(end)
            rows.append(row)
    except ValueError:
        raise JavaError("The program printed something the page couldn't read.")
    if len(rows) != len(cases):
        raise JavaError("The program stopped before every floor was tried.")
    return rows


# Each puzzle: its harness (Main.java), how to check the cases, how to write them
# to the harness, how to read its answers, and the method the player must write.
PUZZLES = {
    "hats": {
        "harness": ROOT / "puzzles" / "prisoner-hats" / "java" / "Main.java",
        "ok": hats_ok,
        "write": lambda cases: "".join("\t".join(l) + "\n" for l in cases),
        "read": hats_read,
        "signature": "static String guess(List<String> seen, List<String> heard)",
    },
    "eggdrop": {
        "harness": ROOT / "puzzles" / "egg-drop" / "java" / "Main.java",
        "ok": eggdrop_ok,
        "write": lambda cases: "".join(f"{c}\n" for c in cases),
        "read": eggdrop_read,
        "signature": "static int findFloor(Building building)",
    },
}


class JavaError(Exception):
    def __init__(self, message: str, line: int = 0):
        super().__init__(message)
        self.line = line


def run_limited(cmd: list[str], cwd: Path, timeout: int, stdin: str = "") -> tuple[int, str, str]:
    """Run cmd with a time limit and an output cap. Everything it starts is killed afterwards."""
    with tempfile.TemporaryDirectory() as tmp:
        out_path, err_path = Path(tmp) / "out", Path(tmp) / "err"
        with open(out_path, "w") as out, open(err_path, "w") as err:
            # ulimit -f caps how much the program can write, so it can't fill the disk or our memory
            proc = subprocess.Popen(
                ["/bin/sh", "-c", f'ulimit -f {MAX_OUTPUT_BLOCKS}; exec "$@"', "sh", *cmd],
                cwd=cwd, stdin=subprocess.PIPE, stdout=out, stderr=err, text=True,
                start_new_session=True,  # its own process group, so we can kill children too
            )
            try:
                proc.communicate(stdin, timeout=timeout)
            except subprocess.TimeoutExpired:
                raise JavaError(f"Took longer than {timeout} seconds. Is there an endless loop?")
            finally:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except (ProcessLookupError, PermissionError):
                    pass
                proc.wait()
        if proc.returncode == -signal.SIGXFSZ or proc.returncode == 128 + signal.SIGXFSZ:
            raise JavaError("Printed too much output.")
        return proc.returncode, out_path.read_text(errors="replace"), err_path.read_text(errors="replace")


def prune_builds() -> None:
    """Keep only the most recent builds so the temp folder doesn't grow forever."""
    builds = sorted((d for d in BUILD.iterdir() if d.is_dir()), key=lambda d: d.stat().st_mtime, reverse=True)
    for old in builds[KEEP_BUILDS:]:
        shutil.rmtree(old, ignore_errors=True)


def compile_java(puzzle: dict, source: str) -> Path:
    """Compile the strategy with the harness, reusing earlier builds of the same source."""
    harness = puzzle["harness"].read_text()
    key = hashlib.sha256((source + harness).encode()).hexdigest()[:16]
    out = BUILD / key / "out"
    if (out / "Main.class").exists():
        os.utime(BUILD / key)  # mark as recently used
        return out
    src = BUILD / key / "src"
    src.mkdir(parents=True, exist_ok=True)
    (src / "Strategy.java").write_text(source)
    (src / "Main.java").write_text(harness)
    code, _, stderr = run_limited(["javac", "-nowarn", "-d", str(out), "Strategy.java", "Main.java"], src, timeout=60)
    if code != 0:
        shutil.rmtree(out, ignore_errors=True)
        raise compile_error(stderr, puzzle["signature"])
    prune_builds()
    return out


def compile_error(stderr: str, signature: str) -> JavaError:
    m = re.search(r"^(Strategy|Main)\.java:(\d+): error: (.+)$", stderr, re.M)
    if not m:
        return JavaError(stderr.strip().splitlines()[0] if stderr.strip() else "javac failed.")
    if m.group(1) == "Main":
        # the harness couldn't call the strategy, so the method signature is wrong
        return JavaError(f"Write {signature} in class Strategy.")
    return JavaError(m.group(3), int(m.group(2)))


def run_java(puzzle: dict, source: str, cases: list) -> list:
    out = compile_java(puzzle, source)
    code, stdout, stderr = run_limited(["java", "-Xmx256m", "-cp", str(out), "Main"], out, RUN_SECONDS, puzzle["write"](cases))
    if code != 0:
        first = next((l for l in stderr.splitlines() if l.startswith("Exception")), stderr.strip() or "The program stopped early.")
        line = re.search(r"Strategy\.java:(\d+)", stderr)
        raise JavaError(first.replace('Exception in thread "main" ', ""), int(line.group(1)) if line else 0)
    return puzzle["read"](stdout, cases)  # e.g. after System.exit() part way through, this raises


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self):
        m = re.fullmatch(r"/api/([a-z]+)/java", self.path)
        puzzle = PUZZLES.get(m.group(1)) if m else None
        if not puzzle:
            return self.send_error(404)
        # Only pages from this server may run code: right host, right origin, JSON only
        # (the JSON content type also makes other sites' browsers ask first, and we never say yes).
        if self.headers.get("Host") not in HOSTS:
            return self.send_error(403)
        origin = self.headers.get("Origin")
        if origin and origin not in ORIGINS:
            return self.send_error(403)
        if not self.headers.get("Content-Type", "").startswith("application/json"):
            return self.send_error(415)
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            return self.send_error(413)
        try:
            body = json.loads(self.rfile.read(length))
            source, cases = body["source"], body["cases"]
            if not isinstance(source, str) or not puzzle["ok"](cases):
                raise ValueError
        except (KeyError, ValueError, TypeError):
            return self.send_error(400)
        if not RUNS_AT_ONCE.acquire(timeout=20):
            result = {"error": "The server is busy. Try again in a moment."}
            return self.reply(result)
        try:
            result = {"result": run_java(puzzle, source, cases)}
        except JavaError as e:
            result = {"error": str(e), "line": e.line}
        except FileNotFoundError:
            result = {"error": "Java isn't installed on this computer (javac not found)."}
        finally:
            RUNS_AT_ONCE.release()
        self.reply(result)

    def reply(self, result: dict) -> None:
        data = json.dumps(result).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    print(f"Riddle Lab: http://127.0.0.1:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
