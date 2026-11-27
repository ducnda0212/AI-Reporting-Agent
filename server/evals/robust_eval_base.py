"""Dữ liệu dùng chung của robust_eval và robust_more."""
from __future__ import annotations

H_EDIT = [{'q': 'mấy dự án trễ thì ghi note chờ họp', 'codes': ['I.A.1.1', 'I.A.2.1', 'II.A.1.1'], 'a': 'Mình đã soạn 3 thay đổi'}]
H_ASK = [{'q': 'dự án nào đang chậm tiến độ', 'codes': ['I.A.1.1', 'I.A.2.1', 'II.A.1.1'], 'a': '3 dự án chậm tiến độ'}]
H_DRAFT = [{'q': 'soạn giúp mình các ô trống', 'codes': [], 'a': 'Mình đang nhờ AI soạn nháp'}]


def op(field, value, codes=(), wf='', wv='', only_empty=False, all_=False):
    return {'field': field, 'value': value, 'codes': list(codes), 'where_field': wf, 'where_value': wv, 'only_empty': only_empty, 'all': all_}
