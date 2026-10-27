import { Router } from 'express';
import emailController from '../controllers/emailController.js';
import slackController from '../controllers/slackController.js';
import authController from '../controllers/authController.js';

const router = Router();

// =================== EMAIL SCHEDULING ROUTES ===================
// Schedule new emails (supports CSV lead lists, staggering, min delay, hourly limits)
router.post('/emails/schedule', (req, res) => emailController.schedule(req, res));

// View scheduled / pending / rate-limited emails
router.get('/emails/scheduled', (req, res) => emailController.getScheduled(req, res));

// View sent / failed emails (with Ethereal preview URLs)
router.get('/emails/sent', (req, res) => emailController.getSent(req, res));

// Real-time Elasticsearch / DB fallback search across subject, body, sender, recipient
router.get('/emails/search', (req, res) => emailController.search(req, res));

// Cancel a scheduled email
router.post('/emails/cancel/:id', (req, res) => emailController.cancel(req, res));

// Dashboard metrics & per-sender rate limit consumption
router.get('/emails/stats', (req, res) => emailController.getStats(req, res));

// Multiple senders management
router.get('/senders', (req, res) => emailController.getSenders(req, res));
router.post('/senders', (req, res) => emailController.createSender(req, res));

// =================== SLACK INTEGRATION ROUTES ===================
// Status check
router.get('/slack/status', (req, res) => slackController.getStatus(req, res));

// Direct Webhook connection
router.post('/slack/webhook', (req, res) => slackController.connectWebhook(req, res));

// Real OAuth flow
router.get('/slack/oauth/start', (req, res) => slackController.oauthStart(req, res));
router.get('/slack/oauth/callback', (req, res) => slackController.oauthCallback(req, res));

// Disconnect
router.post('/slack/disconnect', (req, res) => slackController.disconnect(req, res));

// Send live test notification
router.post('/slack/test', (req, res) => slackController.testAlert(req, res));

// =================== AUTHENTICATION ROUTES ===================
// Google OAuth login / verification
router.post('/auth/google', (req, res) => authController.googleLogin(req, res));
router.get('/auth/me', (req, res) => authController.me(req, res));

export default router;
