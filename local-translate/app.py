#!/usr/bin/env python3
"""
Local NLLB-200 Translation Service
FastAPI server for offline Arabic→French translation
Optimized for Tunisian Arabic (aeb_Arab) with French code-switching support

QUALITY TEST:
  Input:  "نمشيو معاكم، on signe le contrat demain"
  Output: "Nous allons avec vous, on signe le contrat demain"
  The French part "on signe le contrat demain" should remain UNCHANGED.
"""

import os
import re
import time
from functools import lru_cache
from typing import Optional, List, Dict, Any, Literal
from contextlib import asynccontextmanager

import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

# =============================================================================
# Configuration
# =============================================================================

MODEL_NAME = "facebook/nllb-200-distilled-600M"
MAX_SEGMENT_CHARS = 600  # Split segments longer than this
CACHE_SIZE = 1000  # LRU cache size

# French terms that should NEVER be modified by translation
# These are passed through exactly as-is
PROTECTED_FRENCH_TERMS = {
    # Business terms (lowercase for matching)
    'budget', 'contrat', 'devis', 'facture', 'client', 'projet', 'réunion',
    'équipe', 'délai', 'prix', 'coût', 'tarif', 'remise', 'livraison',
    'support', 'maintenance', 'licence', 'abonnement', 'intégration',
    'déploiement', 'sécurité', 'formation', 'onboarding', 'offre',
    'proposition', 'négociation', 'signature', 'paiement', 'mensuel',
    'annuel', 'trimestre', 'semaine', 'mois', 'année', 'jour',
    # Common French words
    'bonjour', 'merci', 'oui', 'non', 'donc', 'alors', 'mais', 'avec',
    'pour', 'dans', 'sur', 'par', 'nous', 'vous', 'ils', 'elles',
    # Tech terms
    'api', 'crm', 'sla', 'erp', 'b2b', 'b2c', 'kpi', 'roi',
    'teams', 'zoom', 'whatsapp', 'windows', 'google', 'microsoft',
    'outlook', 'excel', 'pdf', 'email', 'mail',
}

# Language codes for NLLB-200
LANG_CODES = {
    "aeb_Arab": "aeb_Arab",  # Tunisian Arabic (Arabic script)
    "arb_Arab": "arb_Arab",  # Modern Standard Arabic
    "fra_Latn": "fra_Latn",  # French
    "eng_Latn": "eng_Latn",  # English
}

# =============================================================================
# Global Model State
# =============================================================================

model = None
tokenizer = None
model_info: Dict[str, Any] = {}

# =============================================================================
# Arabic Detection
# =============================================================================

# Thresholds to avoid translating tiny Arabic fragments (often unstable)
# Kept adjacent to helper functions so isolated helper execution (unit tests)
# has access to these values without requiring full module initialization.
MIN_ARABIC_CHARS = 3  # Minimum Arabic chars to trigger translation
MIN_ARABIC_RATIO = 0.15  # Minimum ratio of Arabic chars in segment

# Unicode ranges for Arabic script
ARABIC_PATTERN = re.compile(r'[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]')

def contains_arabic(text: str) -> bool:
    """Check if text contains Arabic script characters"""
    return bool(ARABIC_PATTERN.search(text))

def count_arabic_chars(text: str) -> int:
    """Count Arabic script characters in text"""
    return len(ARABIC_PATTERN.findall(text))

def count_latin_chars(text: str) -> int:
    """Count Latin alphabet characters in text"""
    return sum(1 for c in text if c.isalpha() and ord(c) < 256)

def is_protected_french(text: str) -> bool:
    """Check if text contains protected French terms that should not be translated
    
    Returns True if text appears to be French and should be passed through unchanged.
    """
    text_lower = text.lower().strip()
    
    # Check for protected terms
    words = re.findall(r'[a-zàâäéèêëîïôöùûüç]+', text_lower)
    for word in words:
        if word in PROTECTED_FRENCH_TERMS:
            return True
    
    # If text has more Latin chars than Arabic, it's likely French
    latin_count = count_latin_chars(text)
    arabic_count = count_arabic_chars(text)
    
    if latin_count > 0 and arabic_count == 0:
        return True  # Pure Latin text - definitely French
    
    return False

