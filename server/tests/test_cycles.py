from datetime import date

import pytest

from server.app.modules.ingestion.cycles import reference_date, weeks_for_cycle


def _span(weeks):
    return [(w["week"], w["start"], w["end"]) for w in weeks]


def test_november_2026_uses_pmo_boundaries():
    assert _span(weeks_for_cycle("2026_11_w3")) == [
        (1, date(2026, 10, 31), date(2026, 11, 6)), (2, date(2026, 11, 7), date(2026, 11, 14)),
        (3, date(2026, 11, 15), date(2026, 11, 22)), (4, date(2026, 11, 23), date(2026, 11, 30)),
    ]


def test_other_months_are_generated_and_cover_every_day():
    dec = weeks_for_cycle("2026_12")
    assert _span(dec)[0] == (1, date(2026, 12, 1), date(2026, 12, 7))
    assert _span(dec)[3] == (4, date(2026, 12, 22), date(2026, 12, 31))  # 5th week folded into W4
    jan = weeks_for_cycle("2027_01_w1")
    assert jan[0]["start"] == date(2027, 1, 1) and jan[3]["end"] == date(2027, 1, 31)
    for w in (dec, jan):  # no gaps / overlaps
        assert all((b["start"] - a["end"]).days == 1 for a, b in zip(w, w[1:]))


def test_reference_date_is_end_of_named_week_else_cycle_end():
    assert reference_date("2026_11_w3") == date(2026, 11, 22)
    assert reference_date("2026_12") == date(2026, 12, 31)


@pytest.mark.parametrize("bad", ["", "abc", "2026_13", "2026_00_w1", "2026_11_w9", "../x"])
def test_bad_cycle_ids_raise(bad):
    with pytest.raises(ValueError):
        weeks_for_cycle(bad)
