import { Router } from 'express';

const router = Router();

// Health check route
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

// Placeholder routes - will be implemented later
router.use('/auth', (req, res) => {
  res.json({ message: 'Auth routes - coming soon' });
});

router.use('/users', (req, res) => {
  res.json({ message: 'User routes - coming soon' });
});

router.use('/conversations', (req, res) => {
  res.json({ message: 'Conversation routes - coming soon' });
});

router.use('/messages', (req, res) => {
  res.json({ message: 'Message routes - coming soon' });
});

router.use('/groups', (req, res) => {
  res.json({ message: 'Group routes - coming soon' });
});

export default router;
