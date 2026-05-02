import re
from pathlib import Path


def load_translate_helpers():
    source = Path(__file__).resolve().parents[1] / 'app.py'
    code = source.read_text(encoding='utf-8')

    start = code.find('ARABIC_PATTERN =')
    end = code.find('def normalize_arabic')
    if start == -1 or end == -1:
        raise RuntimeError('Could not locate helper section in local-translate/app.py')

    snippet = code[start:end]
    ns = {'re': re}
    exec(snippet, ns)
    return ns


def test_split_by_script_runs_marks_latin_as_non_arabic():
    ns = load_translate_helpers()
    split_by_script_runs = ns['split_by_script_runs']

    runs = split_by_script_runs('نمشيو معاكم، on signe le contrat demain')

    assert len(runs) == 2
    assert runs[0]['is_arabic'] is True
    assert 'نمشيو' in runs[0]['text']
    assert runs[1]['is_arabic'] is False
    assert 'on signe le contrat demain' in runs[1]['text']


def test_translate_mixed_segment_preserves_french_and_translates_arabic_only():
    ns = load_translate_helpers()

    def fake_cached_translate(text, target_lang):
        assert target_lang == 'fra_Latn'
        return f'TR[{text}]'

    ns['cached_translate'] = fake_cached_translate
    translate_mixed_segment = ns['translate_mixed_segment']

    out = translate_mixed_segment('مرحبا بكم on garde le budget', 'fra_Latn')

    assert 'on garde le budget' in out
    assert 'TR[' in out


def test_should_translate_segment_rejects_tiny_arabic_fragments():
    ns = load_translate_helpers()
    should_translate_segment = ns['should_translate_segment']

    assert should_translate_segment('ا') is False
    assert should_translate_segment('سلام عليكم') is True
