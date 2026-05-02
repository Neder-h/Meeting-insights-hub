import math
import re
from pathlib import Path


def load_whisper_helpers():
    source = Path(__file__).resolve().parents[1] / 'app.py'
    code = source.read_text(encoding='utf-8')

    start = code.find('def split_script_boundaries')
    end = code.find('@app.post("/transcribe"')
    if start == -1 or end == -1:
        raise RuntimeError('Could not locate helper section in local-whisper/app.py')

    snippet = code[start:end]
    ns = {'re': re, 'math': math, 'List': list}
    exec(snippet, ns)
    return ns


def test_split_script_boundaries_adds_spaces_between_scripts():
    ns = load_whisper_helpers()
    split_script_boundaries = ns['split_script_boundaries']

    assert split_script_boundaries('lecoûtنتكست') == 'lecoût نتكست'
    assert split_script_boundaries('مرحباCRM') == 'مرحبا CRM'


def test_postprocess_transcript_fixes_known_hybrids():
    ns = load_whisper_helpers()
    postprocess_transcript = ns['postprocess_transcript']

    processed, contexte_fixes, presentiel_fixes = postprocess_transcript('le coûtنتكست prixزانسيل')

    assert 'contexte' in processed
    assert 'présentiel' in processed
    assert contexte_fixes >= 1
    assert presentiel_fixes >= 1


def test_compute_segment_confidence_penalizes_no_speech_and_repetition():
    ns = load_whisper_helpers()
    compute_segment_confidence = ns['compute_segment_confidence']

    class Seg:
        def __init__(self, avg_logprob, no_speech_prob, compression_ratio):
            self.avg_logprob = avg_logprob
            self.no_speech_prob = no_speech_prob
            self.compression_ratio = compression_ratio

    strong = Seg(avg_logprob=-0.2, no_speech_prob=0.02, compression_ratio=1.1)
    weak = Seg(avg_logprob=-1.6, no_speech_prob=0.5, compression_ratio=3.2)

    c_strong = compute_segment_confidence(strong)
    c_weak = compute_segment_confidence(weak)

    assert 0 <= c_strong <= 100
    assert 0 <= c_weak <= 100
    assert c_strong > c_weak
