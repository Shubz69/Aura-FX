import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { linkMT5Account, refreshAccountData } from '../controllers/syncController.js';

const router = express.Router();

router.use(protect); // Apply 'protect' middleware to all routes in this router

// protect middleware ensures req.user is populated before the controller runs
router.post('/link',  linkMT5Account);
router.get('/refresh/:accountId', refreshAccountData);

export default router;