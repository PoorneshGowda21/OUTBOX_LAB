import axios from 'axios';
import { SchedulePayload, EmailJob, Sender, StatsData, SlackStatus, User } from '../types';

const API_BASE = '/api';

const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  // Emails
  scheduleEmails: async (payload: SchedulePayload) => {
    const res = await apiClient.post('/emails/schedule', payload);
    return res.data;
  },

  getScheduledEmails: async (params?: { page?: number; limit?: number; search?: string }) => {
    const res = await apiClient.get<{
      success: boolean;
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      emails: EmailJob[];
    }>('/emails/scheduled', { params });
    return res.data;
  },

  getSentEmails: async (params?: { page?: number; limit?: number; search?: string; status?: string }) => {
    const res = await apiClient.get<{
      success: boolean;
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      emails: EmailJob[];
    }>('/emails/sent', { params });
    return res.data;
  },

  searchEmails: async (query: string, status?: string) => {
    const res = await apiClient.get<{
      success: boolean;
      total: number;
      emails: EmailJob[];
      source: 'elasticsearch' | 'database';
    }>('/emails/search', { params: { q: query, status } });
    return res.data;
  },

  cancelEmail: async (id: string) => {
    const res = await apiClient.post(`/emails/cancel/${id}`);
    return res.data;
  },

  getStats: async () => {
    const res = await apiClient.get<{
      success: boolean;
      stats: StatsData;
      senders: Sender[];
    }>('/emails/stats');
    return res.data;
  },

  // Senders
  getSenders: async () => {
    const res = await apiClient.get<{ success: boolean; senders: Sender[] }>('/senders');
    return res.data.senders;
  },

  createSender: async (sender: { email: string; name: string; hourlyLimit: number }) => {
    const res = await apiClient.post('/senders', sender);
    return res.data.sender;
  },

  // Slack
  getSlackStatus: async (userId?: string) => {
    const res = await apiClient.get<SlackStatus>('/slack/status', { params: { userId } });
    return res.data;
  },

  connectSlackWebhook: async (data: { webhookUrl: string; channel?: string; teamName?: string; userId?: string }) => {
    const res = await apiClient.post('/slack/webhook', data);
    return res.data;
  },

  disconnectSlack: async (userId?: string) => {
    const res = await apiClient.post('/slack/disconnect', { userId });
    return res.data;
  },

  testSlackAlert: async (userId?: string) => {
    const res = await apiClient.post<{ success: boolean; message: string }>('/slack/test', { userId });
    return res.data;
  },

  // Auth
  loginGoogle: async (data: { credential?: string; userInfo?: any }) => {
    const res = await apiClient.post<{ success: boolean; user: User }>('/auth/google', data);
    return res.data;
  },

  getCurrentUser: async (email?: string) => {
    const res = await apiClient.get<User>('/auth/me', { params: { email } });
    return res.data;
  },
};

export default api;
