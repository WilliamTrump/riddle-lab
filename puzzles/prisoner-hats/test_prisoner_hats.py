import pytest

from prisoner_hats import BLACK, WHITE, everyone_black, parity, pass_it_on, play, try_every_lineup


def test_parity_saves_all_but_one_every_time():
    results = try_every_lineup(parity, 10)
    assert min(results) == 9
    assert sum(results.values()) == 2 ** 10


def test_pairs_guarantees_half():
    assert min(try_every_lineup(pass_it_on, 10)) == 5


def test_everyone_black_can_save_nobody():
    assert min(try_every_lineup(everyone_black, 6)) == 0


def test_strategy_sees_only_hats_in_front():
    calls = []
    play([BLACK, WHITE, BLACK], lambda seen, heard: calls.append((seen, heard)) or BLACK)
    assert calls[0] == ((WHITE, BLACK), ())
    assert calls[2] == ((), (BLACK, BLACK))


def test_bad_answer_is_rejected():
    with pytest.raises(ValueError, match="prisoner 1"):
        play([BLACK], lambda seen, heard: "grey")
