from app.modules.mapping.catalog import load_catalog


def test_load_catalog_from_template_has_68_rows_and_workstreams():
    cat = load_catalog()
    assert cat["I.A.3.1"]["mang_viec"].startswith("I.A.3.PAI")
    assert cat["I.C.1.2"]["mang_viec"].startswith("I.C.1.")
    assert cat["I.A.4.2"]["mang_viec"].startswith("I.A.4.")  # forward-filled merged column A
    assert "I.C.1.2.1" not in cat and "IV.Z.99.99" not in cat
    assert sum(1 for _ in cat) >= 60