def split_by_script_runs(text: str) -> List[Dict[str, Any]]:
    """Split text into runs by script (Arabic vs non-Arabic)
    
    Returns list of {"text": str, "is_arabic": bool}
    Keeps punctuation attached to the preceding run.
    
    STRICT RULE: Any run containing Latin letters is marked as non-Arabic
    to ensure French text is NEVER sent to the translator.
    
    Example:
      Input: "نمشيو معاكم، on signe le contrat demain"
      Output: [
        {"text": "نمشيو معاكم،", "is_arabic": True},
        {"text": " on signe le contrat demain", "is_arabic": False}
      ]
    """
    if not text:
        return []
    
    runs = []
    current_text = ""
    current_is_arabic = None
    
    for char in text:
        # Determine if this char is Arabic script
        char_is_arabic = bool(ARABIC_PATTERN.match(char))
        # Check if it's a Latin letter (a-z, A-Z, or accented)
        char_is_latin = char.isalpha() and not char_is_arabic
        
        # Whitespace and punctuation: attach to current run
        if char.isspace() or char in '،.!?؟,;:\'"()-–—':
            current_text += char
            continue
        
        # If we see a Latin character, force non-Arabic mode
        if char_is_latin:
            char_is_arabic = False
        
        # First non-punctuation char or script change
        if current_is_arabic is None:
            current_is_arabic = char_is_arabic
            current_text += char
        elif char_is_arabic == current_is_arabic:
            current_text += char
        else:
            # Script changed - save current run and start new one
            if current_text:
                runs.append({"text": current_text, "is_arabic": current_is_arabic})
            current_text = char
            current_is_arabic = char_is_arabic
    
    # Don't forget the last run
    if current_text:
        runs.append({"text": current_text, "is_arabic": current_is_arabic if current_is_arabic is not None else False})
    
    # POST-PROCESS: Any run with Latin chars should be marked non-Arabic
    for run in runs:
        if count_latin_chars(run["text"]) > 0:
            run["is_arabic"] = False
    
    return runs

def should_translate_segment(text: str) -> bool:
    """Check if segment has enough Arabic content to warrant translation
    
    Avoids translating tiny fragments (often just punctuation or one token)
    where MT becomes unstable.
    """
    min_arabic_chars = globals().get('MIN_ARABIC_CHARS', 3)
    min_arabic_ratio = globals().get('MIN_ARABIC_RATIO', 0.15)
    arabic_count = count_arabic_chars(text)
    if arabic_count < min_arabic_chars:
        return False
    if len(text) > 0 and arabic_count / len(text) < min_arabic_ratio:
        return False
    return True

def translate_mixed_segment(segment: str, target_lang: str) -> str:
    """Translate a segment that may contain mixed Arabic and French
    
    Splits by script runs, translates only Arabic runs, preserves French.
    This prevents NLLB from mangling French terms like Teams/Zoom/API/CRM.
    
    STRICT RULES:
    1. Latin script text is NEVER sent to translator
    2. Protected French terms are NEVER modified
    3. Only pure Arabic script runs are translated
    """
    runs = split_by_script_runs(segment)
    
    if not runs:
        return segment
    
    output_parts = []
    for run in runs:
        run_text = run["text"]
        
        # RULE 1: Never translate non-Arabic runs (contains Latin)
        if not run["is_arabic"]:
            output_parts.append(run_text)
            continue
        
        # RULE 2: Check if Arabic run should actually be translated
        if not should_translate_segment(run_text):
            output_parts.append(run_text)  # Too small, pass through
            continue
        
        # RULE 3: Double-check for any Latin chars (safety)
        if count_latin_chars(run_text) > 0:
            output_parts.append(run_text)  # Has Latin, don't touch
            continue
        
        # Translate pure Arabic run
        try:
            translated = cached_translate(run_text.strip(), target_lang)
            # Preserve leading/trailing whitespace from original
            leading_ws = len(run_text) - len(run_text.lstrip())
            trailing_ws = len(run_text) - len(run_text.rstrip())
            result = run_text[:leading_ws] + translated + run_text[len(run_text)-trailing_ws:] if trailing_ws else run_text[:leading_ws] + translated
            output_parts.append(result)
        except Exception as e:
            print(f"Translation error for run: {str(e)}")
            output_parts.append(run_text)  # Fallback to original
    
    return "".join(output_parts)

# =============================================================================
# Arabic Text Normalization
# =============================================================================

# Tatweel (kashida) character used for text stretching in Arabic
TATWEEL = '\u0640'

