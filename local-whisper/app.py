#!/usr/bin/env python3
"""
Local Whisper Transcription Service
FastAPI server using faster-whisper for offline speech-to-text
Optimized for RTX 4070 laptop GPU with Tunisian/French code-switching support
"""

import os
import re
import sys
import time
import json
import math
import asyncio
import argparse
from concurrent.futures import ThreadPoolExecutor
import tempfile
import subprocess
import shutil
from pathlib import Path
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()  # Load .env file for GEMINI_API_KEY and other settings

# Ensure HF XET is disabled if set in .env (prevents download stalls on Windows)
if os.getenv('HF_HUB_DISABLE_XET'):
    os.environ['HF_HUB_DISABLE_XET'] = os.getenv('HF_HUB_DISABLE_XET')

from google import genai
from google.genai import types
import uvicorn
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import torch
from faster_whisper import WhisperModel

# === CLI ARGUMENT PARSING ===
# Allows launching with: python app.py --variant finetuned
# Or via env var: WHISPER_VARIANT=finetuned uvicorn app:app ...
def parse_cli_args():
    """Parse CLI args, ignoring unknown args (uvicorn passes its own)"""
    parser = argparse.ArgumentParser(description="Local Whisper Transcription Service")
    parser.add_argument(
        '--variant',
        choices=['base', 'finetuned'],
        default=None,
        help='Model variant: base (standard whisper) or finetuned (your HF model)'
    )
    parser.add_argument(
        '--finetuned-repo',
        default=None,
        help='HuggingFace repo ID for fine-tuned model (overrides WHISPER_FINETUNED_REPO env var)'
    )
    parser.add_argument(
        '--hf-token',
        default=None,
        help='HuggingFace access token (overrides HF_TOKEN env var)'
    )
    args, _ = parser.parse_known_args()
    return args

cli_args = parse_cli_args()

# Configuration
MAX_FILE_SIZE_MB = 200
SUPPORTED_FORMATS = ['audio/webm', 'audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/m4a']

# IMPORTANT: NO initial prompt - prompts often CAUSE hallucinations with Whisper
# The model works better when it just listens to the audio without preconceptions
# For Tunisian Derja, forcing Arabic language is sufficient
DEFAULT_INITIAL_PROMPT = ""  # Empty - let Whisper listen without bias

# Short prompt to improve FR/Derja code-switching (keep French in Latin)
# Explicitly ask for Tunisian dialect (Darja) and to avoid MSA normalization
BILINGUAL_INITIAL_PROMPT = (
    "تونس. اكتب بالدارجة التونسية كيفما يتقال، ما تكتبش عربي فصحى. "
    "خلي الكلمات الفرنسية باللاتيني (ex: CRM, meeting, support, budget). "
    "مثال: عسلامة، شنية الأحوال؟"  # Example in Tunisian Darja
)  # Keep this very short

# Global model instance (loaded once at startup)
whisper_model: Optional[WhisperModel] = None
model_info: Dict[str, Any] = {}
fallback_applied: bool = False  # Track if OOM fallback has been applied

