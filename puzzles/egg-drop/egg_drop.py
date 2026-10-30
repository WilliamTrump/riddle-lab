"""The egg drop riddle: simulator and strategy tester.

The puzzle
----------
A 100-story building has one Fabergé egg on each floor. Somewhere there is a
critical floor: the highest floor an egg survives being dropped from (0 if even
floor 1 breaks it). A thief has two worthless replica eggs to test-drop. An egg
survives at or below the critical floor and breaks above it. What's the fewest
drops that always finds the critical floor?

A strategy is the whole search, written as one function:

    find_floor(drop) -> the highest safe floor (0-100)

where drop(floor) drops a replica egg from that floor (1-100) and returns True
if it broke. Once both eggs are broken, drop() raises an error.

Usage
-----
    python egg_drop.py                     # worst case for every strategy
    python egg_drop.py --strategy tens --show 98
"""

from __future__ import annotations

import argparse
import sys
from typing import Callable

FLOORS = 100
EGGS = 2
BEST = 14
MAX_DROPS = 200

Drop = Callable[[int], bool]
Strategy = Callable[[Drop], int]


class RuleError(Exception):
    """A drop the rules don't allow."""


def one_floor_at_a_time(drop: Drop) -> int:
    for floor in range(1, FLOORS + 1):
        if drop(floor):
            return floor - 1
    return FLOORS


def every_tenth_floor(drop: Drop) -> int:
    safe, floor = 0, 10
    while floor <= FLOORS and not drop(floor):  # first egg: every 10th floor
        safe, floor = floor, floor + 10
    for f in range(safe + 1, min(floor, FLOORS + 1)):  # second egg: floor by floor
        if drop(f):
            return f - 1
    return min(floor, FLOORS + 1) - 1


def shrinking_gaps(drop: Drop) -> int:
    """The solution (spoiler): 14, then 13 more, then 12 more... with the first egg."""
    safe, gap = 0, BEST
    while True:
        floor = min(safe + gap, FLOORS)
        if drop(floor):
            break
        safe = floor
        if safe == FLOORS:
            return FLOORS
        gap -= 1
    for f in range(safe + 1, floor):
        if drop(f):
            return f - 1
    return floor - 1


STRATEGIES: dict[str, Strategy] = {
    "one": one_floor_at_a_time,
    "tens": every_tenth_floor,
    "shrinking": shrinking_gaps,
}


def play(crit: int, strategy: Strategy) -> tuple[int, list[tuple[int, bool]]]:
    """Run one case. Returns (the floor find_floor answered, [(floor, broke), ...])."""
    drops: list[tuple[int, bool]] = []

    def drop(floor: int) -> bool:
        if sum(broke for _, broke in drops) == EGGS:
            raise RuleError("Both replica eggs are already broken.")
        if isinstance(floor, bool) or not isinstance(floor, int) or not 1 <= floor <= FLOORS:
            raise RuleError(f"drop() needs a floor from 1 to {FLOORS}, but got {floor!r}.")
        if len(drops) >= MAX_DROPS:
            raise RuleError(f"More than {MAX_DROPS} drops.")
        drops.append((floor, floor > crit))
        return floor > crit

    answer = strategy(drop)
    if isinstance(answer, bool) or not isinstance(answer, int) or not 0 <= answer <= FLOORS:
        raise RuleError(f"find_floor has to return a floor from 0 to {FLOORS}, but returned {answer!r}.")
    return answer, drops


def worst_case(strategy: Strategy) -> tuple[int, int, int]:
    """Try every critical floor 0-100. Returns (wrong answers, worst drops, a worst floor)."""
    wrong, worst, worst_crit = 0, 0, 0
    for crit in range(FLOORS + 1):
        answer, drops = play(crit, strategy)
        wrong += answer != crit
        if len(drops) > worst:
            worst, worst_crit = len(drops), crit
    return wrong, worst, worst_crit


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Test egg drop strategies.")
    parser.add_argument("--strategy", choices=STRATEGIES, help="strategy to test (default: all)")
    parser.add_argument("--show", type=int, metavar="FLOOR", help="print every drop when this is the critical floor")
    args = parser.parse_args(argv)
    names = [args.strategy] if args.strategy else list(STRATEGIES)
    for name in names:
        if args.show is not None:
            answer, drops = play(args.show, STRATEGIES[name])
            steps = ", ".join(f"{f}{'✕' if broke else '✓'}" for f, broke in drops)
            verdict = "right" if answer == args.show else "wrong"
            print(f"{name:>9}: {steps}  (said {answer}, {verdict}, after {len(drops)} drops)")
            continue
        wrong, worst, crit = worst_case(STRATEGIES[name])
        verdict = f"wrong in {wrong} cases" if wrong else f"at most {worst} drops (e.g. critical floor {crit})"
        print(f"{name:>9}: {verdict}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
