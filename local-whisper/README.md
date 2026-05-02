# Local Whisper Transcription Service

Offline speech-to-text service using faster-whisper, optimized for RTX 4070 laptop GPU with Tunisian dialect and French code-switching support.

## Features

- **GPU Optimized**: CUDA acceleration for RTX 4070
- **Multi-language**: Automatic detection with Tunisian Arabic/French bias
- **Business Vocabulary**: Built-in prompts for sales meetings
- **Audio Format Support**: WebM (Opus), WAV, MP3, M4A
- **FastAPI Server**: REST API with health checks and timing metrics
- **Robust Fallbacks**: Automatic CUDA OOM recovery

## Prerequisites

### System Requirements
- Python 3.8+
- NVIDIA GPU with CUDA support (RTX 4070 recommended)
- ffmpeg for audio conversion

### GPU Setup (Windows)
1. Install CUDA Toolkit 12.1: https://developer.nvidia.com/cuda-12-1-0-download-archive
2. Install cuDNN 8.9.2: https://developer.nvidia.com/cudnn
3. Verify installation:
   ```bash
   nvidia-smi
   nvcc --version
   ```

### GPU Setup (macOS/Linux)
- macOS: Metal acceleration (built-in)
- Linux: Follow NVIDIA CUDA installation guide

## Installation

### 1. Clone and Setup
```bash
cd local-whisper
```

### 2. Create Virtual Environment

**Windows:**
```bash
python -m venv .venv
.venv\Scripts\activate
```

**macOS/Linux:**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Install ffmpeg

**Windows:**
```bash
winget install ffmpeg
# OR download from https://ffmpeg.org/download.html
```

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install ffmpeg
```

### 5. Configure Environment
```bash
cp .env.example .env
# Edit .env with your preferences (defaults are optimized for RTX 4070)
```

## Configuration

Edit `.env` file:

```bash
# Model variant: base or finetuned
WHISPER_VARIANT=base              # Use standard whisper model
# WHISPER_VARIANT=finetuned       # Use your fine-tuned model

# Model size (quality vs speed vs VRAM) - used when WHISPER_VARIANT=base
WHISPER_MODEL=large-v3        # Best quality, ~8GB VRAM
# WHISPER_MODEL=medium        # Good quality, ~3GB VRAM (fallback)

# Fine-tuned model from HuggingFace (used when WHISPER_VARIANT=finetuned)
# Can be a HuggingFace repo ID or local path to CTranslate2 model
WHISPER_FINETUNED_REPO=your-username/whisper-large-v3-tunisian

# HuggingFace token for private repos
# Get yours at: https://huggingface.co/settings/tokens
HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxx

# GPU acceleration
WHISPER_DEVICE=cuda           # Use GPU
WHISPER_COMPUTE_TYPE=float16  # Best quality

# Performance tuning
WHISPER_BEAM_SIZE=5          # Higher = better quality, slower
WHISPER_VAD_FILTER=true      # Remove silence
```

### Fine-tuned Model Setup

If you have a fine-tuned Whisper model on HuggingFace:

1. **CTranslate2 format (recommended):** If your model is already converted to CTranslate2 format, just set the repo ID:
   ```bash
   WHISPER_VARIANT=finetuned
   WHISPER_FINETUNED_REPO=your-username/whisper-large-v3-ct2
   HF_TOKEN=hf_your_token_here
   ```

2. **Standard HF Transformers format:** Convert it first, then use the local path:
   ```bash
   # Install conversion tool
   pip install ctranslate2

   # Convert from HF format to CTranslate2
   ct2-faster-whisper-convert --model your-username/whisper-large-v3-tunisian --output_dir ./finetuned-ct2

   # Then in .env:
   WHISPER_VARIANT=finetuned
   WHISPER_FINETUNED_REPO=./finetuned-ct2
   ```

3. **Local path:** You can also point to any local directory with a CTranslate2 model:
   ```bash
   WHISPER_VARIANT=finetuned
   WHISPER_FINETUNED_REPO=D:/models/my-finetuned-whisper
   ```

## Running the Service

### Launch with Base Model (default)
```bash
# Windows
.venv\Scripts\activate
uvicorn app:app --host 127.0.0.1 --port 9000

# macOS/Linux
source .venv/bin/activate
uvicorn app:app --host 127.0.0.1 --port 9000
```

### Launch with Fine-tuned Model

**Option 1: Via .env** (edit once, launch normally)
```bashc 
# Set WHISPER_VARIANT=finetuned in .env, then:
uvicorn app:app --host 127.0.0.1 --port 9000
```

**Option 2: Via CLI args** (quick switch, no .env edit needed)
```bash
# Windows
.venv\Scripts\activate
python app.py --variant finetuned

# With all options
python app.py --variant finetuned --finetuned-repo your-username/model-name --hf-token hf_xxxxx

# macOS/Linux
source .venv/bin/activate
python app.py --variant finetuned
```

### Development Mode (with auto-reload)
```bash
# Base model
uvicorn app:app --host 127.0.0.1 --port 9000 --reload

