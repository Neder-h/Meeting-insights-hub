import dotenv from 'dotenv';
dotenv.config();

export default {
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/salesai',
  jwtSecret: process.env.JWT_SECRET || 'salesai-secret-key-change-in-production',
  port: parseInt(process.env.PORT || '3001'),
  uploadsDir: './uploads',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  redisEnabled: (process.env.REDIS_ENABLED || 'false').toLowerCase() === 'true',
  whisperUrl: process.env.WHISPER_API_URL || 'http://127.0.0.1:9000',
  translateUrl: process.env.TRANSLATE_API_URL || 'http://127.0.0.1:9100',
  uploadChunkSizeBytes: parseInt(process.env.UPLOAD_CHUNK_SIZE_BYTES || `${5 * 1024 * 1024}`),
};
