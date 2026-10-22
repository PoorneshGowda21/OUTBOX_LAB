"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const emailController_1 = __importDefault(require("../controllers/emailController"));
const slackController_1 = __importDefault(require("../controllers/slackController"));
const authController_1 = __importDefault(require("../controllers/authController"));
const router = (0, express_1.Router)();
// =================== EMAIL SCHEDULING ROUTES ===================
// Schedule new emails (supports CSV lead lists, staggering, min delay, hourly limits)
router.post('/emails/schedule', (req, res) => emailController_1.default.schedule(req, res));
// View scheduled / pending / rate-limited emails
router.get('/emails/scheduled', (req, res) => emailController_1.default.getScheduled(req, res));
// View sent / failed emails (with Ethereal preview URLs)
router.get('/emails/sent', (req, res) => emailController_1.default.getSent(req, res));
// Real-time Elasticsearch / DB fallback search across subject, body, sender, recipient
router.get('/emails/search', (req, res) => emailController_1.default.search(req, res));
// Cancel a scheduled email
router.post('/emails/cancel/:id', (req, res) => emailController_1.default.cancel(req, res));
// Dashboard metrics & per-sender rate limit consumption
router.get('/emails/stats', (req, res) => emailController_1.default.getStats(req, res));
// Multiple senders management
router.get('/senders', (req, res) => emailController_1.default.getSenders(req, res));
router.post('/senders', (req, res) => emailController_1.default.createSender(req, res));
// =================== SLACK INTEGRATION ROUTES ===================
// Status check
router.get('/slack/status', (req, res) => slackController_1.default.getStatus(req, res));
// Direct Webhook connection
router.post('/slack/webhook', (req, res) => slackController_1.default.connectWebhook(req, res));
// Real OAuth flow
router.get('/slack/oauth/start', (req, res) => slackController_1.default.oauthStart(req, res));
router.get('/slack/oauth/callback', (req, res) => slackController_1.default.oauthCallback(req, res));
// Disconnect
router.post('/slack/disconnect', (req, res) => slackController_1.default.disconnect(req, res));
// Send live test notification
router.post('/slack/test', (req, res) => slackController_1.default.testAlert(req, res));
// =================== AUTHENTICATION ROUTES ===================
// Google OAuth login / verification
router.post('/auth/google', (req, res) => authController_1.default.googleLogin(req, res));
router.get('/auth/me', (req, res) => authController_1.default.me(req, res));
exports.default = router;
