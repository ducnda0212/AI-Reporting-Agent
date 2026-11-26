from server.app.ai.masking import Masker


def test_mask_and_unmask_roundtrip():
    m = Masker()
    m.add('Nguyễn Văn An, Trần Thị Bình (PO)', None, '')
    txt = 'Anh Nguyễn Văn An giao cho trần thị bình; mail an@vsf.vn'
    masked = m.mask(txt)
    assert 'Nguyễn' not in masked and 'bình' not in masked.lower() and '[email]' in masked
    assert '[Người 1]' in masked and '[Người 2]' in masked
    assert m.unmask({'a': ['[Người 1] xử lý', '[Người 2]'], 'n': 3}) == {'a': ['Nguyễn Văn An xử lý', 'Trần Thị Bình'], 'n': 3}


def test_longer_names_masked_first():
    m = Masker()
    m.add('An', 'Nguyễn An', 'Lê Hoàng Nguyễn An')  # 'An' quá ngắn nên bỏ qua
    assert m.mask('Lê Hoàng Nguyễn An') == '[Người 2]'


def test_duplicates_and_emails_are_not_registered():
    m = Masker()
    m.add('Hà Minh', 'Hà Minh', 'x@y.z')
    assert len(m.fwd) == 1


def test_disabled_passthrough():
    m = Masker(enabled=False)
    m.add('Nguyễn Văn An')
    assert m.mask('Nguyễn Văn An') == 'Nguyễn Văn An'
    assert m.unmask('[Người 1]') == '[Người 1]'
