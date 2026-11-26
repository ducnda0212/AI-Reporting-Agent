"""Master catalog of standard DA codes, read from the template sheet "Mẫu báo cáo"."""
from functools import lru_cache
from pathlib import Path

import openpyxl

from server.app.core.config import settings

TEMPLATE_NAME = "20261111_DAN_Mau-bao-cao-PMO.xlsx"
SHEET = "Mẫu báo cáo"


@lru_cache(maxsize=1)
def load_catalog() -> dict[str, dict]:
    """{ma_da: {"mang_viec": str, "template_row": int}}; column A is blank under merged workstreams."""
    wb = openpyxl.load_workbook(Path(settings.TEMPLATES_DIR) / TEMPLATE_NAME, read_only=True, data_only=True)
    try:
        catalog: dict[str, dict] = {}
        workstream = ""
        for n, (a, b) in enumerate(wb[SHEET].iter_rows(min_row=2, max_col=2, values_only=True), start=2):
            workstream = (a or workstream).strip() if isinstance(a, str) else workstream
            code = str(b).strip() if b else ""
            if code and code not in catalog:  # first occurrence wins (II.D.2.1 appears twice)
                catalog[code] = {"mang_viec": workstream, "template_row": n}
        return catalog
    finally:
        wb.close()