# Fine-tuned model (set WHISPER_VARIANT=finetuned in .env first)
uvicorn app:app --host 127.0.0.1 --port 9000 --reload
```

> **Tip:** CLI args (`--variant`, `--finetuned-repo`, `--hf-token`) always override `.env` values, making it easy to test different models without editing config files.

## API Usage

### Health Check
```bash
curl http://127.0.0.1:9000/health
```

Response:
```json
{
  "ok": true,
  "model": "large-v3",
  "variant": "base",
  "finetuned_repo": null,
  "device": "cuda",
  "compute_type": "float16",
  "beam_size": 5,
  "vad_filter": true,
  "fallback_applied": false
}
```

When using a fine-tuned model:
```json
{
  "ok": true,
  "model": "large-v3",
  "variant": "finetuned",
  "finetuned_repo": "NederHa/whisper-large-v3-tunisian",
  "device": "cuda",
  "compute_type": "float16",
  "beam_size": 5,
  "vad_filter": true,
  "fallback_applied": false
}
```

### Transcription
```bash
curl -X POST \
  -F "file=@/path/to/audio.webm" \
  -F "language=auto" \
  http://127.0.0.1:9000/transcribe
```

Response:
```json
{
  "text": "Full transcription text...",
  "detected_language": "ar",
  "segments": [
    {
      "start": 0.0,
      "end": 3.2,
      "text": "Hello, this is a test..."
    }
  ],
  "timing": {
    "decode_ms": 1250.5,
    "transcribe_ms": 3450.2,
    "total_ms": 4700.7
  },
  "settings": {
    "model": "large-v3",
    "device": "cuda",
    "compute_type": "float16",
    "beam_size": 5,
    "vad_filter": true,
    "language_mode_used": "auto",
    "fallback_applied": false
  }
}
```

### Test with Sample Audio
```bash
# Create a test audio file (or use your own)
# Then run:
curl -X POST \
  -F "file=@test_audio.webm" \
  http://127.0.0.1:9000/transcribe | jq '.text' | head -c 200
```

### QA Testing Paragraph (Derja + French)

For quality assurance, use this test paragraph that includes Tunisian dialect code-switching:

**Expected transcription:** "Bonjour, je suis intéressé par votre offre. Le prix est de 5000 dinars tunisiens. C'est un bon budget pour notre projet. On va décider ensemble sur les détails du contrat. نقرر نمشي معاك على هالمشروع."

**Audio content:** Record yourself speaking this paragraph naturally, mixing French business terms with Tunisian Arabic pronunciation and local expressions.

### Regression Test: Long Mixed Audio

**CRITICAL**: When modifying transcription settings, always test with 5+ minute recordings that include real French/Derja code-switching to verify:

1. **French phrases stay in Latin script** (e.g., "C'est bon", "le budget")
2. **Derja/Arabic phrases stay in Arabic script** (e.g., "نشوفو", "إن شاء الله")
3. **No drift into full French translation** on long recordings
4. **No repetitive loops** or hallucinations

Key settings that affect code-switching:
- `condition_on_previous_text=False` - Prevents language lock-in on long audio
- Short neutral prompt - Avoids biasing Whisper toward French
- `task="transcribe"` - Never use "translate"

## Language Support

- **auto**: Automatic detection (recommended for code-switching)
- **ar**: Arabic (with Tunisian dialect bias)
- **fr**: French

The service includes built-in prompts for business vocabulary in both languages.

## Troubleshooting

### CUDA Out of Memory
```
RuntimeError: CUDA out of memory
```

**Solutions:**
1. Reduce model size: `WHISPER_MODEL=medium`
2. Use lower precision: `WHISPER_COMPUTE_TYPE=int8_float16`
3. Restart service after changing `.env`

### Model Download Issues
```
ConnectionError: Model download failed
```

**Solutions:**
1. Check internet connection
2. Use a different model size
3. Pre-download models manually

### ffmpeg Not Found
```
HTTP 500: ffmpeg not found
```

**Solutions:**
1. Install ffmpeg (see Installation section)
2. Add ffmpeg to PATH
3. Restart terminal/command prompt

### Port Already in Use
```
OSError: [Errno 48] Address already in use
```

**Solutions:**
1. Kill existing process: `lsof -ti:9000 | xargs kill`
2. Use different port: `--port 9001`

### Slow Transcription
**Optimizations:**
1. Use GPU: `WHISPER_DEVICE=cuda`
2. Reduce beam size: `WHISPER_BEAM_SIZE=3`
3. Use smaller model: `WHISPER_MODEL=medium`

### Quality Issues
**Improvements:**
1. Use larger model: `WHISPER_MODEL=large-v3`
2. Increase beam size: `WHISPER_BEAM_SIZE=10`
3. Add custom prompts: `WHISPER_INITIAL_PROMPT="your terms"`

## Performance Benchmarks (RTX 4070)

| Model | VRAM | Speed | Quality |
|-------|------|-------|---------|
| medium | ~3GB | ~2x realtime | Good |
| large-v3 | ~8GB | ~1x realtime | Excellent |

*Based on 30-minute audio files*

## Integration

This service replaces Azure Speech SDK for offline transcription. Update your client code to:

1. Remove Azure dependencies
2. POST audio files to `http://127.0.0.1:9000/transcribe`
3. Handle the JSON response format

## License

MIT License - see LICENSE file for details.