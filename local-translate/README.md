# Local NLLB-200 Translation Service

Offline Arabic→French translation service using Meta's NLLB-200 model, optimized for Tunisian Arabic (aeb_Arab) with French code-switching support.

## Features

- **Offline Translation**: No internet required after model download
- **GPU Accelerated**: CUDA support with float16 for fast inference
- **Code-Switch Aware**: Preserves French text unchanged, only translates Arabic
- **Segment Mode**: Splits text into sentences, translates only Arabic portions
- **LRU Caching**: Avoids re-translating identical segments
- **FastAPI Server**: REST API with health checks and timing metrics

## Prerequisites

### System Requirements
- Python 3.8+
- NVIDIA GPU with CUDA support (optional, CPU fallback available)
- ~3GB disk space for model
- ~4GB GPU VRAM (or ~6GB RAM for CPU)

### GPU Setup (Optional)
If using GPU, ensure CUDA is installed:
```bash
nvidia-smi  # Verify GPU is detected
```

## Installation

### 1. Create Virtual Environment

**Windows:**
```bash
cd local-translate
python -m venv .venv
.venv\Scripts\activate
```

**macOS/Linux:**
```bash
cd local-translate
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install PyTorch

**With CUDA (GPU):**
```bash
pip install torch --index-url https://download.pytorch.org/whl/cu126
```

**CPU Only:**
```bash
pip install torch
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure Environment (Optional)
```bash
cp .env.example .env
# Edit .env if needed
```

## Running the Service

### Start Server
```bash
# Windows
.venv\Scripts\activate
uvicorn app:app --host 127.0.0.1 --port 9100

# macOS/Linux
source .venv/bin/activate
uvicorn app:app --host 127.0.0.1 --port 9100
```

First run will download the NLLB-200 model (~2.4GB).

### Expected Output
```
============================================================
NLLB-200 TRANSLATION SERVICE
  Device: cuda
  Compute type: float16
  GPU: NVIDIA GeForce RTX 4070 Laptop GPU
============================================================
Loading model: facebook/nllb-200-distilled-600M
✓ Model loaded successfully on cuda with float16
INFO:     Uvicorn running on http://127.0.0.1:9100
```

## API Usage

### Health Check
```bash
curl http://127.0.0.1:9100/health
```

Response:
```json
{
  "ok": true,
  "model": "facebook/nllb-200-distilled-600M",
  "device": "cuda",
  "compute_type": "float16",
  "default_source": "aeb_Arab",
  "default_target": "fra_Latn",
  "cache_size": 1000
}
```

### Translate Text

**Segment Mode (Default)** - Preserves French, translates Arabic:
```bash
curl -X POST http://127.0.0.1:9100/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Le budget متاعنا c'\''est combien؟ نحكيو على le projet الجديد.",
    "target_lang": "fra_Latn",
    "mode": "segment"
  }'
```

Response:
```json
{
  "text": "Le budget notre c'est combien? Parlons du le projet nouveau.",
  "segments": [
    {"input": "Le budget", "output": "Le budget", "translated": false, "arabic_chars": 0},
    {"input": "متاعنا", "output": "notre", "translated": true, "arabic_chars": 6},
    {"input": "c'est combien؟", "output": "c'est combien?", "translated": false, "arabic_chars": 0},
    {"input": "نحكيو على", "output": "Parlons du", "translated": true, "arabic_chars": 8},
    {"input": "le projet", "output": "le projet", "translated": false, "arabic_chars": 0},
    {"input": "الجديد.", "output": "nouveau.", "translated": true, "arabic_chars": 6}
  ],
  "timing": {"ms_total": 145.2},
  "stats": {"total_segments": 6, "translated": 3, "passthrough": 3}
}
```

**Full Mode** - Translates entire text:
```bash
curl -X POST http://127.0.0.1:9100/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "كيفاش الحال؟ شنوة أخبارك؟",
    "target_lang": "fra_Latn",
    "mode": "full"
  }'
```

