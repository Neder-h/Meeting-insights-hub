import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { existsSync, mkdirSync } from 'fs';
import config from './config.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import meetingRoutes from './routes/meetings.js';
import clientRoutes from './routes/clients.js';
import { initMeetingQueue, getQueueStatus } from './queue/meetingQueue.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve uploaded audio files
if (!existsSync(config.uploadsDir)) mkdirSync(config.uploadsDir, { recursive: true });
app.use('/uploads', express.static(config.uploadsDir));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/clients', clientRoutes);

// Health check
app.get('/api/health', (req, res) => {
  const queue = getQueueStatus();
  res.json({
    ok: true,
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    queue,
  });
});

// Connect to MongoDB and start server
mongoose
  .connect(config.mongoUri)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    initMeetingQueue().catch((e) => console.warn('Queue init warning:', e?.message || e));
    app.listen(config.port, () => {
      console.log(`✅ Server running on http://localhost:${config.port}`);
      console.log(`   API:     http://localhost:${config.port}/api`);
      console.log(`   Health:  http://localhost:${config.port}/api/health`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    console.error('   Make sure MongoDB is running on localhost:27017');
    console.error('   Install: https://www.mongodb.com/try/download/community');
    process.exit(1);
  });
