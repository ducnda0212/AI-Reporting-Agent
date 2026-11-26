import pytest

from server.app.ai.llm import parse_json


def test_plain_json():
    assert parse_json('{"a": 1}') == {'a': 1}


def test_strips_think_and_code_fence():
    assert parse_json('<think>suy nghĩ {không phải json}</think>\n```json\n{"a": "b"}\n```') == {'a': 'b'}


def test_text_around_object_and_braces_inside_strings():
    txt = 'Đây là kết quả: {"t": "có dấu } trong chuỗi", "n": {"x": [1, 2]}} xong.'
    assert parse_json(txt) == {'t': 'có dấu } trong chuỗi', 'n': {'x': [1, 2]}}


def test_escaped_quotes():
    assert parse_json('{"t": "nói \\"OK\\" nhé"}') == {'t': 'nói "OK" nhé'}


@pytest.mark.parametrize('bad', ['', 'không có json', '{"a": 1', '<think>{"a":1}</think>'])
def test_invalid_raises(bad):
    with pytest.raises(ValueError):
        parse_json(bad)


def test_repair_truncated_json_only_when_asked():
    cut = '{"ops":[{"field":"rui","value":"Cao","target":{"codes":["DA02","DA04"]'
    with pytest.raises(ValueError):
        parse_json(cut)
    assert parse_json(cut, repair=True) == {'ops': [{'field': 'rui', 'value': 'Cao', 'target': {'codes': ['DA02', 'DA04']}}]}
    assert parse_json('{"a": "dở dang', repair=True) == {'a': 'dở dang'}
    assert parse_json('{"a": 1, "b":', repair=True) == {'a': 1}
    assert parse_json('{"a": [1, 2], "b": tru', repair=True) == {'a': [1, 2]}