### Cache Management
```bash
# View cache stats
curl http://127.0.0.1:9100/cache-info

# Clear cache
curl -X POST http://127.0.0.1:9100/clear-cache
```

## Language Codes

| Code | Language |
|------|----------|
| `aeb_Arab` | Tunisian Arabic (source) |
| `fra_Latn` | French (target) |
| `eng_Latn` | English (target) |

## Configuration

Edit `.env` file:

```bash
# Device selection
TRANSLATE_DEVICE=cuda    # Use GPU
TRANSLATE_DEVICE=cpu     # Use CPU only
```

## Troubleshooting

### CUDA Out of Memory
```
RuntimeError: CUDA out of memory
```
**Solution:** Use CPU mode: `TRANSLATE_DEVICE=cpu`

### Model Download Issues
**Solution:** Ensure internet connection for first run, or pre-download:
```python
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
AutoTokenizer.from_pretrained("facebook/nllb-200-distilled-600M")
AutoModelForSeq2SeqLM.from_pretrained("facebook/nllb-200-distilled-600M")
```

### Slow on CPU
**Solution:** CPU inference is ~10x slower than GPU. Consider:
- Using a smaller batch of text
- Pre-translating common phrases
- Using GPU if available

## Performance Benchmarks

| Device | Model | Speed |
|--------|-------|-------|
| RTX 4070 | distilled-600M | ~100-200ms per segment |
| CPU (i7) | distilled-600M | ~1-2s per segment |

## Integration

This service is designed to work with the Meeting Insights Hub:

1. After Whisper transcription produces Arabic+French text
2. Send to `/translate` with `mode=segment`
3. Arabic portions are translated to French
4. French portions are preserved unchanged
5. Result is clean French text for analysis

## End-to-End Dev Checklist

Use this checklist to verify the complete transcription + translation pipeline:

### 1. Start Services

```bash
# Terminal 1: Whisper server (port 9000)
cd local-whisper
.venv\Scripts\activate
uvicorn app:app --host 127.0.0.1 --port 9000

# Terminal 2: Translation server (port 9100)
cd local-translate
.venv\Scripts\activate
uvicorn app:app --host 127.0.0.1 --port 9100

# Terminal 3: Web app
npm run dev
```

### 2. Verify Services

```bash
# Health checks
curl http://127.0.0.1:9000/health   # Whisper
curl http://127.0.0.1:9100/health   # Translate
```

### 3. Record Test Meeting

1. Open http://localhost:8080 in browser
2. Go to "Record" page
3. Record a **60-120 second** test meeting
4. Mix French and Tunisian Arabic (code-switching):
   - Start in French: "Bonjour, on va discuter du projet CRM"
   - Switch to Derja: "شنوة رأيك في الميزانية متاعنا؟"
   - Mix: "Le déploiement باش يكون في mars"

### 4. Verify Results

Check browser console (F12) for these logs:

```
[Transcription] Raw length: 523 chars, Translated length: 498 chars
[Transcription] Translation time: 1245 ms
[Transcription] Raw sample: "Bonjour, on va discuter شنوة رأيك..."
[Transcription] Translated sample: "Bonjour, on va discuter quel est votre avis..."
```

**Expected behavior:**

| Check | Expected Result |
|-------|----------------|
| Raw transcript | Contains Arabic script (شنوة، متاعنا، باش) + French |
| Translated transcript | Mostly French, Arabic translated |
| French preservation | French parts unchanged (not retranslated) |
| Domain terms | API, CRM, SLA stay uppercase |
| Translation time | <2s on GPU, <10s on CPU |

### 5. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| No Arabic in raw | Whisper didn't detect Arabic | Check `mode=bilingual` in API call |
| Arabic still in translated | Translation service down | Check port 9100 health |
| French retranslated | Using `mode=full` | Use `mode=segment` |
| Slow translation | CPU mode | Enable CUDA in .env |

## License

Apache 2.0 (same as NLLB-200 model)
