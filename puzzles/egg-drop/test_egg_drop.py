import pytest

from egg_drop import BEST, FLOORS, STRATEGIES, play, worst_case


def test_one_floor_at_a_time_takes_up_to_100_drops():
    assert worst_case(STRATEGIES["one"])[:2] == (0, 100)


def test_every_tenth_floor_takes_up_to_19_drops():
    assert worst_case(STRATEGIES["tens"])[:2] == (0, 19)


def test_shrinking_gaps_always_finds_it_in_14():
    assert worst_case(STRATEGIES["shrinking"])[:2] == (0, BEST)


def test_shrinking_gaps_follows_the_video():
    _, drops = play(FLOORS, STRATEGIES["shrinking"])
    assert [f for f, _ in drops] == [14, 27, 39, 50, 60, 69, 77, 84, 90, 95, 99, 100]


def test_skipping_floors_with_one_egg_left_can_lose():
    found, drops = play(5, lambda safe, broken, eggs: min(safe + 10, broken - 1) if eggs == 2 else safe + 2)
    assert not found and [f for f, _ in drops] == [10, 2, 4, 6]


def test_a_known_floor_is_rejected():
    with pytest.raises(ValueError, match="already known to be safe"):
        play(50, lambda safe, broken, eggs: max(1, safe))
