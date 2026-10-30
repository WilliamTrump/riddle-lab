import pytest

from egg_drop import BEST, FLOORS, STRATEGIES, RuleError, play, worst_case


def test_one_floor_at_a_time_takes_up_to_100_drops():
    assert worst_case(STRATEGIES["one"])[:2] == (0, 100)


def test_every_tenth_floor_takes_up_to_19_drops():
    assert worst_case(STRATEGIES["tens"])[:2] == (0, 19)


def test_shrinking_gaps_always_finds_it_in_14():
    assert worst_case(STRATEGIES["shrinking"])[:2] == (0, BEST)


def test_shrinking_gaps_follows_the_video():
    _, drops = play(FLOORS, STRATEGIES["shrinking"])
    assert [f for f, _ in drops] == [14, 27, 39, 50, 60, 69, 77, 84, 90, 95, 99, 100]


def test_guessing_gives_wrong_answers():
    def guess(drop):
        return 0 if drop(50) else 75
    assert worst_case(guess)[0] == 99


def test_a_third_egg_is_an_error():
    def careless(drop):
        drop(100)
        drop(100)
        drop(100)
        return 0
    with pytest.raises(RuleError, match="Both replica eggs"):
        play(5, careless)


def test_the_answer_must_be_a_floor():
    with pytest.raises(RuleError, match="return a floor"):
        play(5, lambda drop: None)
