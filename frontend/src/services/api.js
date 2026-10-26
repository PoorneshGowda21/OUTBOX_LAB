import axios from 'axios';

const API_BASE = '/api';

const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  // Emails
  scheduleEmails: async (payload) => {
    const res = await apiClient.post('/emails/schedule', payload);
    return res.data;
  },

  getScheduledEmails: async (params) => {
    const res = await apiClient.get('/emails/scheduled', { params });
    return res.data;
  },

  getSentEmails: async (params) => {
    const res = await apiClient.get('/emails/sent', { params });
    return res.data;
  },

  searchEmails: async (query, status) => {
    const res = await apiClient.get('/emails/search', { params: { q: query, status } });
    return res.data;
  },

  cancelEmail: async (id) => {
    const res = await apiClient.post(`/emails/cancel/${id}`);
    return res.data;
  },

  getStats: async () => {
    const res = await apiClient.get('/emails/stats');
    return res.data;
  },

  // Senders
  getSenders: async () => {
    const res = await apiClient.get('/senders');
    return res.data.senders;
  },

  createSender: async (sender) => {
    const res = await apiClient.post('/senders', sender);
    return res.data.sender;
  },

  // Slack
  getSlackStatus: async (userId) => {
    const res = await apiClient.get('/slack/status', { params: { userId } });
    return res.data;
  },

  connectSlackWebhook: async (data) => {
    const res = await apiClient.post('/slack/webhook', data);
    return res.data;
  },

  disconnectSlack: async (userId) => {
    const res = await apiClient.post('/slack/disconnect', { userId });
    return res.data;
  },

  testSlackAlert: async (userId) => {
    const res = await apiClient.post('/slack/test', { userId });
    return res.data;
  },

  // Auth
  loginGoogle: async (data) => {
    const res = await apiClient.post('/auth/google', data);
    return res.data;
  },

  getCurrentUser: async (email) => {
    const res = await apiClient.get('/auth/me', { params: { email } });
    return res.data;
  },
};

export default api;
