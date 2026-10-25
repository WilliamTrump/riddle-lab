import pytest

from parachuting_robots import EXAMPLE_PROGRAM, ProgramError, Simulation, check, parse


def test_example_solves_every_gap():
    results = check(parse(EXAMPLE_PROGRAM), max_gap=40)
    assert all(cycles is not None for cycles in results.values())


def test_naive_program_never_meets():
    program = parse("loop:\n  left\n  goto loop\n")
    assert not Simulation.start(program, 0, 3).run(max_cycles=1000)


def test_swap_counts_as_meeting():
    # Put the robots on different instructions so they step towards each other.
    sim = Simulation.start(parse("right\nleft\n"), 0, 1)
    sim.robots[1].pc = 1
    sim.step()
    assert sim.met


def test_skipnext_sees_own_parachute():
    sim = Simulation.start(parse("skipNext\nright\nleft\n"), 0, 5)
    sim.step()
    assert sim.robots[0].pc == 2


@pytest.mark.parametrize(
    "source, message",
    [
        ("jump\n", "unknown instruction"),
        ("goto nowhere\n", "unknown label"),
        ("a:\na:\nleft\n", "defined twice"),
        ("left 3\n", "takes no arguments"),
    ],
)
def test_parse_errors(source, message):
    with pytest.raises(ProgramError, match=message):
        parse(source)