# Audio preprocessing settings (set at startup)
AUDIO_PREPROCESS_ENABLED: bool = True
AUDIO_PREPROCESS_FILTERS: str = ""

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load Whisper model on startup, cleanup on shutdown"""
    global whisper_model, model_info, fallback_applied

    # Reset fallback flag on startup
    fallback_applied = False

    global INITIAL_PROMPT_EFFECTIVE
    
    # === CUDA DIAGNOSTICS ===
    print("=" * 60)
    print("CUDA DIAGNOSTICS")
    print(f"  PyTorch CUDA available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"  CUDA device count: {torch.cuda.device_count()}")
        print(f"  CUDA device name: {torch.cuda.get_device_name(0)}")
        print(f"  CUDA device capability: {torch.cuda.get_device_capability(0)}")
    else:
        print("  WARNING: CUDA not available! Will use CPU (very slow)")
    print("=" * 60)
    
    # Load environment variables - STABLE DECODING SETTINGS (reduces hallucinations)
    # NOTE: Using large-v3 as it's already downloaded
    # Anti-hallucination handled via strict thresholds instead of model change
    model_size = os.getenv('WHISPER_MODEL', 'large-v3')
    device = os.getenv('WHISPER_DEVICE', 'cuda')
    compute_type = os.getenv('WHISPER_COMPUTE_TYPE', 'float16')
    beam_size = int(os.getenv('WHISPER_BEAM_SIZE', '8'))  # Balanced (not too greedy)
    vad_filter = os.getenv('WHISPER_VAD_FILTER', 'true').lower() == 'true'
    best_of = int(os.getenv('WHISPER_BEST_OF', '1'))  # Deterministic (no sampling)
    patience = float(os.getenv('WHISPER_PATIENCE', '1.2'))  # Standard patience
    INITIAL_PROMPT_EFFECTIVE = os.getenv('WHISPER_INITIAL_PROMPT', DEFAULT_INITIAL_PROMPT).strip()
    
    # === MODEL VARIANT SELECTION ===
    # CLI args take priority over env vars
    variant = cli_args.variant or os.getenv('WHISPER_VARIANT', 'base').strip().lower()
    finetuned_repo = cli_args.finetuned_repo or os.getenv('WHISPER_FINETUNED_REPO', '').strip()
    hf_token = cli_args.hf_token or os.getenv('HF_TOKEN', '').strip()
    
    # Determine the actual model to load
    if variant == 'finetuned':
        if not finetuned_repo:
            print("✗ ERROR: WHISPER_VARIANT=finetuned but no WHISPER_FINETUNED_REPO specified!")
            print("  Set WHISPER_FINETUNED_REPO in .env or pass --finetuned-repo on CLI")
            raise RuntimeError("Fine-tuned variant selected but no repo specified. "
                             "Set WHISPER_FINETUNED_REPO in .env or pass --finetuned-repo")
        
        # Authenticate with HuggingFace for private repos
        if hf_token:
            try:
                from huggingface_hub import login
                login(token=hf_token, add_to_git_credential=False)
                print(f"✓ Authenticated with HuggingFace (token: ...{hf_token[-4:]})")
            except Exception as e:
                print(f"⚠ HuggingFace login warning: {e}")
                print("  Will try to load model anyway (may fail for private repos)")
        else:
            print("⚠ No HF_TOKEN set - will only work for public repos or cached models")
        
        effective_model = finetuned_repo
        print(f"\n{'='*60}")
        print(f"  MODEL VARIANT: FINE-TUNED")
        print(f"  Repo/Path: {finetuned_repo}")
        print(f"{'='*60}\n")
    else:
        effective_model = model_size
        print(f"\n{'='*60}")
        print(f"  MODEL VARIANT: BASE ({model_size})")
        print(f"{'='*60}\n")
    
    # Audio preprocessing settings
    global AUDIO_PREPROCESS_ENABLED, AUDIO_PREPROCESS_FILTERS
    AUDIO_PREPROCESS_ENABLED = os.getenv('WHISPER_AUDIO_PREPROCESS', 'true').lower() == 'true'
    # Default filter chain optimized for meeting recordings:
    # - highpass=f=80: Remove low rumble/HVAC noise
    # - lowpass=f=7800: Remove high frequency hiss
    # - afftdn=nf=-20: FFT-based noise reduction
    # - loudnorm: Normalize loudness for consistent levels
    DEFAULT_FILTERS = "highpass=f=80,lowpass=f=7800,afftdn=nf=-20,loudnorm=I=-16:LRA=11:TP=-1.5"
    AUDIO_PREPROCESS_FILTERS = os.getenv('WHISPER_AUDIO_PREPROCESS_FILTERS', DEFAULT_FILTERS)
    
    print(f"Audio preprocessing: {'ENABLED' if AUDIO_PREPROCESS_ENABLED else 'DISABLED'}")
    if AUDIO_PREPROCESS_ENABLED:
        print(f"  Filters: {AUDIO_PREPROCESS_FILTERS}")
    
    # Force CUDA if available
    if device == 'cuda' and not torch.cuda.is_available():
        print("WARNING: CUDA requested but not available, falling back to CPU")
        device = 'cpu'
        compute_type = 'float32'  # CPU doesn't support float16

    print(f"Loading Whisper model: {effective_model} on {device} with {compute_type}")
    if variant == 'finetuned':
        print(f"This may take longer on first run (downloading fine-tuned model from HuggingFace)...")
    else:
        print(f"This may take a few minutes on first run (downloading ~3GB model)...")

    try:
        # Try primary configuration
        # device_index=0 explicitly selects the first (dedicated) GPU
        whisper_model = WhisperModel(
            effective_model,
            device=device,
            device_index=0,  # Explicitly use first GPU (RTX 4070)
            compute_type=compute_type,
            num_workers=1,
            download_root=None,
            local_files_only=False,
            cpu_threads=0,
        )

        model_info = {
            "model": model_size,
            "variant": variant,
            "effective_model": effective_model,
            "finetuned_repo": finetuned_repo if variant == 'finetuned' else None,
            "device": device,
            "compute_type": compute_type,
            "beam_size": beam_size,
            "best_of": best_of,
            "patience": patience,
            "vad_filter": vad_filter,
            "initial_prompt_length": len(INITIAL_PROMPT_EFFECTIVE)
        }

        print(f"✓ Model loaded successfully: {model_info}")
        print(f"  Prompt ({len(INITIAL_PROMPT_EFFECTIVE)} chars): {INITIAL_PROMPT_EFFECTIVE[:80]}...")

    except Exception as e:
        error_msg = f"Failed to load Whisper model: {str(e)}"
        print(f"✗ {error_msg}")

        # Try fallback configuration if CUDA OOM
        if "out of memory" in str(e).lower() and device == "cuda":
            print("CUDA OOM detected, trying fallback with int8_float16...")
            try:
                whisper_model = WhisperModel(
                    effective_model,
                    device=device,
                    compute_type="int8_float16",
                    num_workers=1,
                    download_root=None,
                    local_files_only=False,
                    cpu_threads=0,
                )

                model_info = {
                    "model": model_size,
                    "variant": variant,
                    "effective_model": effective_model,
                    "finetuned_repo": finetuned_repo if variant == 'finetuned' else None,
                    "device": device,
                    "compute_type": "int8_float16",
                    "beam_size": beam_size,
                    "vad_filter": vad_filter,
                    "fallback_applied": True
                }

                print(f"✓ Model loaded with fallback: {model_info}")

            except Exception as fallback_e:
                print(f"✗ Fallback also failed: {str(fallback_e)}")
                print("Recommendation: Try WHISPER_MODEL=medium in .env")
                raise RuntimeError("Model loading failed even with fallback. Try a smaller model.")

        else:
            raise RuntimeError(error_msg)

    yield

    # Cleanup on shutdown
    print("Shutting down Whisper service...")
    if whisper_model:
        # Note: faster-whisper doesn't have explicit cleanup, but we can clear the global
        pass

app = FastAPI(
    title="Local Whisper Transcription Service",
    description="Offline speech-to-text using faster-whisper, optimized for RTX 4070",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:8080",
        "http://localhost:8081",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:8081",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class HealthResponse(BaseModel):
    ok: bool
    model: str
    variant: str
    finetuned_repo: Optional[str] = None
    device: str
    compute_type: str
    beam_size: int
    vad_filter: bool
    fallback_applied: Optional[bool] = None

class Segment(BaseModel):
    start: float
    end: float
    text: str
    confidence: float = 0.0
    low_confidence: bool = False

class CleaningChange(BaseModel):
    before: str
    after: str
    count: int

class Timing(BaseModel):
    decode_ms: float
    transcribe_ms: float
    total_ms: float

class TranscriptionResponse(BaseModel):
    text: str
    raw_text: str
    cleaned_text: str
    detected_language: str
    cleaning_profile: str
    cleaning_diff: List[CleaningChange]
    low_confidence_count: int
    segments: List[Segment]
    timing: Timing
    settings: Dict[str, Any]

def do_transcription(audio_path: str, whisper_language: Optional[str], prompt_override: Optional[str] = None):
    """Execute transcription with ANTI-HALLUCINATION settings
    
    For Tunisian meetings with French/Derja code-switching:
    - Use language='ar' to force Arabic-primary transcription (recommended)
    - Whisper will still output French terms in Latin when spoken
    
    CRITICAL ANTI-HALLUCINATION SETTINGS:
    - temperature with fallback: Start greedy, escalate if needed
    - VERY strict compression_ratio_threshold: Reject repetitive garbage
    - hallucination_silence_threshold: Detect when model is making things up
    - condition_on_previous_text=False: Prevents drift and language lock-in
    """
    
    # VAD parameters - balanced for Tunisian conversations (avoid clipping words)
    vad_params = dict(
        threshold=0.45,  # Slightly lower - keep quieter speech
        min_speech_duration_ms=200,  # Keep short words
        min_silence_duration_ms=500,  # Normal split
        max_speech_duration_s=30,  # Longer context for better accuracy
        speech_pad_ms=120,  # More padding to avoid clipped phonemes
    )
    
    # Use override prompt if provided; otherwise use global prompt (may be empty)
    effective_prompt = prompt_override or (INITIAL_PROMPT_EFFECTIVE if INITIAL_PROMPT_EFFECTIVE else None)
    
    # Fine-tuned models are already optimized for the domain,
    # so they need lighter decoding settings (faster + less hallucination risk).
    # Base models need heavier settings to compensate for lack of domain training.
    is_finetuned = model_info.get("variant") == "finetuned"
    
    effective_beam_size = 5 if is_finetuned else 8
    effective_best_of = 1 if is_finetuned else 5
    effective_temperature = [0.0] if is_finetuned else [0.0, 0.2]
    
    print(f"  Decoding: beam_size={effective_beam_size}, best_of={effective_best_of}, "
          f"temp={effective_temperature}, variant={'finetuned' if is_finetuned else 'base'}")
    
    return whisper_model.transcribe(
        audio_path,
        language=whisper_language,
        task="transcribe",  # NEVER use "translate" - we want raw transcription
        
        # === BEAM SEARCH - adapted to model variant ===
        beam_size=effective_beam_size,
        best_of=effective_best_of,
        patience=1.0,
        
        # === TEMPERATURE - greedy for finetuned, fallback for base ===
        temperature=effective_temperature,
        
        # === HALLUCINATION PREVENTION (balanced) ===
        compression_ratio_threshold=2.2,
        log_prob_threshold=-1.0,
        no_speech_threshold=0.5,
        
        # === CONTEXT: Keep previous text for better code-switching ===
        condition_on_previous_text=True,
        initial_prompt=effective_prompt,  # None if empty
        
        # === REPETITION PREVENTION ===
        repetition_penalty=1.2,
        no_repeat_ngram_size=3,
        
        # === VAD - aggressive filtering ===
        vad_filter=True,
        vad_parameters=vad_params,
        word_timestamps=True,
        
        # === OTHER SETTINGS ===
        prefix=None,
        suppress_blank=True,
        suppress_tokens=[-1],
        without_timestamps=False,
        max_initial_timestamp=1.0,
        
        # === LENGTH PENALTY ===
        length_penalty=1.0,
        
        # === HALLUCINATION SILENCE THRESHOLD ===
        hallucination_silence_threshold=2.0,
    )

def check_ffmpeg() -> bool:
    """Check if ffmpeg is available"""
    try:
        result = subprocess.run(
            ['ffmpeg', '-version'],
            capture_output=True,
            text=True,
            timeout=5
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False

def convert_audio_to_wav(input_path: str, output_path: str, preprocess: bool = True) -> None:
    """Convert audio file to 16kHz mono WAV using ffmpeg with optional preprocessing.
    
    Args:
        input_path: Path to input audio file
        output_path: Path to output WAV file
        preprocess: If True and AUDIO_PREPROCESS_ENABLED, apply filter chain
    """
    # Get input file size for logging
    input_size = os.path.getsize(input_path)
    
    # Build ffmpeg command
    cmd = [
        'ffmpeg', '-y',  # Overwrite output
        '-i', input_path,  # Input file
    ]
    
    # Add preprocessing filters if enabled
    apply_filters = preprocess and AUDIO_PREPROCESS_ENABLED and AUDIO_PREPROCESS_FILTERS
    if apply_filters:
        cmd.extend(['-af', AUDIO_PREPROCESS_FILTERS])
    
    # Output format settings
    cmd.extend([
        '-acodec', 'pcm_s16le',  # 16-bit PCM
        '-ar', '16000',  # 16kHz sample rate
        '-ac', '1',  # Mono
        '-f', 'wav',  # WAV format
        output_path
    ])

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120  # 2 minute timeout (preprocessing takes longer)
        )

        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg conversion failed: {result.stderr}")
        
        # Log file sizes
        output_size = os.path.getsize(output_path)
        print(f"  Audio conversion: {input_size/1024:.1f}KB -> {output_size/1024:.1f}KB"
              f" (preprocess={'ON' if apply_filters else 'OFF'})")

    except subprocess.TimeoutExpired:
        raise RuntimeError("Audio conversion timed out")

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    if not whisper_model:
        raise HTTPException(status_code=503, detail="Model not loaded")

    return HealthResponse(
        ok=True,
        model=model_info["model"],
        variant=model_info.get("variant", "base"),
        finetuned_repo=model_info.get("finetuned_repo"),
        device=model_info["device"],
        compute_type=model_info["compute_type"],
        beam_size=model_info["beam_size"],
        vad_filter=model_info["vad_filter"],
        fallback_applied=model_info.get("fallback_applied", False)
    )

def count_arabic_chars(text: str) -> int:
    """Count Arabic Unicode characters in text"""
    return sum(1 for c in text if '\u0600' <= c <= '\u06FF' or '\u0750' <= c <= '\u077F')

# Common French words that Whisper might incorrectly write in Arabic script
# Maps arabized forms back to correct French
ARABIZED_FRENCH_MAP = {
    # Business terms
    'البدجت': 'le budget',
    'بدجت': 'budget',
    'الكونترا': 'le contrat',
    'كونترا': 'contrat',
    'الديفي': 'le devis',
    'ديفي': 'devis',
    'الفاكتور': 'la facture',
    'فاكتور': 'facture',
    'الكليون': 'le client',
    'كليون': 'client',
    'البروجي': 'le projet',
    'بروجي': 'projet',
    'لاكيب': "l'équipe",
    'إكيب': 'équipe',
    'الايكيب': "l'équipe",
    'ايكيب': 'équipe',
    'الريونيون': 'la réunion',
    'ريونيون': 'réunion',
    'البري': 'le prix',
    'بري': 'prix',
    'الكو': 'le coût',
    'التاريف': 'le tarif',
    'تاريف': 'tarif',
    'الروميز': 'la remise',
    'روميز': 'remise',
    'رميز': 'remise',
    'الليفريزون': 'la livraison',
    'ليفريزون': 'livraison',
    'السوبور': 'le support',
    'سوبور': 'support',
    'سبورت': 'le support',
    'الليسونس': 'la licence',
    'ليسونس': 'licence',
    'لابونمون': "l'abonnement",
    'أبونمون': 'abonnement',
    'ابنما': 'un abonnement',
    'الأوفر': "l'offre",
    'أوفر': 'offre',
    'السينياتور': 'la signature',
    'سينياتور': 'signature',
    'البايمون': 'le paiement',
    'بايمون': 'paiement',
    'الفورماسيون': 'la formation',
    'فورماسيون': 'formation',
    'الإنتيقراسيون': "l'intégration",
    'إنتيقراسيون': 'intégration',
    'الانتجراسيون': "l'intégration",
    'انتجراسيون': 'intégration',
    'الديبلوامون': 'le déploiement',
    'ديبلوامون': 'déploiement',
    'السيكوريتي': 'la sécurité',
    'سيكوريتي': 'sécurité',
    'سيكوريتية': 'la sécurité',
    # Tech terms / acronyms
    'آ بي آي': 'API',
    'أي بي آي': 'API',
    'ايه بي اي': 'API',
    'الا بيم': "l'API",
    'الا بيوم': "l'API",
    'ابي': 'API',
    'سي آر إم': 'CRM',
    'سي ار ام': 'CRM',
    'إس إل إي': 'SLA',
    'اس ال اي': 'SLA',
    'تيمز': 'Teams',
    'تيمس': 'Teams',
    'زوم': 'Zoom',
    'واتساب': 'WhatsApp',
    'ويندوز': 'Windows',
    'غوغل': 'Google',
    'مايكروسوفت': 'Microsoft',
    'آوتلوك': 'Outlook',
    'إكسيل': 'Excel',
    'بي دي إف': 'PDF',
    # New mappings from ASR analysis
    'لبزوان': 'le besoin',
    'بزوان': 'besoin',
    'سولوسيون': 'la solution',
    'ديسيزيون': 'la décision',
    'سويفي': 'le suivi',
    'للأكسين': 'les actions',
    'ليزاكسيين': 'les actions',
    'الاكسيون': 'les actions',
    'اكسيون': 'action',
    'تعكابتور': 'capture',
    'كابتور': 'capture',
    'ريزيمي': 'un résumé',
    'ايتمز': 'items',
    'سامبل': 'simple',
    'كونت رندو': 'un compte rendu',
    'كونترندو': 'un compte rendu',
    'ترونسكيبيسيون': 'la transcription',
    'ترونسريبسين': 'la transcription',
    'ترانسكيفتيون': 'la transcription',
    'ترانسكريبشن': 'la transcription',
    'اناليسيس': "l'analyse",
    'الاناليزيس': "l'analyse",
    'اناليز': 'analyse',
    'سينتيمنت': 'le sentiment',
    'استاج': 'un stage',
    'نغوصياشون': 'de négociation',
    'نيغوسياسيون': 'négociation',
    'البلاتفورم': 'la plateforme',
    'بلاتفورم': 'plateforme',
    'الريكوردنج': 'Le recording',
    'ريكوردنج': 'recording',
    'بالنفيقاتور': 'بالـ navigateur',
    'نافيقاتور': 'navigateur',
    'ترتمو': 'le traitement',
    'تريتمون': 'traitement',
    'دنيا حاسسة': 'données sensibles',
    'دونيا': 'données',
    'انكربشن': 'le chiffrement',
    'اكسيس كونترول': "l'access control",
    'كلاود': 'Cloud',
    'كلاد': 'Cloud',
    'لوكال': 'local',
    'البوليسي': 'la policy',
    'بوليسي': 'policy',
    'البرى': 'le pricing',
    'برايسينغ': 'pricing',
    'باق': 'un pack',
    'باك': 'pack',
    'ستاندار': 'standard',
    'بازيك': 'basique',
    'برو': 'pro',
    'ميتينغ': 'meeting',
    'الميتينغ': 'le meeting',
}

# Tunisian Derja spelling normalization
# Maps noisy/phonetic ASR spellings to clean Derja (NOT French, NOT MSA)
DERJA_POSTPROCESS_MAP = {
    'بتاعكم': 'متاعكم',
    'بتاعنا': 'متاعنا',
    'بتاعهم': 'متاعهم',
    'بتاعو': 'متاعو',
    'بتاعي': 'متاعي',
    'بالضبة': 'بالضبط',
    'الغالبه': 'الغالب',
    'اليكم': 'ليكم',
    'بنسبه': 'بالنسبة',
    'مشنو': 'شنوّة',
    'مشنوا': 'شنوّة',
    'شنوه': 'شنوّة',
    'نخامو': 'نخمّوا',
    'نجملو': 'ننجّموا',
    'ناملو': 'نعملوا',
    'نحابو': 'نحبّوا',
    'يثيعوا': 'يضيعوا',
    'مهمش': 'موش',
    'نحبه': 'نحبّوا',
    'حطيك صح': 'نعطيك صحّة',
    'بنزيدو': 'ونزيدوا',
    'ديونار': 'دينار',
    'ديانار': 'دينار',
}

def fix_arabized_french(text: str) -> str:
    """Post-process transcription to fix French words incorrectly written in Arabic
    
    This catches cases where Whisper wrote French business terms in Arabic script.
    """
    result = text
    corrections_made = []
    
    for arabic_form, french_form in ARABIZED_FRENCH_MAP.items():
        if arabic_form in result:
            result = result.replace(arabic_form, french_form)
            corrections_made.append(f"{arabic_form} → {french_form}")
    
    if corrections_made:
        print(f"  [post-fix] Corrected arabized French: {', '.join(corrections_made[:5])}{'...' if len(corrections_made) > 5 else ''}")
    
    return result

def fix_derja_spelling(text: str) -> str:
    """Normalize Tunisian Derja spelling variations from ASR output.
    
    Maps phonetic/noisy ASR spellings to clean Derja.
    Does NOT translate to French or MSA - keeps authentic Tunisian dialect.
    """
    result = text
    corrections_made = []
    
    for noisy_form, clean_form in DERJA_POSTPROCESS_MAP.items():
        if noisy_form in result:
            result = result.replace(noisy_form, clean_form)
            corrections_made.append(f"{noisy_form} → {clean_form}")
    
    if corrections_made:
        print(f"  [post-fix] Normalized Derja: {', '.join(corrections_made[:5])}{'...' if len(corrections_made) > 5 else ''}")
    
    return result

def detect_romanization(text: str) -> bool:
    """Detect if text appears to be romanized Arabic (Arabizi)
    
    Heuristics:
    - Very few Arabic chars but text is non-trivial
    - Contains common romanization patterns: ch, kh, gh, sh, ou, aa, 3, 7, 9
    """
    if len(text.strip()) < 20:
        return False
    
    arabic_count = count_arabic_chars(text)
    # If we have substantial Arabic, it's not romanized
    if arabic_count > len(text) * 0.1:
        return False
    
    # Check for Arabizi markers
    text_lower = text.lower()
    arabizi_patterns = ['ch', 'kh', 'gh', 'sh', 'ou', 'aa', "'", '3', '7', '9']
    marker_count = sum(text_lower.count(p) for p in arabizi_patterns)
    
    # If many markers and few Arabic chars, likely romanized
    return marker_count >= 5 and arabic_count < 10

# === POST-PROCESSING FOR TRANSLATION LAYER ===

def split_script_boundaries(text: str) -> str:
    """Insert space at Arabic↔Latin/digit boundaries when fused.
    
    e.g., "le coûtنتكست" -> "le coût نتكست"
    """
    # Arabic Unicode range: \u0600-\u06FF (basic), \u0750-\u077F (supplement)
    # Also include Arabic presentation forms: \uFB50-\uFDFF, \uFE70-\uFEFF
    arabic_pattern = r'[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]'
    latin_digit_pattern = r'[A-Za-z0-9]'
    
    # Insert space: Latin/digit followed by Arabic
    text = re.sub(f'({latin_digit_pattern})({arabic_pattern})', r'\1 \2', text)
    # Insert space: Arabic followed by Latin/digit
    text = re.sub(f'({arabic_pattern})({latin_digit_pattern})', r'\1 \2', text)
    
    return text

def fix_common_fr_hybrids(text: str) -> tuple[str, int, int]:
    """Fix known corrupted French/Arabic hybrid tokens.
    
    Returns: (fixed_text, contexte_fixes, presentiel_fixes)
    """
    contexte_fixes = 0
    presentiel_fixes = 0
    
    # Fix "نتكست" -> "contexte"
    pattern_contexte = r'\bنتكست\b'
    contexte_fixes = len(re.findall(pattern_contexte, text))
    text = re.sub(pattern_contexte, 'contexte', text)
    
    # Fix various forms of corrupted "présentiel"
    # Forms: "prix زانسيل", "prixزانسيل", "prix ازانسيال", "prixازانسيال"
    patterns_presentiel = [
        r'\bprix\s*زانسيل\b',
        r'\bprix\s*ازانسيال\b',
        r'\bبريزانسيال\b',
        r'\bبريزانسيل\b',
    ]
    for pattern in patterns_presentiel:
        matches = len(re.findall(pattern, text, re.IGNORECASE))
        presentiel_fixes += matches
        text = re.sub(pattern, 'présentiel', text, flags=re.IGNORECASE)
    
    return text, contexte_fixes, presentiel_fixes

def postprocess_transcript(text: str) -> tuple[str, int, int]:
    """Run all post-processing steps for translation layer.
    
    Returns: (processed_text, contexte_fixes, presentiel_fixes)
    """
    # Step 1: Split script boundaries
    text = split_script_boundaries(text)
    
    # Step 2: Fix known French hybrids
    text, contexte_fixes, presentiel_fixes = fix_common_fr_hybrids(text)
    
    # Step 3: Collapse repeated spaces
    text = re.sub(r' +', ' ', text)
    
    return text, contexte_fixes, presentiel_fixes

def detect_language_mix(text: str, detected_language: str) -> str:
    """Detect rough language mix profile for post-cleaning strategy."""
    if not text.strip():
        return "unknown"

    arabic_chars = len(re.findall(r'[\u0600-\u06FF]', text))
    latin_chars = len(re.findall(r'[A-Za-zÀ-ÿ]', text))
    total = max(1, arabic_chars + latin_chars)
    ar_ratio = arabic_chars / total
    lat_ratio = latin_chars / total

    if ar_ratio > 0.55 and lat_ratio > 0.25:
        return "derja_fr_mix"
    if ar_ratio >= 0.6 or detected_language == 'ar':
        return "ar_dominant"
    if lat_ratio >= 0.7 or detected_language == 'fr':
        return "fr_dominant"
    return "mixed"

def apply_cleaning_profile(text: str, profile: str) -> tuple[str, List[dict]]:
    """Apply language-profile-based cleanup and return applied diff summary."""
    cleaned = text
    diff: List[dict] = []

    def apply(pattern: str, repl: str, flags=0):
        nonlocal cleaned
        count = len(re.findall(pattern, cleaned, flags))
        if count > 0:
            cleaned = re.sub(pattern, repl, cleaned, flags=flags)
            diff.append({"before": pattern, "after": repl, "count": count})

    # Common cleanup for all profiles
    apply(r'\b(uh|um|euh|heu|hmm|mmm)\b(?:\s+\1\b)+', r'\1', flags=re.IGNORECASE)
    apply(r'\b(يا|يعني)\b(?:\s+\1\b)+', r'\1')
    apply(r'\b(\w+)\s+\1\s+\1\b', r'\1 \1')
    apply(r'\s{2,}', ' ')

    if profile in ("derja_fr_mix", "mixed"):
        apply(r'\bmerci\s+beaucoup\s+beaucoup\b', 'merci beaucoup', flags=re.IGNORECASE)
        apply(r'\bvoila\b', 'voilà', flags=re.IGNORECASE)
        apply(r'\bInchallah\b', 'إن شاء الله', flags=re.IGNORECASE)
    elif profile == "fr_dominant":
        apply(r'\bcest\b', "c'est", flags=re.IGNORECASE)
        apply(r'\bca\b', 'ça', flags=re.IGNORECASE)
    elif profile == "ar_dominant":
        apply(r'\bان شاء الله\b', 'إن شاء الله')
        apply(r'\bهاذا\b', 'هذا')

    cleaned = cleaned.strip()
    return cleaned, diff

def compute_segment_confidence(seg) -> float:
    """Heuristic confidence score (0-100) from faster-whisper segment signals."""
    avg_logprob = float(getattr(seg, 'avg_logprob', -1.2) or -1.2)
    no_speech_prob = float(getattr(seg, 'no_speech_prob', 0.0) or 0.0)
    compression_ratio = float(getattr(seg, 'compression_ratio', 1.0) or 1.0)

    # Logistic mapping around typical logprob values
    base = 100.0 / (1.0 + math.exp(-3.5 * (avg_logprob + 1.1)))
    penalty_ns = no_speech_prob * 35.0
    penalty_comp = max(0.0, (compression_ratio - 2.0) * 12.0)
    conf = max(0.0, min(100.0, base - penalty_ns - penalty_comp))
    return round(conf, 1)

@app.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: str = Query("auto", description="[deprecated] Use 'mode' instead. Language: auto, ar, or fr"),
    mode: str = Query("bilingual", description="Mode: bilingual (best for FR+Derja), auto, force_ar, force_fr"),
    diarize: str = Query("0", description="Diarization (ignored for now)")
):
    """Transcribe uploaded audio file
    
    mode parameter (preferred):
    - bilingual: Best for French + Derja code-switching (keeps French Latin, Derja Arabic)
    - auto: Auto-detect, retry with Arabic if romanization detected
    - force_ar: Force Arabic script (all text in Arabic)
    - force_fr: Force French/Latin (Derja gets romanized - avoid)
    """
    global whisper_model, fallback_applied  # For OOM fallback reloading
    if not whisper_model:
        raise HTTPException(status_code=503, detail="Model not loaded")

    # Validate file size
    if file.size and file.size > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE_MB}MB"
        )

    # Validate content type
    if file.content_type not in SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format: {file.content_type}. Supported: {', '.join(SUPPORTED_FORMATS)}"
        )

    # Check ffmpeg availability
    if not check_ffmpeg():
        os_name = os.name
        if os_name == 'nt':  # Windows
            install_cmd = "winget install ffmpeg"
        elif os_name == 'posix':
            try:
                # Check if macOS
                import platform
                if platform.system() == 'Darwin':
                    install_cmd = "brew install ffmpeg"
                else:
                    install_cmd = "sudo apt install ffmpeg"
            except:
                install_cmd = "sudo apt install ffmpeg"
        else:
            install_cmd = "Install ffmpeg for your system"

        raise HTTPException(
            status_code=500,
            detail=f"ffmpeg not found. Install with: {install_cmd}"
        )

    start_time = time.time()
    temp_input = None
    temp_wav = None

    try:
        # Create temp files
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename or 'audio').suffix) as temp_input_file:
            temp_input = temp_input_file.name
            # Read file content first (async file object can't be read in thread)
            file_content = await file.read()
            temp_input_file.write(file_content)

        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_wav_file:
            temp_wav = temp_wav_file.name

        # Convert audio to WAV
        convert_start = time.time()
        convert_audio_to_wav(temp_input, temp_wav)
        convert_time = time.time() - convert_start

        # Log request details
        file_size_mb = os.path.getsize(temp_input) / (1024 * 1024)
        print(f"Processing: {file.filename} ({file_size_mb:.1f}MB, {file.content_type})")

        # Transcribe
        transcribe_start = time.time()

        # Map mode parameter (mode wins over deprecated language param)
        # CRITICAL: For Tunisian Derja + French, allow code-switching
        effective_mode = mode if mode not in ("auto",) else language
        prompt_override = None
        if effective_mode == "force_ar":
            whisper_language = "ar"
        elif effective_mode == "force_fr":
            whisper_language = "fr"
        elif effective_mode in ("ar", "fr"):
            whisper_language = effective_mode
        elif effective_mode == "bilingual":
            # Force Arabic but steer Darja + French via prompt
            whisper_language = "ar"
            prompt_override = BILINGUAL_INITIAL_PROMPT
        else:
            whisper_language = "ar"  # Default to Arabic for Tunisian content
        
        mode_used = effective_mode
        romanization_retry = False
        
        # Log settings being used
        print(f"  Settings: mode={mode_used}, whisper_lang={whisper_language or 'auto'}")
        prompt_to_log = prompt_override or INITIAL_PROMPT_EFFECTIVE
        print(f"  Prompt ({len(prompt_to_log)} chars): {prompt_to_log[:60]}...")

        # Run transcription in a thread pool to avoid blocking the async event loop.
        # This keeps the server responsive (health checks, etc.) during long transcriptions.
        def _run_transcription():
            """Synchronous transcription + segment collection (runs in thread pool)"""
            segs, inf = do_transcription(temp_wav, whisper_language, prompt_override)
            
            # IMPORTANT: Consume the generator here (in the thread) because
            # faster-whisper returns a lazy generator - actual GPU work happens during iteration
            full = ""
            seg_list = []
            for seg in segs:
                seg_conf = compute_segment_confidence(seg)
                seg_list.append(Segment(
                    start=round(seg.start, 2),
                    end=round(seg.end, 2),
                    text=seg.text.strip(),
                    confidence=seg_conf,
                    low_confidence=seg_conf < 55.0,
                ))
                full += seg.text
            return full, seg_list, inf
        
        try:
            loop = asyncio.get_event_loop()
            full_text, segment_list, info = await loop.run_in_executor(
                None,  # Default thread pool
                _run_transcription
            )
        except RuntimeError as e:
            if "out of memory" in str(e).lower() and not fallback_applied and model_info["device"] == "cuda":
                print(f"CUDA OOM during transcription, applying fallback to int8_float16...")
                fallback_applied = True
                
                # Reload model with fallback compute type
                try:
                    whisper_model = WhisperModel(
                        model_info["effective_model"],
                        device=model_info["device"],
                        compute_type="int8_float16",
                        num_workers=1,
                        download_root=None,
                        local_files_only=False,
                        cpu_threads=0,
                    )
                    
                    # Update model info
                    model_info["compute_type"] = "int8_float16"
                    model_info["fallback_applied"] = True
                    
                    print("✓ Model reloaded with int8_float16 fallback, retrying transcription...")
                    
                    # Retry transcription with new model in thread pool
                    full_text, segment_list, info = await loop.run_in_executor(
                        None, _run_transcription
                    )
                    
                except Exception as fallback_e:
                    print(f"✗ Fallback transcription also failed: {str(fallback_e)}")
                    raise RuntimeError(f"Transcription failed even with fallback: {str(fallback_e)}")
            else:
                raise

        # === POST-PROCESSING: Fix arabized French words ===
        original_text = full_text
        full_text = fix_arabized_french(full_text)
        
        # === POST-PROCESSING: Normalize Derja spelling ===
        derja_fixes = sum(1 for k in DERJA_POSTPROCESS_MAP if k in original_text)
        full_text = fix_derja_spelling(full_text)
        
        # Also fix in segments
        for seg in segment_list:
            seg.text = fix_arabized_french(seg.text)
            seg.text = fix_derja_spelling(seg.text)
        
        if original_text != full_text:
            print(f"  [postprocess] French restorations + Derja normalizations applied ({derja_fixes} potential Derja fixes)")

        # === ROMANIZATION AUTO-RETRY ===
        # If mode=auto and text appears romanized, retry with force_ar
        if mode_used == "auto" and whisper_language is None and detect_romanization(full_text):
            original_arabic_count = count_arabic_chars(full_text)
            print(f"  [auto-fix] Romanization detected ({original_arabic_count} Arabic chars), retrying with force_ar...")
            
            try:
                def _run_retry_transcription():
                    segs_ar, inf_ar = do_transcription(temp_wav, "ar")
                    full_ar = ""
                    seg_list_ar = []
                    for seg in segs_ar:
                        seg_conf = compute_segment_confidence(seg)
                        seg_list_ar.append(Segment(
                            start=round(seg.start, 2),
                            end=round(seg.end, 2),
                            text=seg.text.strip(),
                            confidence=seg_conf,
                            low_confidence=seg_conf < 55.0,
                        ))
                        full_ar += seg.text
                    return full_ar, seg_list_ar, inf_ar
                
                full_text_ar, segment_list_ar, info_ar = await loop.run_in_executor(
                    None, _run_retry_transcription
                )
                
                retry_arabic_count = count_arabic_chars(full_text_ar)
                
                # Use retry result if it has more Arabic characters
                if retry_arabic_count > original_arabic_count:
                    print(f"  [auto-fix] Retry successful: {retry_arabic_count} Arabic chars (was {original_arabic_count})")
                    full_text = full_text_ar
                    segment_list = segment_list_ar
                    info = info_ar
                    romanization_retry = True
                else:
                    print(f"  [auto-fix] Retry not better: {retry_arabic_count} Arabic chars (was {original_arabic_count}), keeping original")
                    
            except Exception as retry_e:
                print(f"  [auto-fix] Retry failed: {str(retry_e)}, keeping original")

        transcribe_time = time.time() - transcribe_start
        total_time = time.time() - start_time

        # Log completion with all relevant details
        print(f"Completed: convert={convert_time:.1f}s, transcribe={transcribe_time:.1f}s, total={total_time:.1f}s")
        print(f"  Detected language: {info.language or 'unknown'}")
        print(f"  Romanization retry: {romanization_retry}")
        print(f"  Arabic chars in output: {count_arabic_chars(full_text)}")

        raw_text = full_text.strip()

        # === FINAL POST-PROCESSING FOR TRANSLATION LAYER ===
        full_text, ctx_fixes, pres_fixes = postprocess_transcript(full_text)

        cleaning_profile = detect_language_mix(full_text, info.language or "unknown")
        full_text, profile_diff = apply_cleaning_profile(full_text, cleaning_profile)

        # Also apply to each segment for consistency
        for seg in segment_list:
            seg.text, _, _ = postprocess_transcript(seg.text)
            seg.text, _seg_profile_diff = apply_cleaning_profile(seg.text, cleaning_profile)
        print(f"  [postprocess] boundaries fixed, contexte fixes={ctx_fixes}, présentiel fixes={pres_fixes}")

        low_conf_count = sum(1 for seg in segment_list if seg.low_confidence)

        cleaning_diff: List[CleaningChange] = [
            CleaningChange(before="contexte_hybrid_fix", after="contexte", count=ctx_fixes),
            CleaningChange(before="présentiel_hybrid_fix", after="présentiel", count=pres_fixes),
        ]
        for item in profile_diff:
            cleaning_diff.append(
                CleaningChange(before=str(item.get("before", "")), after=str(item.get("after", "")), count=int(item.get("count", 0)))
            )
        cleaning_diff = [c for c in cleaning_diff if c.count > 0]

        return TranscriptionResponse(
            text=full_text.strip(),
            raw_text=raw_text,
            cleaned_text=full_text.strip(),
            detected_language=info.language or "unknown",
            cleaning_profile=cleaning_profile,
            cleaning_diff=cleaning_diff,
            low_confidence_count=low_conf_count,
            segments=segment_list,
            timing=Timing(
                decode_ms=round(convert_time * 1000, 1),
                transcribe_ms=round(transcribe_time * 1000, 1),
                total_ms=round(total_time * 1000, 1)
            ),
            settings={
                "model": model_info["model"],
                "variant": model_info.get("variant", "base"),
                "finetuned_repo": model_info.get("finetuned_repo"),
                "device": model_info["device"],
                "compute_type": model_info["compute_type"],
                "beam_size": model_info["beam_size"],
                "vad_filter": model_info["vad_filter"],
                "mode_used": mode_used,
                "romanization_retry": romanization_retry,
                "fallback_applied": model_info.get("fallback_applied", False)
            }
        )

    except Exception as e:
        error_msg = f"Transcription failed: {str(e)}"
        print(f"Error: {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)

    finally:
        # Cleanup temp files
        for temp_file in [temp_input, temp_wav]:
            if temp_file and os.path.exists(temp_file):
                try:
                    os.unlink(temp_file)
                except:
                    pass

# =============================================================================
# Gemini Analysis Endpoint (using official google-genai SDK)
# =============================================================================

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

class AnalyzeRequest(BaseModel):
    transcript: str
    duration_minutes: int = 0

class AnalyzeResponse(BaseModel):
    summary: str
    sales_stage: str
    sentiment: str
    objections: List[str]
    risks: List[str]
    next_actions: List[str]
    key_topics: List[str]
    win_probability: int
    confidence: int

def build_gemini_prompt(transcript: str, duration_minutes: int) -> str:
    """Build the analysis prompt for Gemini.
    Mirrors the same B2B sales methodology used in the French keyword-based analysis."""
    return f"""Tu es un expert en analyse de réunions commerciales B2B. Tu analyses des transcriptions de réunions qui peuvent être en **arabe tunisien (derja)**, en **français**, ou un **mélange des deux** (code-switching tunisien/français).

