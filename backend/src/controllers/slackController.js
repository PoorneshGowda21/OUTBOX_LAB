import axios from 'axios';
import prisma from '../config/prisma.js';
import slackService from '../services/slackService.js';

export class SlackController {
  /**
   * Get current Slack integration status
   */
  async getStatus(req, res) {
    try {
      const userId = req.query.userId || undefined;
      const integration = await slackService.getActiveIntegration(userId);

      if (!integration || !integration.isConnected) {
        res.json({
          connected: false,
          channel: null,
          teamName: null,
          lastNotifiedAt: null,
          hasWebhook: false,
        });
        return;
      }

      res.json({
        connected: true,
        channel: integration.channel || '#general',
        teamName: integration.teamName || 'Connected Workspace',
        lastNotifiedAt: integration.lastNotifiedAt,
        hasWebhook: !!integration.webhookUrl,
        hasOAuthToken: !!integration.accessToken,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve Slack status', details: err.message });
    }
  }

  /**
   * Connect via Incoming Webhook URL
   */
  async connectWebhook(req, res) {
    try {
      const { webhookUrl, channel = '#reachinbox-alerts', teamName = 'Outbox Labs Slack', userId } = req.body;

      if (!webhookUrl || !webhookUrl.startsWith('http')) {
        res.status(400).json({ error: 'Valid Slack webhook URL is required.' });
        return;
      }

      // Ensure user exists or use default system user
      let user = null;
      if (userId) {
        user = await prisma.user.findUnique({ where: { id: userId } });
      }
      if (!user) {
        user = await prisma.user.upsert({
          where: { email: 'admin@reachinbox.ai' },
          update: {},
          create: {
            email: 'admin@reachinbox.ai',
            name: 'ReachInbox Admin',
          },
        });
      }

      const integration = await prisma.slackIntegration.upsert({
        where: { userId: user.id },
        update: {
          webhookUrl,
          channel,
          teamName,
          isConnected: true,
        },
        create: {
          userId: user.id,
          webhookUrl,
          channel,
          teamName,
          isConnected: true,
        },
      });

      console.log(`✅ Slack Webhook connected for channel: ${channel}`);

      res.json({
        success: true,
        message: `Connected successfully to Slack channel ${channel}!`,
        integration: {
          channel: integration.channel,
          teamName: integration.teamName,
          isConnected: integration.isConnected,
        },
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to connect Slack webhook', details: err.message });
    }
  }

  /**
   * Start Slack OAuth flow (redirects to Slack OAuth authorize URL)
   */
  async oauthStart(req, res) {
    const clientId = process.env.SLACK_CLIENT_ID;
    const redirectUri = process.env.SLACK_REDIRECT_URI || 'http://localhost:5000/api/slack/oauth/callback';
    const scope = 'incoming-webhook,chat:write,chat:write.public';

    if (!clientId) {
      res.status(400).json({
        error: 'Slack Client ID not configured. Please use direct Webhook connection or configure SLACK_CLIENT_ID in .env',
      });
      return;
    }

    const slackAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    res.redirect(slackAuthUrl);
  }

  /**
   * Handle Slack OAuth callback
   */
  async oauthCallback(req, res) {
    try {
      const { code, error } = req.query;

      if (error) {
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}?slack_error=${error}`);
        return;
      }

      if (!code) {
        res.status(400).send('Authorization code missing from Slack');
        return;
      }

      const clientId = process.env.SLACK_CLIENT_ID;
      const clientSecret = process.env.SLACK_CLIENT_SECRET;
      const redirectUri = process.env.SLACK_REDIRECT_URI || 'http://localhost:5000/api/slack/oauth/callback';

      // Exchange code for access token
      const tokenResponse = await axios.post(
        'https://slack.com/api/oauth.v2.access',
        null,
        {
          params: {
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: redirectUri,
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const data = tokenResponse.data;

      if (!data.ok) {
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}?slack_error=${encodeURIComponent(data.error)}`);
        return;
      }

      // Default user
      const user = await prisma.user.upsert({
        where: { email: 'admin@reachinbox.ai' },
        update: {},
        create: {
          email: 'admin@reachinbox.ai',
          name: 'ReachInbox Admin',
        },
      });

      // Save OAuth credentials
      await prisma.slackIntegration.upsert({
        where: { userId: user.id },
        update: {
          accessToken: data.access_token,
          webhookUrl: data.incoming_webhook?.url || null,
          channel: data.incoming_webhook?.channel || '#general',
          teamName: data.team?.name || 'Slack Workspace',
          isConnected: true,
        },
        create: {
          userId: user.id,
          accessToken: data.access_token,
          webhookUrl: data.incoming_webhook?.url || null,
          channel: data.incoming_webhook?.channel || '#general',
          teamName: data.team?.name || 'Slack Workspace',
          isConnected: true,
        },
      });

      console.log(`✅ Slack OAuth successful for workspace: ${data.team?.name}`);

      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}?slack_connected=true`);
    } catch (err) {
      console.error('❌ Slack OAuth callback error:', err);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}?slack_error=oauth_failed`);
    }
  }

  /**
   * Disconnect Slack
   */
  async disconnect(req, res) {
    try {
      const userId = req.body.userId || undefined;
      const integration = await slackService.getActiveIntegration(userId);

      if (integration && integration.id !== 'env-default') {
        await prisma.slackIntegration.update({
          where: { id: integration.id },
          data: { isConnected: false },
        });
      }

      res.json({ success: true, message: 'Slack disconnected successfully.' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to disconnect Slack', details: err.message });
    }
  }

  /**
   * Send live test notification to verify Slack connection
   */
  async testAlert(req, res) {
    try {
      const userId = req.body.userId;
      const result = await slackService.sendTestAlert(userId);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Test alert failed', details: err.message });
    }
  }
}

export const slackController = new SlackController();
export default slackController;
