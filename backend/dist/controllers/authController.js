"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = exports.AuthController = void 0;
const axios_1 = __importDefault(require("axios"));
const prisma_1 = __importDefault(require("../config/prisma"));
class AuthController {
    /**
     * Handle Google OAuth Login
     * Accepts either Google ID token (credential) or user profile info
     */
    async googleLogin(req, res) {
        try {
            const { credential, userInfo } = req.body;
            let email;
            let name;
            let avatar;
            let googleId;
            // 1. If Google ID token was sent from Google One Tap / Sign-In button:
            if (credential) {
                try {
                    // Verify with Google tokeninfo endpoint
                    const response = await axios_1.default.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
                    const payload = response.data;
                    email = payload.email;
                    name = payload.name || payload.email.split('@')[0];
                    avatar = payload.picture;
                    googleId = payload.sub;
                }
                catch (tokenErr) {
                    // Fallback: decode JWT payload without network call if offline
                    const parts = credential.split('.');
                    if (parts.length === 3) {
                        const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
                        email = decoded.email;
                        name = decoded.name || decoded.email.split('@')[0];
                        avatar = decoded.picture;
                        googleId = decoded.sub;
                    }
                    else {
                        res.status(400).json({ error: 'Invalid Google credential token' });
                        return;
                    }
                }
            }
            else if (userInfo && userInfo.email) {
                // Direct profile submission
                email = userInfo.email;
                name = userInfo.name || email.split('@')[0];
                avatar = userInfo.avatar;
                googleId = userInfo.googleId;
            }
            else {
                res.status(400).json({ error: 'Missing credential or userInfo' });
                return;
            }
            // Upsert user in PostgreSQL
            const user = await prisma_1.default.user.upsert({
                where: { email },
                update: {
                    name,
                    avatar: avatar || undefined,
                    googleId: googleId || undefined,
                },
                create: {
                    email,
                    name,
                    avatar,
                    googleId,
                },
                include: {
                    slackIntegration: true,
                },
            });
            console.log(`👤 User logged in: ${user.name} (${user.email})`);
            res.json({
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    avatar: user.avatar,
                    slackConnected: !!(user.slackIntegration && user.slackIntegration.isConnected),
                },
            });
        }
        catch (err) {
            console.error('❌ Google Auth Error:', err);
            res.status(500).json({ error: 'Authentication failed', details: err.message });
        }
    }
    /**
     * Get current authenticated user profile
     */
    async me(req, res) {
        try {
            const email = req.query.email || 'admin@reachinbox.ai';
            const user = await prisma_1.default.user.findUnique({
                where: { email },
                include: { slackIntegration: true },
            });
            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }
            res.json({
                id: user.id,
                email: user.email,
                name: user.name,
                avatar: user.avatar,
                slackConnected: !!(user.slackIntegration && user.slackIntegration.isConnected),
            });
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to fetch user', details: err.message });
        }
    }
}
exports.AuthController = AuthController;
exports.authController = new AuthController();
exports.default = exports.authController;
