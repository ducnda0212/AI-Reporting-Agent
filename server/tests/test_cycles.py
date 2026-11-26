from datetime import date, timedelta

import pytest

from app.modules.ingestion.cycles import cycle_for_date, reference_date, weeks_for_cycle


def _span(weeks):
    return [(w["week"], w["start"], w["end"]) for w in weeks]


def test_november_2026_uses_pmo_boundaries():
    assert _span(weeks_for_cycle("2026_11_w3")) == [
        (1, date(2026, 10, 31), date(2026, 11, 6)), (2, date(2026, 11, 7), date(2026, 11, 14)),
        (3, date(2026, 11, 15), date(2026, 11, 22)), (4, date(2026, 11, 23), date(2026, 11, 30)),
    ]


def _bounds(cycle):
    w = weeks_for_cycle(cycle)
    return [(x["start"], x["end"]) for x in w]


def test_rule_for_other_months_and_year_rollover():
    assert _bounds("2026_12") == [(date(2026, 12, 1), date(2026, 12, 6)), (date(2026, 12, 7), date(2026, 12, 14)),
                                  (date(2026, 12, 15), date(2026, 12, 22)), (date(2026, 12, 23), date(2026, 12, 30))]
    assert _bounds("2027_01")[0] == (date(2026, 12, 31), date(2027, 1, 6))
    assert _bounds("2027_02")[0][0] == date(2027, 1, 31) and _bounds("2027_02")[3][1] == date(2027, 2, 28)
    assert _bounds("2027_03")[0][0] == date(2027, 3, 1)
    assert _bounds("2027_04")[0][0] == date(2027, 3, 31)
    assert _bounds("2028_02")[3][1] == date(2028, 2, 29)


def test_cycle_for_date_examples_and_every_day_has_exactly_its_week():
    assert cycle_for_date(date(2026, 11, 26)) == "2026_11_w4"
    assert cycle_for_date(date(2026, 12, 1)) == "2026_12_w1"
    assert cycle_for_date(date(2026, 12, 31)) == "2027_01_w1"
    assert cycle_for_date(date(2026, 10, 31)) == "2026_11_w1"
    d = date(2026, 1, 1)
    while d <= date(2028, 12, 31):
        cid = cycle_for_date(d)
        w = weeks_for_cycle(cid)[int(cid[-1]) - 1]
        assert w["start"] <= d <= w["end"], d
        d += timedelta(days=1)


def test_active_endpoint_follows_today_unless_pinned(monkeypatch):
    from fastapi.testclient import TestClient

    from app.core.config import settings
    from app.main import app
    from app.modules.ingestion import router

    client = TestClient(app)
    monkeypatch.setattr(settings, "DEFAULT_CYCLE_ID", "")
    monkeypatch.setattr(router, "_today", lambda: date(2026, 11, 26))
    auto = client.get("/api/v1/cycles/active").json()
    assert auto["cycle_id"] == "2026_11_w4" and auto["today"] == "2026-11-26" and auto["weeks"][3]["cur"]
    monkeypatch.setattr(settings, "DEFAULT_CYCLE_ID", "2026_11_w3")
    pinned = client.get("/api/v1/cycles/active").json()
    assert pinned["cycle_id"] == "2026_11_w3" and pinned["today"] == "2026-11-22"


def test_reference_date_is_end_of_named_week_else_cycle_end():
    assert reference_date("2026_11_w3") == date(2026, 11, 22)
    assert reference_date("2026_12") == date(2026, 12, 30)


@pytest.mark.parametrize("bad", ["", "abc", "2026_13", "2026_00_w1", "2026_11_w9", "../x"])
def test_bad_cycle_ids_raise(bad):
    with pytest.raises(ValueError):
        weeks_for_cycle(bad)