Tu dois analyser la transcription suivante et retourner une analyse structurée en JSON.

## Méthodologie des étapes de vente

Les étapes de vente suivent ce pipeline commercial :

1. **contact_visits** : Premier contact, découverte du client, introduction, présentation initiale. Le commercial identifie le client et ses besoins, planifie les visites/réunions/appels, analyse la vision du client et la concurrence.

2. **value_proposition** : Présentation de la proposition de valeur, discussion des besoins, démonstration de la solution, mise en avant des avantages et bénéfices. Le commercial crée une proposition de valeur personnalisée et étudie les offres des concurrents.

3. **offer_negotiation** : Discussion sur les prix, coûts, budget, négociation des termes et conditions du contrat, remises. Le commercial rédige une offre détaillée et prévoit les objections possibles.

4. **closing** : Finalisation de l'accord, signature, décision, validation, confirmation. Le commercial met tout son poids pour conclure et utilise toutes les relations pour accélérer le processus.

5. **closed_lost** : Le deal est perdu - le client a choisi la concurrence, a refusé, n'est pas intéressé, ou a rencontré des problèmes.

## Analyse du sentiment

- **positive** : Le client est enthousiaste, convaincu, satisfait, d'accord
- **neutral** : Le client est réservé, pose des questions, demande des clarifications
- **negative** : Le client exprime des refus, des préoccupations fortes, des doutes majeurs

