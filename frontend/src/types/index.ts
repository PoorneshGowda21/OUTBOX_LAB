export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  slackConnected?: boolean;
}

export interface Sender {
  id: string;
  email: string;
  name: string;
  hourlyLimit: number;
  isActive: boolean;
  currentHourSent?: number;
  currentHourWindow?: string;
  remainingInHour?: number;
  percentageUsed?: number;
}

export interface EmailJob {
  id: string;
  userId?: string | null;
  senderId?: string | null;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  status: 'PENDING' | 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'RATE_LIMITED_RESCHEDULED' | 'CANCELLED';
  scheduledAt: string;
  sentAt?: string | null;
  attempts: number;
  lastError?: string | null;
  idempotencyKey: string;
  bullJobId?: string | null;
  delayBetweenEmailsMs: number;
  hourlyLimit: number;
  etherealMessageId?: string | null;
  etherealPreviewUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StatsData {
  totalScheduled: number;
  totalSent: number;
  totalFailed: number;
  totalRescheduled: number;
  queue: {
    waiting: number;
    delayed: number;
    active: number;
    completed: number;
    failed: number;
  };
}

export interface SlackStatus {
  connected: boolean;
  channel: string | null;
  teamName: string | null;
  lastNotifiedAt: string | null;
  hasWebhook: boolean;
  hasOAuthToken?: boolean;
}

export interface SchedulePayload {
  senderEmail: string;
  recipients: string[];
  subject: string;
  body: string;
  startTime?: string;
  delayBetweenEmailsMs: number;
  hourlyLimit: number;
}