def normalize_arabic(text: str) -> str:
    """Normalize Arabic text before translation
    
    - Remove tatweel (ـ) stretching characters
    - Normalize whitespace (multiple spaces → single space)
    - Preserve punctuation
    """
    # Remove tatweel characters
    text = text.replace(TATWEEL, '')
    
    # Normalize whitespace (collapse multiple spaces, preserve newlines)
    text = re.sub(r'[^\S\n]+', ' ', text)
    
    # Strip leading/trailing whitespace per line
    lines = [line.strip() for line in text.split('\n')]
    text = '\n'.join(lines)
    
    return text.strip()

# =============================================================================
# Glossary Bias Post-Processing
# =============================================================================

# Domain terms that should stay consistent in French output
# Format: {incorrect_variant: correct_term}
GLOSSARY_FR = {
    # Tech terms - ensure consistent casing/spelling
    'api': 'API',
    'Api': 'API',
    'A.P.I.': 'API',
    'crm': 'CRM',
    'Crm': 'CRM',
    'C.R.M.': 'CRM',
    'sla': 'SLA',
    'Sla': 'SLA',
    'S.L.A.': 'SLA',
    # Business terms - ensure French spelling
    'onboarding': 'onboarding',
    'Onboarding': 'onboarding',
    'on-boarding': 'onboarding',
    'déploiement': 'déploiement',
    'deploiement': 'déploiement',
    'deployment': 'déploiement',
    'Déploiement': 'déploiement',
    'devis': 'devis',
    'Devis': 'devis',
    'facture': 'facture',
    'Facture': 'facture',
    'contrat': 'contrat',
    'Contrat': 'contrat',
    'contract': 'contrat',
    'remise': 'remise',
    'Remise': 'remise',
    'rabais': 'remise',
    'discount': 'remise',
}

# English glossary for eng_Latn target
GLOSSARY_EN = {
    'api': 'API',
    'Api': 'API',
    'crm': 'CRM',
    'Crm': 'CRM',
    'sla': 'SLA',
    'Sla': 'SLA',
}

def apply_glossary_bias(text: str, target_lang: str) -> str:
    """Apply glossary corrections to translated text
    
    Simple string replacement for domain term consistency.
    Does word-boundary matching to avoid partial replacements.
    """
    glossary = GLOSSARY_FR if target_lang == 'fra_Latn' else GLOSSARY_EN
    
    for incorrect, correct in glossary.items():
        # Use word boundary regex for safer replacement
        pattern = r'\b' + re.escape(incorrect) + r'\b'
        text = re.sub(pattern, correct, text)
    
    return text

# =============================================================================
# Text Segmentation
# =============================================================================

def split_into_segments(text: str) -> List[str]:
    """Split text into segments by sentences/lines while preserving punctuation"""
    # Split by newlines first
    lines = text.split('\n')
    segments = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Split by sentence-ending punctuation (keep the punctuation with the sentence)
        # Handles: . ! ? ؟ (Arabic question mark)
        sentence_pattern = r'(?<=[.!?؟])\s+'
        sentences = re.split(sentence_pattern, line)
        
        for sentence in sentences:
            sentence = sentence.strip()
            if sentence:
                # If segment is too long, split further
                if len(sentence) > MAX_SEGMENT_CHARS:
                    sub_segments = split_long_segment(sentence)
                    segments.extend(sub_segments)
                else:
                    segments.append(sentence)
    
    return segments

def split_long_segment(text: str) -> List[str]:
    """Split a long segment by punctuation marks"""
    # Split by comma, semicolon, colon (keep punctuation)
    parts = re.split(r'(?<=[,;:])\s+', text)
    
    result = []
    current = ""
    
    for part in parts:
        if len(current) + len(part) + 1 <= MAX_SEGMENT_CHARS:
            current = f"{current} {part}".strip() if current else part
        else:
            if current:
                result.append(current)
            # If single part is still too long, just include it (model will handle)
            current = part
    
    if current:
        result.append(current)
    
    return result if result else [text]

# =============================================================================
# Translation Cache
# =============================================================================

@lru_cache(maxsize=CACHE_SIZE)
def cached_translate(segment: str, target_lang: str) -> str:
    """Cached translation for individual segments"""
    return _translate_segment(segment, target_lang)

