"""Prisoner hat riddle: simulator and strategy tester.

The puzzle
----------
Ten prisoners stand in a line, all facing the front. Each wears a black or
white hat. Nobody sees their own hat or anything behind them. Starting at the
back, each prisoner says "black" or "white" out loud. Everyone hears every
answer, but nobody learns whether it was right. Prisoners who name their own
hat color go free. What plan saves the most prisoners in the worst case?

A strategy is a function ``guess(seen, heard) -> "black" | "white"``:

    seen   hats in front of you, nearest first
    heard  what everyone behind you said, in order

The same function runs for every prisoner, from the back of the line forwards.

Usage
-----
    python prisoner_hats.py                          # all strategies, 10 prisoners
    python prisoner_hats.py --strategy pairs -n 8    # one strategy, 8 prisoners
    python prisoner_hats.py --show 3                 # also print 3 random lineups
"""

from __future__ import annotations

import argparse
import random
import sys
from collections import Counter
from itertools import product
from typing import Callable, Sequence

BLACK, WHITE = "black", "white"
Strategy = Callable[[Sequence[str], Sequence[str]], str]


def everyone_black(seen: Sequence[str], heard: Sequence[str]) -> str:
    """Saves exactly the prisoners who happen to wear black."""
    return BLACK


def pass_it_on(seen: Sequence[str], heard: Sequence[str]) -> str:
    """Work in pairs: one names the hat in front of them, the next repeats it."""
    me = len(heard)
    if me % 2 == 0:
        return seen[0] if seen else BLACK
    return heard[me - 1]


def parity(seen: Sequence[str], heard: Sequence[str]) -> str:
    """The solution (spoiler): announce whether the black hats are odd or even."""
    black_seen = sum(h == BLACK for h in seen)
    if not heard:
        return BLACK if black_seen % 2 else WHITE
    odd = heard[0] == BLACK
    for h in heard[1:]:
        if h == BLACK:
            odd = not odd
    return BLACK if (odd + black_seen) % 2 else WHITE


STRATEGIES: dict[str, Strategy] = {
    "black": everyone_black,
    "pairs": pass_it_on,
    "parity": parity,
}


def play(lineup: Sequence[str], strategy: Strategy) -> list[str]:
    """Run a strategy down the line. lineup[0] is the back of the line."""
    heard: list[str] = []
    for i in range(len(lineup)):
        g = strategy(tuple(lineup[i + 1:]), tuple(heard))
        if g not in (BLACK, WHITE):
            raise ValueError(f"prisoner {len(lineup) - i} said {g!r}; return 'black' or 'white'")
        heard.append(g)
    return heard


def saved(lineup: Sequence[str], guesses: Sequence[str]) -> int:
    return sum(h == g for h, g in zip(lineup, guesses))


def try_every_lineup(strategy: Strategy, n: int = 10) -> Counter[int]:
    """Try every one of the 2**n lineups. Returns {prisoners saved: lineups}."""
    results: Counter[int] = Counter()
    for lineup in product((BLACK, WHITE), repeat=n):
        results[saved(lineup, play(lineup, strategy))] += 1
    return results


def render(lineup: Sequence[str], guesses: Sequence[str]) -> str:
    """One lineup as text: hats on the first row, results on the second."""
    hats = " ".join("B" if h == BLACK else "W" for h in lineup)
    marks = " ".join("✓" if h == g else "✕" for h, g in zip(lineup, guesses))
    return f"back  {hats}  front\n      {marks}   {saved(lineup, guesses)} of {len(lineup)} free"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Test prisoner hat strategies.")
    parser.add_argument("--strategy", choices=STRATEGIES, help="strategy to test (default: all)")
    parser.add_argument("-n", "--prisoners", type=int, default=10)
    parser.add_argument("--show", type=int, default=0, metavar="K", help="print K random lineups")
    args = parser.parse_args(argv)

    names = [args.strategy] if args.strategy else list(STRATEGIES)
    for name in names:
        strategy = STRATEGIES[name]
        results = try_every_lineup(strategy, args.prisoners)
        total = sum(results.values())
        worst = min(results)
        average = sum(k * c for k, c in results.items()) / total
        print(f"{name:>7}: worst case {worst} free, average {average:.2f} over all {total} lineups")
        for _ in range(args.show):
            lineup = [random.choice((BLACK, WHITE)) for _ in range(args.prisoners)]
            print(render(lineup, play(lineup, strategy)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
