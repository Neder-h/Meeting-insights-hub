import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import coreRoutes from './core.js';
import uploadRoutes from './uploads.js';
import summaryRoutes from './summaries.js';
import diagnosticsRoutes from './diagnostics.js';
import processingRoutes from './processing.js';
import emailDraftRoutes from './emailDrafts.js';
import lifecycleRoutes from './lifecycle.js';

const router = Router();
router.use(authenticate);

// Focused modules mounted under /api/meetings
router.use(summaryRoutes);
router.use(diagnosticsRoutes);
router.use(uploadRoutes);
router.use(processingRoutes);
router.use(emailDraftRoutes);
router.use(lifecycleRoutes);
router.use(coreRoutes);

export default router;
