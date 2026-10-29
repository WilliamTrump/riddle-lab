"""The egg drop riddle: simulator and strategy tester.

The puzzle
----------
A 100-story building has one Fabergé egg on each floor. Somewhere there is a
critical floor: the highest floor an egg survives being dropped from (0 if even
floor 1 breaks it). A thief has two worthless replica eggs to test-drop. An egg
survives at or below the critical floor and breaks above it. What's the fewest
drops that always finds the critical floor?

A strategy is one function:

    next_drop(safe, broken, eggs) -> floor to drop from next

where safe is the highest floor an egg has survived (0 at first), broken is the
lowest floor an egg broke on (101 at first), and eggs is how many replicas are left.
The floor is found when broken == safe + 1.

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

Strategy = Callable[[int, int, int], int]


def one_floor_at_a_time(safe: int, broken: int, eggs: int) -> int:
    return safe + 1


def every_tenth_floor(safe: int, broken: int, eggs: int) -> int:
    if eggs == 2:
        return min(safe + 10, broken - 1)
    return safe + 1


def shrinking_gaps(safe: int, broken: int, eggs: int) -> int:
    """The solution (spoiler): 14, then 13 more, then 12 more... with the first egg."""
    if eggs == 1:
        return safe + 1
    floor, gap = 0, BEST
    while floor <= safe:
        floor, gap = floor + gap, gap - 1
    return min(floor, FLOORS)


STRATEGIES: dict[str, Strategy] = {
    "one": one_floor_at_a_time,
    "tens": every_tenth_floor,
    "shrinking": shrinking_gaps,
}


def play(crit: int, strategy: Strategy) -> tuple[bool, list[tuple[int, bool]]]:
    """Run one case. Returns (found, [(floor, broke), ...])."""
    safe, broken, eggs, drops = 0, FLOORS + 1, EGGS, []
    while broken - safe > 1 and eggs > 0:
        f = strategy(safe, broken, eggs)
        if not (isinstance(f, int) and not isinstance(f, bool) and 1 <= f <= FLOORS):
            raise ValueError(f"The egg has to be dropped from a floor from 1 to {FLOORS}, but next_drop chose {f!r}")
        if not safe < f < broken:
            raise ValueError(f"Floor {f} is already known to {'be safe' if f <= safe else 'break eggs'}")
        broke = f > crit
        if broke:
            broken, eggs = f, eggs - 1
        else:
            safe = f
        drops.append((f, broke))
    return broken - safe == 1, drops


def worst_case(strategy: Strategy) -> tuple[int, int, int]:
    """Try every critical floor 0-100. Returns (cases lost, worst drops, a worst floor)."""
    lost, worst, worst_crit = 0, 0, 0
    for crit in range(FLOORS + 1):
        found, drops = play(crit, strategy)
        lost += not found
        if len(drops) > worst:
            worst, worst_crit = len(drops), crit
    return lost, worst, worst_crit


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Test egg drop strategies.")
    parser.add_argument("--strategy", choices=STRATEGIES, help="strategy to test (default: all)")
    parser.add_argument("--show", type=int, metavar="FLOOR", help="print every drop when this is the critical floor")
    args = parser.parse_args(argv)
    names = [args.strategy] if args.strategy else list(STRATEGIES)
    for name in names:
        if args.show is not None:
            found, drops = play(args.show, STRATEGIES[name])
            steps = ", ".join(f"{f}{'✕' if broke else '✓'}" for f, broke in drops)
            print(f"{name:>9}: {steps}  ({'found' if found else 'not found'} in {len(drops)} drops)")
            continue
        lost, worst, crit = worst_case(STRATEGIES[name])
        verdict = f"both eggs broke too soon in {lost} cases" if lost else f"at most {worst} drops (e.g. critical floor {crit})"
        print(f"{name:>9}: {verdict}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
