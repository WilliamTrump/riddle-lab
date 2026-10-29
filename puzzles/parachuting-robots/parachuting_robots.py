"""Parachuting robots: interpreter, simulator and command-line runner.

The puzzle
----------
Two robots are dropped from a plane onto an infinite line of discrete cells.
Each lands on a different cell and leaves its parachute there. Both robots
run the *same* program, in lockstep, and cannot see or talk to each other.
Write a program that guarantees they meet.

Instructions (each one takes exactly one cycle)
-----------------------------------------------
    left            move one cell to the left
    right           move one cell to the right
    skipNext        if a parachute lies on this cell, skip the next instruction
    goto <label>    jump to <label>

Labels are written as ``name:`` on their own line (or before an instruction).
Comments start with ``#`` or ``//``. A robot that runs past the last
instruction stops and waits.

The robots meet when they stand on the same cell after a cycle, or when they
swap cells during a cycle (they would collide halfway).

Usage
-----
    python parachuting_robots.py examples/solution.robot             # animate, gap 6
    python parachuting_robots.py examples/solution.robot --gap 10 --no-animate
    python parachuting_robots.py examples/solution.robot --check 50  # test gaps 1..50
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from dataclasses import dataclass, field

INSTRUCTIONS = ("left", "right", "skipNext", "goto")

EXAMPLE_PROGRAM = """\
# Crawl left slowly until we find a parachute,
# then sprint left to catch the other robot.
crawl:
  left
  skipNext
  goto crawl
sprint:
  left
  goto sprint
"""


class ProgramError(ValueError):
    """Raised when a program cannot be parsed."""

    def __init__(self, line: int, message: str):
        super().__init__(f"line {line}: {message}")
        self.line = line


@dataclass(frozen=True)
class Instruction:
    op: str
    arg: str | None = None
    line: int = 0  # 1-based source line, for highlighting and errors

    def __str__(self) -> str:
        return f"{self.op} {self.arg}" if self.arg else self.op


@dataclass
class Program:
    instructions: list[Instruction]
    labels: dict[str, int]

    def __len__(self) -> int:
        return len(self.instructions)


_LABEL = re.compile(r"^([A-Za-z_][\w-]*)\s*:\s*(.*)$")
_OPS = {op.lower(): op for op in INSTRUCTIONS}


def parse(source: str) -> Program:
    """Parse program text into a Program, resolving labels."""
    instructions: list[Instruction] = []
    labels: dict[str, int] = {}

    for lineno, raw in enumerate(source.splitlines(), start=1):
        text = re.split(r"#|//", raw, maxsplit=1)[0].strip()
        while (m := _LABEL.match(text)):
            name, text = m.group(1), m.group(2).strip()
            if name in labels:
                raise ProgramError(lineno, f"label '{name}' is defined twice")
            labels[name] = len(instructions)
        if not text:
            continue

        parts = text.split()
        op = _OPS.get(parts[0].lower())
        if op is None:
            raise ProgramError(lineno, f"unknown instruction '{parts[0]}'")
        if op == "goto":
            if len(parts) != 2:
                raise ProgramError(lineno, "goto needs exactly one label")
            instructions.append(Instruction(op, parts[1], lineno))
        else:
            if len(parts) != 1:
                raise ProgramError(lineno, f"{op} takes no arguments")
            instructions.append(Instruction(op, None, lineno))

    for ins in instructions:
        if ins.op == "goto" and ins.arg not in labels:
            raise ProgramError(ins.line, f"unknown label '{ins.arg}'")
    return Program(instructions, labels)


@dataclass
class Robot:
    name: str
    position: int
    pc: int = 0

    def halted(self, program: Program) -> bool:
        return self.pc >= len(program)


@dataclass
class Simulation:
    program: Program
    robots: list[Robot]
    parachutes: set[int] = field(default_factory=set)
    cycle: int = 0
    met: bool = False
    never: bool = False  # proven they can never meet (see _never_meets)
    _trail: list[tuple[int, int]] = field(default_factory=list)
    _seen: dict[tuple[int, int], int] = field(default_factory=dict)

    @classmethod
    def start(cls, program: Program, a: int = 0, b: int = 6) -> "Simulation":
        if a == b:
            raise ValueError("robots must land on different cells")
        return cls(program, [Robot("A", a), Robot("B", b)], {a, b})

    def step(self) -> None:
        """Advance both robots by one instruction."""
        if self.met:
            return
        before = [r.position for r in self.robots]
        if not self._trail:  # where the search for a repeat starts
            self._seen[tuple(r.pc for r in self.robots)] = 0
            self._trail.append(tuple(before))
        for robot in self.robots:
            self._execute(robot)
        self.cycle += 1
        after = [r.position for r in self.robots]
        same_cell = after[0] == after[1]
        swapped = after[0] == before[1] and after[1] == before[0]
        self.met = same_cell or swapped
        if not self.met:
            self.never = self._never_meets()

    def _never_meets(self) -> bool:
        """A robot's next move depends only on its own instruction and whether it
        stands on a parachute. So if both robots are back on the instructions they had
        at an earlier cycle, and each one is either in the same cell or has moved past
        the parachutes and kept clear of them since, everything in between repeats
        forever, shifted. If that shift doesn't bring them closer, they never meet."""
        a, b = self.robots
        self._trail.append((a.position, b.position))
        now, key = len(self._trail) - 1, (a.pc, b.pc)
        prev = self._seen.get(key)
        self._seen[key] = now
        if prev is None:
            return False
        lo, hi = min(self.parachutes), max(self.parachutes)
        shift = [self._trail[now][i] - self._trail[prev][i] for i in range(2)]
        for i in range(2):
            if shift[i] and any((t[i] <= hi if shift[i] > 0 else t[i] >= lo) for t in self._trail[prev:now + 1]):
                return False
        return (b.position - a.position) * (shift[1] - shift[0]) >= 0

    def _execute(self, robot: Robot) -> None:
        if robot.halted(self.program):
            return
        ins = self.program.instructions[robot.pc]
        robot.pc += 1
        if ins.op == "left":
            robot.position -= 1
        elif ins.op == "right":
            robot.position += 1
        elif ins.op == "skipNext":
            if robot.position in self.parachutes:
                robot.pc += 1
        elif ins.op == "goto":
            robot.pc = self.program.labels[ins.arg]

    def all_halted(self) -> bool:
        return all(r.halted(self.program) for r in self.robots)

    def run(self, max_cycles: int = 10_000) -> bool:
        """Run until the robots meet, both halt, they provably never meet, or max_cycles pass."""
        while not self.met and not self.never and not self.all_halted() and self.cycle < max_cycles:
            self.step()
        return self.met