## Catégories d'objections à détecter

- Préoccupations sur le coût/prix
- Questions sur les délais
- Concurrence déjà présente
- Doutes sur l'intégration technique
- Processus de décision interne
- Manque de confiance/crédibilité

## Transcription à analyser

Durée de la réunion : {duration_minutes} minutes

\"\"\"
{transcript}
\"\"\"

## Format de réponse attendu

Réponds UNIQUEMENT avec un objet JSON valide (sans markdown, sans ```json, sans commentaires) avec cette structure exacte :

{{{{
  "summary": "Résumé concis de la réunion en français (2-3 phrases)",
  "sales_stage": "contact_visits | value_proposition | offer_negotiation | closing | closed_lost",
  "sentiment": "positive | neutral | negative",
  "objections": ["Liste des objections détectées en français"],
  "risks": ["Liste des risques identifiés en français"],
  "next_actions": ["Liste des prochaines actions recommandées en français"],
  "key_topics": ["Liste des sujets clés abordés en français"],
  "win_probability": 0-100,
  "confidence": 0-100
}}}}

Règles importantes :
- Toutes les valeurs textuelles doivent être en **français**
- win_probability : probabilité de conclure le deal (0-100), basée sur l'étape de vente, le sentiment et les objections
- confidence : niveau de confiance dans l'analyse (0-100), basé sur la quantité et la qualité des informations disponibles
- Si la transcription est courte ou manque de contexte, ajuste la confidence en conséquence
- Détecte l'étape de vente même si la conversation est en arabe tunisien
- Les objections, risques et actions doivent être spécifiques au contenu de la réunion, pas génériques"""


def parse_gemini_response(response_text: str) -> dict:
    """Parse and validate the Gemini JSON response."""
    clean_text = response_text.strip()
    # Strip markdown code fences if present
    if clean_text.startswith('```json'):
        clean_text = clean_text[7:]
    elif clean_text.startswith('```'):
        clean_text = clean_text[3:]
    if clean_text.endswith('```'):
        clean_text = clean_text[:-3]
    clean_text = clean_text.strip()

    # Try to extract JSON object if there's surrounding text
    if not clean_text.startswith('{'):
        start = clean_text.find('{')
        if start != -1:
            clean_text = clean_text[start:]
    if not clean_text.endswith('}'):
        end = clean_text.rfind('}')
        if end != -1:
            clean_text = clean_text[:end + 1]

    try:
        parsed = json.loads(clean_text)
    except json.JSONDecodeError as e:
        print(f"[Gemini] JSON parse error: {e}")
        print(f"[Gemini] Text that failed to parse (first 1000 chars):\n{clean_text[:1000]}")
        raise

    valid_stages = ['contact_visits', 'value_proposition', 'offer_negotiation', 'closing', 'closed_lost']
    valid_sentiments = ['positive', 'neutral', 'negative']

    return {
        "summary": str(parsed.get("summary", "Analyse non disponible")),
        "sales_stage": parsed.get("sales_stage") if parsed.get("sales_stage") in valid_stages else "value_proposition",
        "sentiment": parsed.get("sentiment") if parsed.get("sentiment") in valid_sentiments else "neutral",
        "objections": parsed.get("objections", []) if isinstance(parsed.get("objections"), list) else [],
        "risks": parsed.get("risks", []) if isinstance(parsed.get("risks"), list) else [],
        "next_actions": parsed.get("next_actions", []) if isinstance(parsed.get("next_actions"), list) else [],
        "key_topics": parsed.get("key_topics", []) if isinstance(parsed.get("key_topics"), list) else [],
        "win_probability": max(0, min(100, int(parsed.get("win_probability", 50)))),
        "confidence": max(0, min(100, int(parsed.get("confidence", 50)))),
    }


@app.get("/analyze/health")
async def analyze_health():
    """Check if Gemini API key is configured"""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    return {
        "configured": bool(api_key),
        "model": GEMINI_MODEL,
    }


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_transcript(request: AnalyzeRequest):
    """Analyze a meeting transcript using Google Gemini API (official SDK).
    
    The GEMINI_API_KEY must be set in the .env file.
    Supports transcriptions in Tunisian Arabic (Derja), French, or mixed.
    """
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY not configured. Add it to local-whisper/.env"
        )

    if not request.transcript.strip():
        raise HTTPException(status_code=400, detail="Transcript is empty")

    prompt = build_gemini_prompt(request.transcript, request.duration_minutes)

    print(f"[Gemini] Analyzing with {GEMINI_MODEL} ({len(request.transcript)} chars, {request.duration_minutes} min)...")
    start_time = time.time()

    try:
        # Use official Google GenAI SDK
        client = genai.Client(api_key=api_key)

        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.3,
                top_p=0.8,
                top_k=40,
                max_output_tokens=4096,
                response_mime_type="application/json",
            ),
        )

        # Debug: log raw response details
        print(f"[Gemini] Response candidates: {len(response.candidates) if response.candidates else 0}")
        if response.candidates:
            candidate = response.candidates[0]
            finish_reason = candidate.finish_reason if hasattr(candidate, 'finish_reason') else 'unknown'
            print(f"[Gemini] Finish reason: {finish_reason}")
            if hasattr(candidate, 'content') and candidate.content and candidate.content.parts:
                raw_text = candidate.content.parts[0].text
                print(f"[Gemini] Raw text length: {len(raw_text) if raw_text else 0}")
                print(f"[Gemini] Raw text (first 500 chars): {raw_text[:500] if raw_text else 'NONE'}")
            else:
                print(f"[Gemini] No content parts in candidate")

        response_text = response.text
        if not response_text:
            print(f"[Gemini] response.text is empty/None")
            raise HTTPException(status_code=502, detail="Empty response from Gemini")

        elapsed = time.time() - start_time
        print(f"[Gemini] Response received in {elapsed:.1f}s, parsing...")

        result = parse_gemini_response(response_text)

        print(f"[Gemini] Analysis complete: stage={result['sales_stage']}, "
              f"sentiment={result['sentiment']}, win={result['win_probability']}%")

        return AnalyzeResponse(**result)

    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        print(f"[Gemini] JSON decode error: {e}")
        raise HTTPException(status_code=502, detail="Failed to parse Gemini response as JSON")
    except Exception as e:
        error_msg = str(e)
        print(f"[Gemini] Exception type: {type(e).__name__}, Error: {error_msg}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=f"Gemini API error: {error_msg}")


if __name__ == "__main__":
    # When running directly (python app.py), support --variant, --finetuned-repo, --hf-token
    # These are parsed by parse_cli_args() at import time
    print(f"Starting with variant={cli_args.variant or os.getenv('WHISPER_VARIANT', 'base')}")
    uvicorn.run(
        "app:app",
        host="127.0.0.1",
        port=9000,
        reload=False,
        log_level="info"
    )