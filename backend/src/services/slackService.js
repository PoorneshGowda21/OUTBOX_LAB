import axios from 'axios';
import prisma from '../config/prisma.js';

class SlackService {
  /**
   * Get active Slack webhook or integration for user/system
   */
  async getActiveIntegration(userId) {
    if (userId) {
      const integration = await prisma.slackIntegration.findUnique({
        where: { userId },
      });
      if (integration && integration.isConnected && (integration.webhookUrl || integration.accessToken)) {
        return integration;
      }
    }

    // Fallback to any connected integration in DB
    const anyIntegration = await prisma.slackIntegration.findFirst({
      where: { isConnected: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (anyIntegration && (anyIntegration.webhookUrl || anyIntegration.accessToken)) {
      return anyIntegration;
    }

    // Fallback to environment variable if configured
    if (process.env.DEFAULT_SLACK_WEBHOOK_URL) {
      return {
        id: 'env-default',
        userId: 'system',
        webhookUrl: process.env.DEFAULT_SLACK_WEBHOOK_URL,
        channel: '#reachinbox-alerts',
        teamName: 'Workspace',
        accessToken: null,
        isConnected: true,
        lastNotifiedAt: null,
      };
    }

    return null;
  }

  /**
   * Send live Slack message when sender hourly rate limit is hit
   */
  async sendRateLimitAlert(params, userId) {
    const integration = await this.getActiveIntegration(userId);

    if (!integration) {
      console.log(`ℹ️ Slack not connected. Skipping rate limit alert for ${params.senderEmail}.`);
      return false;
    }

    const nextWindowStr = params.nextAvailableWindow.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🚨 ReachInbox Alert: Sender Rate Limit Exceeded',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Sender *<mailto:${params.senderEmail}|${params.senderEmail}>* has hit its hourly throughput ceiling. Rate limiting has been enforced across all active workers.`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Hourly Limit:*\n\`${params.hourlyLimit} emails/hr\``,
          },
          {
            type: 'mrkdwn',
            text: `*Emails Sent This Hour:*\n\`${params.currentCount} emails\``,
          },
          {
            type: 'mrkdwn',
            text: `*Scheduler Action:*\n*Rescheduled to Next Window*`,
          },
          {
            type: 'mrkdwn',
            text: `*Next Execution Window:*\n\`${nextWindowStr}\``,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `⏰ Jobs deferred safely to avoid provider throttling | Zero jobs dropped | Timestamp: ${new Date().toISOString()}`,
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Live Scheduler Dashboard',
              emoji: true,
            },
            url: process.env.FRONTEND_URL || 'http://localhost:5173',
            style: 'primary',
          },
        ],
      },
    ];

    try {
      console.log(`📡 Sending live Slack alert for ${params.senderEmail}...`);

      if (integration.webhookUrl) {
        const response = await axios.post(integration.webhookUrl, {
          text: `🚨 Rate Limit Alert: ${params.senderEmail} hit hourly ceiling of ${params.hourlyLimit} emails/hour.`,
          blocks,
        });

        if (response.status === 200) {
          console.log(`✅ Slack rate limit notification successfully delivered!`);
          if (integration.id !== 'env-default') {
            await prisma.slackIntegration.update({
              where: { id: integration.id },
              data: { lastNotifiedAt: new Date() },
            }).catch(() => {});
          }
          return true;
        }
      } else if (integration.accessToken) {
        // Send via Slack Web API chat.postMessage
        const channel = integration.channel || '#general';
        const response = await axios.post(
          'https://slack.com/api/chat.postMessage',
          {
            channel,
            text: `🚨 Rate Limit Alert: ${params.senderEmail} reached limit.`,
            blocks,
          },
          {
            headers: {
              Authorization: `Bearer ${integration.accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (response.data.ok) {
          console.log(`✅ Slack Web API notification successfully delivered!`);
          return true;
        } else {
          console.error('❌ Slack Web API error:', response.data.error);
        }
      }
    } catch (err) {
      console.error('❌ Failed to deliver Slack message:', err.response?.data || err.message);
    }

    return false;
  }

  /**
   * Send test alert from dashboard to verify connection
   */
  async sendTestAlert(userId) {
    const integration = await this.getActiveIntegration(userId);

    if (!integration) {
      return {
        success: false,
        message: 'No active Slack connection found. Please connect Slack first.',
      };
    }

    try {
      const payload = {
        text: '🎉 ReachInbox Email Scheduler Slack integration test successful!',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🎉 ReachInbox Slack Integration Connected!',
              emoji: true,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Your Slack workspace is successfully connected to the *ReachInbox Email Scheduler Service*. You will receive instant notifications whenever a sender reaches their hourly rate limit.',
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Verified at: ${new Date().toLocaleString()} | Target: ${integration.channel || 'Default Channel'}`,
              },
            ],
          },
        ],
      };

      if (integration.webhookUrl) {
        await axios.post(integration.webhookUrl, payload);
        return { success: true, message: 'Test message sent to Slack successfully via Webhook!' };
      } else if (integration.accessToken) {
        await axios.post(
          'https://slack.com/api/chat.postMessage',
          {
            channel: integration.channel || '#general',
            ...payload,
          },
          {
            headers: {
              Authorization: `Bearer ${integration.accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );
        return { success: true, message: 'Test message sent to Slack successfully via Web API!' };
      }

      return { success: false, message: 'Missing webhook URL or access token.' };
    } catch (err) {
      return {
        success: false,
        message: `Failed to deliver Slack message: ${err.response?.data?.message || err.message}`,
      };
    }
  }
}

export const slackService = new SlackService();
export default slackService;