def check(program: Program, max_gap: int = 50, max_cycles: int = 100_000) -> dict[int, int | None]:
    """Try every starting gap from 1 to max_gap.

    Returns {gap: cycles needed to meet, or None if they never met}. Robot A
    always starts on the left; the mirrored case is the same with names swapped.
    """
    results: dict[int, int | None] = {}
    for gap in range(1, max_gap + 1):
        sim = Simulation.start(program, 0, gap)
        results[gap] = sim.cycle if sim.run(max_cycles) else None
    return results


def render(sim: Simulation, width: int = 61) -> str:
    """Draw the line as text, centred between the robots."""
    a, b = (r.position for r in sim.robots)
    lo = (a + b) // 2 - width // 2
    cells = []
    for x in range(lo, lo + width):
        here = [r.name for r in sim.robots if r.position == x]
        if len(here) == 2:
            cells.append("*")
        elif here:
            cells.append(here[0])
        elif x in sim.parachutes:
            cells.append("^")
        else:
            cells.append(".")
    pcs = "  ".join(f"{r.name}@{r.position:+d} pc={r.pc}" for r in sim.robots)
    return f"{''.join(cells)}   cycle {sim.cycle:>5}  {pcs}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run a parachuting robots program.")
    parser.add_argument("file", nargs="?", help="program file (defaults to the built-in example)")
    parser.add_argument("--gap", type=int, default=6, help="cells between the landing spots")
    parser.add_argument("--max-cycles", type=int, default=10_000)
    parser.add_argument("--delay", type=float, default=0.05, help="seconds per frame when animating")
    parser.add_argument("--no-animate", action="store_true", help="print only the result")
    parser.add_argument("--check", type=int, metavar="N", help="test every gap from 1 to N")
    args = parser.parse_args(argv)

    if args.file:
        with open(args.file) as fh:
            source = fh.read()
    else:
        source = EXAMPLE_PROGRAM
    try:
        program = parse(source)
    except ProgramError as err:
        print(f"error: {err}", file=sys.stderr)
        return 2

    if args.check:
        results = check(program, args.check, args.max_cycles)
        failed = [g for g, c in results.items() if c is None]
        for gap, cycles in results.items():
            print(f"gap {gap:>4}: " + (f"met after {cycles} cycles" if cycles is not None else "never met"))
        if failed:
            print(f"\nFAILED for {len(failed)} of {len(results)} gaps")
            return 1
        print(f"\nSolved every gap from 1 to {args.check}. Worst case: {max(results.values())} cycles.")
        return 0

    sim = Simulation.start(program, 0, args.gap)
    while not sim.met and not sim.never and not sim.all_halted() and sim.cycle < args.max_cycles:
        if not args.no_animate:
            print("\r" + render(sim), end="", flush=True)
            time.sleep(args.delay)
        sim.step()
    if not args.no_animate:
        print("\r" + render(sim))
    if sim.met:
        print(f"The robots met after {sim.cycle} cycles.")
        return 0
    reason = (
        "both robots stopped" if sim.all_halted()
        else "they repeat the same pattern forever without getting closer" if sim.never
        else f"no meeting within {args.max_cycles} cycles"
    )
    print(f"The robots did not meet: {reason}.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
