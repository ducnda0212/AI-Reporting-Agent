import csv
import io
from typing import Any

from pydantic import BaseModel

csv.field_size_limit(50 * 1024 * 1024)  # long multi-line cells (Progress Report)


class JiraColumnInfo(BaseModel):
    index: int
    name: str
    non_null_count: int
    sample_values: list[str]


class JiraParsedData(BaseModel):
    columns: list[JiraColumnInfo]
    issues: list[dict[str, Any]]
    stats: dict[str, Any]


def parse_jira_csv(content: bytes | str) -> JiraParsedData:
    if isinstance(content, bytes):
        try:
            content = content.decode("utf-8-sig")
        except UnicodeDecodeError as e:
            raise ValueError("File is not valid UTF-8") from e
    content = content.lstrip("\ufeff")
    rows = csv.reader(io.StringIO(content))
    header = next(rows, None)
    if not header:
        raise ValueError("CSV file is empty")

    n = len(header)
    columns = [
        JiraColumnInfo(index=i, name=name, non_null_count=0, sample_values=[])
        for i, name in enumerate(header)
    ]
    issues: list[dict[str, Any]] = []
    for row in rows:
        if not any(cell.strip() for cell in row):
            continue
        cells = (row + [""] * n)[:n]  # pad short / drop extra cells
        issue: dict[str, Any] = {}
        for col, val in zip(columns, cells):
            if val != "":
                col.non_null_count += 1
                if val not in col.sample_values and len(col.sample_values) < 5:
                    col.sample_values.append(val)
            if issue.get(col.name, "") == "":  # first non-empty wins
                issue[col.name] = val
        issue["_raw_by_index"] = dict(enumerate(cells))
        issues.append(issue)

    counts: dict[str, int] = {}
    for name in header:
        counts[name] = counts.get(name, 0) + 1
    return JiraParsedData(
        columns=columns,
        issues=issues,
        stats={
            "total_cols": n,
            "total_issues": len(issues),
            "duplicate_groups": sum(1 for c in counts.values() if c > 1),
        },
    )
