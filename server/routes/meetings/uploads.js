import { Router } from 'express';
import multer from 'multer';
import { existsSync, mkdirSync, writeFileSync, appendFileSync, renameSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import config from '../../config.js';

const router = Router({ mergeParams: true });
const chunkUploadSessions = new Map();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = join(config.uploadsDir, req.user._id.toString());
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop() || 'webm';
    cb(null, `${randomUUID()}.${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });
const chunkUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/meetings/upload/init
router.post('/upload/init', (req, res) => {
  const { fileName, totalSize, mimeType } = req.body || {};
  if (!fileName || !totalSize) {
    return res.status(400).json({ error: 'fileName and totalSize are required' });
  }

  const uploadId = randomUUID();
  const tempDir = join(config.uploadsDir, req.user._id.toString(), '.chunks');
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
  const tempPath = join(tempDir, `${uploadId}.part`);
  writeFileSync(tempPath, Buffer.alloc(0));

  chunkUploadSessions.set(uploadId, {
    uploadId,
    userId: req.user._id.toString(),
    tempPath,
    fileName,
    totalSize,
    mimeType,
    receivedBytes: 0,
    receivedChunks: new Set(),
    startedAt: Date.now(),
  });

  res.json({
    uploadId,
    chunkSize: config.uploadChunkSizeBytes,
  });
});

// POST /api/meetings/upload/chunk
router.post('/upload/chunk', chunkUpload.single('chunk'), (req, res) => {
  const uploadId = req.body?.uploadId;
  const chunkIndex = Number(req.body?.chunkIndex);
  if (!uploadId || Number.isNaN(chunkIndex) || !req.file) {
    return res.status(400).json({ error: 'uploadId, chunkIndex and chunk file are required' });
  }

  const session = chunkUploadSessions.get(uploadId);
  if (!session || session.userId !== req.user._id.toString()) {
    return res.status(404).json({ error: 'Upload session not found' });
  }

  if (session.receivedChunks.has(chunkIndex)) {
    return res.json({ ok: true, duplicate: true, receivedBytes: session.receivedBytes });
  }

  appendFileSync(session.tempPath, req.file.buffer);
  session.receivedChunks.add(chunkIndex);
  session.receivedBytes += req.file.buffer.length;

  res.json({ ok: true, receivedBytes: session.receivedBytes });
});

// POST /api/meetings/upload/complete
router.post('/upload/complete', (req, res) => {
  const { uploadId, totalChunks } = req.body || {};
  const session = chunkUploadSessions.get(uploadId);
  if (!session || session.userId !== req.user._id.toString()) {
    return res.status(404).json({ error: 'Upload session not found' });
  }

  if (typeof totalChunks === 'number' && session.receivedChunks.size < totalChunks) {
    return res.status(400).json({ error: 'Not all chunks uploaded yet' });
  }

  const ext = (session.fileName || 'audio.webm').split('.').pop() || 'webm';
  const finalName = `${randomUUID()}.${ext}`;
  const userDir = join(config.uploadsDir, req.user._id.toString());
  if (!existsSync(userDir)) mkdirSync(userDir, { recursive: true });
  const finalPath = join(userDir, finalName);

  renameSync(session.tempPath, finalPath);
  chunkUploadSessions.delete(uploadId);

  const url = `http://localhost:${config.port}/uploads/${req.user._id}/${finalName}`;
  res.json({ url, size: session.receivedBytes });
});

// POST /api/meetings/upload/cancel
router.post('/upload/cancel', (req, res) => {
  const { uploadId } = req.body || {};
  const session = chunkUploadSessions.get(uploadId);
  if (!session || session.userId !== req.user._id.toString()) {
    return res.json({ ok: true });
  }
  try {
    unlinkSync(session.tempPath);
  } catch {
    // noop
  }
  chunkUploadSessions.delete(uploadId);
  res.json({ ok: true });
});

// POST /api/meetings/upload
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `http://localhost:${config.port}/uploads/${req.user._id}/${req.file.filename}`;
  res.json({ url });
});

export default router;
