import csv
import io

from server.app.core.config import settings


def golden_csv(extra_uncoded_key: str | None = None) -> bytes:
    """Golden dataset bytes; optionally + one top-level issue without a DA code (-> NO_DA_CODE orphan, E_NO_CODE)."""
    raw = open(f"{settings.FIXTURES_DIR}/golden_dataset.csv", "rb").read()
    if extra_uncoded_key is None:
        return raw
    rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig"))))
    head, new = rows[0], [""] * len(rows[0])
    new[head.index("Summary")], new[head.index("Issue key")] = "Việc lẻ không có mã", extra_uncoded_key
    new[head.index("Issue Type")], new[head.index("Status")] = "Task", "In Progress"
    out = io.StringIO()
    csv.writer(out).writerows([*rows, new])
    return out.getvalue().encode("utf-8")
