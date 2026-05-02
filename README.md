# SalesAI - Meeting Insights Hub

Conversation intelligence platform for commercial meetings.

The app records or imports meeting audio, transcribes it with Whisper, optionally translates Arabic segments with NLLB-200, analyzes the meeting with Gemini, and prepares a follow-up email draft. The frontend is local-first and keeps working with IndexedDB when connectivity is unstable.

## Stack

- Frontend: React 18, TypeScript, Vite, Tailwind, shadcn/ui, TanStack Query, Dexie
- Backend: Express, MongoDB, JWT, BullMQ, Redis
- AI services: FastAPI, faster-whisper, NLLB-200, Google Gemini

## Prerequisites

| Tool | Minimum |
| --- | --- |
| Node.js | 18+ |
| MongoDB | 6+ |
| Python | 3.10+ |
| ffmpeg | installed and available in `PATH` |
| Redis | optional, only for queued processing |
| NVIDIA GPU + CUDA | recommended for local AI inference |

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/` | React frontend |
| `server/` | Express backend |
| `local-whisper/` | Whisper transcription and Gemini analysis service |
| `local-translate/` | NLLB-200 translation service |
| `report.md` | PFE report |
| `soutenance-technique-guide.md` | Oral defense study guide |

## Quick start

### 1. Install frontend dependencies

```bash
npm install
```

### 2. Install backend dependencies

```bash
npm --prefix server install
```

### 3. Configure local environment files

Keep local secrets out of Git. Only commit the example files.

- Copy `server/.env.example` to `server/.env`
- Copy `local-whisper/.env.example` to `local-whisper/.env` if needed
- Copy `local-translate/.env.example` to `local-translate/.env` if needed

Backend example values:

```env
MONGODB_URI=mongodb://localhost:27017/salesai
JWT_SECRET=change-me-before-production
PORT=3001
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
REDIS_ENABLED=false
REDIS_URL=redis://127.0.0.1:6379
WHISPER_API_URL=http://127.0.0.1:9000
TRANSLATE_API_URL=http://127.0.0.1:9100
UPLOAD_CHUNK_SIZE_BYTES=5242880
```

### 4. Start the backend

```bash
npm --prefix server start
```

The backend runs on `http://localhost:3001`.

### 5. Start the frontend

```bash
npm run dev
```

The frontend runs on `http://localhost:5173`.

### 6. Start the Whisper service

```bash
cd local-whisper
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 9000
```

More details: [local-whisper/README.md](local-whisper/README.md)

### 7. Start the translation service

```bash
cd local-translate
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 9100
```

More details: [local-translate/README.md](local-translate/README.md)

### 8. Optional: start Redis for BullMQ

```bash
cd server
docker compose -f docker-compose.redis.yml up -d
```

Then set `REDIS_ENABLED=true` in `server/.env`.

## Useful scripts

```bash
npm run dev
npm run build
npm run lint
npm run test:web
npm run test:server
npm run test:python
npm test
```

## Default admin account

Create it once with:

```bash
cd server
node seed-admin.js
```

Default credentials:

- Email: `admin@admin.com`
- Password: `admin123`

Change this immediately outside local demo usage.

## GitHub push notes

This repository is now configured to keep local-only data out of Git:

- `.env` files
- Python virtual environments
- build output such as `dist/`
- runtime uploads
- local Whisper model weights under `local-whisper/hf-model-raw/`
- converted fine-tuned weights under `local-whisper/finetuned-ct2/`

If any API keys or tokens from your local machine were ever copied to a shared location, rotate them before publishing.

## License

Final-year project repository. Keep the code private or apply the license policy you want before public release.