def _translate_segment(text: str, target_lang: str) -> str:
    """Translate a single segment using NLLB-200"""
    global model, tokenizer
    
    if not model or not tokenizer:
        raise RuntimeError("Model not loaded")
    
    # Normalize Arabic text before translation
    text = normalize_arabic(text)
    
    # Set source language to Tunisian Arabic
    tokenizer.src_lang = "aeb_Arab"
    
    # Tokenize
    inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=512)
    
    # Move to device
    device = model_info.get("device", "cpu")
    inputs = {k: v.to(device) for k, v in inputs.items()}
    
    # Get forced BOS token for target language
    # NLLB uses special language tokens - try both methods for compatibility
    if hasattr(tokenizer, 'lang_code_to_id') and target_lang in tokenizer.lang_code_to_id:
        forced_bos_token_id = tokenizer.lang_code_to_id[target_lang]
    else:
        # Fallback: convert token directly (works with most tokenizer backends)
        forced_bos_token_id = tokenizer.convert_tokens_to_ids(target_lang)
        if forced_bos_token_id == tokenizer.unk_token_id:
            raise ValueError(f"Unknown target language: {target_lang}")
    
    # Generate translation (deterministic with do_sample=False)
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            forced_bos_token_id=forced_bos_token_id,
            max_new_tokens=256,
            num_beams=5,
            do_sample=False,  # Deterministic output
            early_stopping=True,
        )
    
    # Decode
    translated = tokenizer.decode(outputs[0], skip_special_tokens=True)
    
    # Apply glossary bias for domain term consistency
    translated = apply_glossary_bias(translated, target_lang)
    
    return translated

# =============================================================================
# Pydantic Models
# =============================================================================

class HealthResponse(BaseModel):
    ok: bool
    model: str
    device: str
    compute_type: str
    default_source: str = "aeb_Arab"
    default_target: str = "fra_Latn"
    cache_size: int

class TranslateRequest(BaseModel):
    text: str = Field(..., description="Text to translate")
    target_lang: Literal["fra_Latn", "eng_Latn"] = Field(
        default="fra_Latn",
        description="Target language code"
    )
    mode: Literal["segment", "full"] = Field(
        default="segment",
        description="Translation mode: 'segment' preserves French, 'full' translates everything"
    )

class SegmentResult(BaseModel):
    input: str
    output: str
    translated: bool
    arabic_chars: int

class TranslateResponse(BaseModel):
    text: str
    segments: List[SegmentResult]
    timing: Dict[str, float]
    stats: Dict[str, int]

# =============================================================================
# FastAPI Lifespan
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model on startup, cleanup on shutdown"""
    global model, tokenizer, model_info
    
    # Load environment variables
    device = os.getenv('TRANSLATE_DEVICE', 'cuda' if torch.cuda.is_available() else 'cpu')
    
    # Validate device
    if device == 'cuda' and not torch.cuda.is_available():
        print("WARNING: CUDA requested but not available, falling back to CPU")
        device = 'cpu'
    
    # Set compute type based on device
    compute_type = torch.float16 if device == 'cuda' else torch.float32
    compute_type_str = "float16" if device == 'cuda' else "float32"
    
    print("=" * 60)
    print("NLLB-200 TRANSLATION SERVICE")
    print(f"  Device: {device}")
    print(f"  Compute type: {compute_type_str}")
    if device == 'cuda':
        print(f"  GPU: {torch.cuda.get_device_name(0)}")
    print("=" * 60)
    
    print(f"Loading model: {MODEL_NAME}")
    print("This may take a minute on first run (downloading ~2.4GB model)...")
    
    try:
        # Load tokenizer
        tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        
        # Load model with appropriate dtype
        model = AutoModelForSeq2SeqLM.from_pretrained(
            MODEL_NAME,
            torch_dtype=compute_type,
        )
        
        # Move to device
        model = model.to(device)
        model.eval()  # Set to evaluation mode
        
        model_info = {
            "model": MODEL_NAME,
            "device": device,
            "compute_type": compute_type_str,
        }
        
        print(f"✓ Model loaded successfully on {device} with {compute_type_str}")
        
    except Exception as e:
        print(f"✗ Failed to load model: {str(e)}")
        raise RuntimeError(f"Model loading failed: {str(e)}")
    
    yield
    
    # Cleanup on shutdown
    print("Shutting down translation service...")
    model = None
    tokenizer = None

# =============================================================================
# FastAPI App
# =============================================================================

app = FastAPI(
    title="Local NLLB-200 Translation Service",
    description="Offline Arabic→French translation with code-switching support",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8080", "http://127.0.0.1:5173", "http://127.0.0.1:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================================
# Endpoints
# =============================================================================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    if not model or not tokenizer:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    return HealthResponse(
        ok=True,
        model=model_info["model"],
        device=model_info["device"],
        compute_type=model_info["compute_type"],
        cache_size=CACHE_SIZE,
    )

@app.post("/translate", response_model=TranslateResponse)
async def translate_text(request: TranslateRequest):
    """Translate text from Arabic to French (or English)
    
    In 'segment' mode (default):
    - Text is split into sentences/segments
    - Segments with Arabic script are translated
    - Segments without Arabic (French) are passed through unchanged
    
    In 'full' mode:
    - Entire text is translated as one unit
    """
    if not model or not tokenizer:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    start_time = time.time()
    
    text = request.text.strip()
    target_lang = request.target_lang
    mode = request.mode
    
    if not text:
        return TranslateResponse(
            text="",
            segments=[],
            timing={"ms_total": 0},
            stats={"total_segments": 0, "translated": 0, "passthrough": 0}
        )
    
    segments_results: List[SegmentResult] = []
    translated_count = 0
    passthrough_count = 0
    
    if mode == "segment":
        # Split into segments (by sentence) and process each
        # Preserve original line structure for output
        lines = text.split('\n')
        line_outputs = []
        
        for line in lines:
            if not line.strip():
                line_outputs.append(line)  # Preserve empty lines
                continue
            
            segments = split_into_segments(line)
            segment_outputs = []
            
            for segment in segments:
                arabic_count = count_arabic_chars(segment)
                
                if contains_arabic(segment) and should_translate_segment(segment):
                    # Use script-run translation to preserve French in mixed segments
                    try:
                        translated_text = translate_mixed_segment(segment, target_lang)
                        segments_results.append(SegmentResult(
                            input=segment,
                            output=translated_text,
                            translated=True,
                            arabic_chars=arabic_count
                        ))
                        segment_outputs.append(translated_text)
                        translated_count += 1
                    except Exception as e:
                        print(f"Translation error for segment: {str(e)}")
                        segments_results.append(SegmentResult(
                            input=segment,
                            output=segment,
                            translated=False,
                            arabic_chars=arabic_count
                        ))
                        segment_outputs.append(segment)
                        passthrough_count += 1
                else:
                    # Pass through: no Arabic, or below threshold
                    segments_results.append(SegmentResult(
                        input=segment,
                        output=segment,
                        translated=False,
                        arabic_chars=arabic_count
                    ))
                    segment_outputs.append(segment)
                    passthrough_count += 1
            
            line_outputs.append(" ".join(segment_outputs))
        
        # Preserve paragraph structure
        final_text = '\n'.join(line_outputs)
    
    else:  # mode == "full"
        # Translate entire text as one unit
        arabic_count = count_arabic_chars(text)
        
        if contains_arabic(text):
            try:
                translated_text = cached_translate(text, target_lang)
                segments_results.append(SegmentResult(
                    input=text,
                    output=translated_text,
                    translated=True,
                    arabic_chars=arabic_count
                ))
                translated_count = 1
            except Exception as e:
                print(f"Translation error: {str(e)}")
                segments_results.append(SegmentResult(
                    input=text,
                    output=text,
                    translated=False,
                    arabic_chars=arabic_count
                ))
                passthrough_count = 1
        else:
            segments_results.append(SegmentResult(
                input=text,
                output=text,
                translated=False,
                arabic_chars=arabic_count
            ))
            passthrough_count = 1
        
        # For full mode, output is just the single segment
        final_text = segments_results[0].output if segments_results else text
    
    total_time = time.time() - start_time
    
    # Log results
    print(f"Translation: {len(segments_results)} segments, {translated_count} translated, {passthrough_count} passthrough, {total_time*1000:.1f}ms")
    
    return TranslateResponse(
        text=final_text,
        segments=segments_results,
        timing={"ms_total": round(total_time * 1000, 1)},
        stats={
            "total_segments": len(segments_results),
            "translated": translated_count,
            "passthrough": passthrough_count
        }
    )

@app.post("/clear-cache")
async def clear_cache():
    """Clear the translation cache"""
    cached_translate.cache_clear()
    return {"status": "ok", "message": "Cache cleared"}

@app.get("/cache-info")
async def cache_info():
    """Get cache statistics"""
    info = cached_translate.cache_info()
    return {
        "hits": info.hits,
        "misses": info.misses,
        "size": info.currsize,
        "maxsize": info.maxsize
    }

# =============================================================================
# Main
# =============================================================================

if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="127.0.0.1",
        port=9100,
        reload=False,
        log_level="info"
    )
