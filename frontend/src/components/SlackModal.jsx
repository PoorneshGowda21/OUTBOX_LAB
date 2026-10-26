import React, { useState } from 'react';
import { X, Slack, CheckCircle, AlertTriangle, Send, Link, Unlink, ExternalLink } from 'lucide-react';
import api from '../services/api';

export const SlackModal = ({
  isOpen,
  onClose,
  slackStatus,
  onStatusUpdated,
}) => {
  const [tab, setTab] = useState('webhook');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [channel, setChannel] = useState('#reachinbox-alerts');
  const [teamName, setTeamName] = useState('Outreach Workspace');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState(null);

  if (!isOpen) return null;

  const handleConnectWebhook = async (e) => {
    e.preventDefault();
    setMessage(null);
    if (!webhookUrl.startsWith('http')) {
      setMessage({ text: 'Please enter a valid Slack webhook URL (https://hooks.slack.com/...)', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      await api.connectSlackWebhook({
        webhookUrl,
        channel,
        teamName,
      });
      setMessage({ text: `Successfully connected to Slack ${channel}!`, type: 'success' });
      onStatusUpdated();
    } catch (err) {
      setMessage({ text: err.response?.data?.error || 'Failed to connect Slack webhook.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsSubmitting(true);
    try {
      await api.disconnectSlack();
      setMessage({ text: 'Slack disconnected successfully.', type: 'success' });
      onStatusUpdated();
    } catch (err) {
      setMessage({ text: 'Failed to disconnect Slack.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestNotification = async () => {
    setIsTesting(true);
    setMessage(null);
    try {
      const res = await api.testSlackAlert();
      setMessage({ text: res.message, type: 'success' });
      onStatusUpdated();
    } catch (err) {
      setMessage({ text: err.response?.data?.message || 'Failed to send test message to Slack.', type: 'error' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleOAuthConnect = () => {
    window.location.href = 'http://localhost:5000/api/slack/oauth/start';
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg bg-[#111827] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#4A154B]/30 text-[#E01E5A] border border-[#E01E5A]/30">
              <Slack className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Slack Notifications Integration</h3>
              <p className="text-xs text-slate-400">Receive live alerts when sender hourly limits are hit</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status Banner */}
        <div className="px-6 py-3 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Current Status:</span>
            {slackStatus.connected ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <CheckCircle className="h-3 w-3" />
                Connected ({slackStatus.channel || '#reachinbox-alerts'})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                <AlertTriangle className="h-3 w-3 text-amber-400" />
                Not Connected
              </span>
            )}
          </div>

          {slackStatus.connected && (
            <button
              onClick={handleDisconnect}
              disabled={isSubmitting}
              className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors"
            >
              <Unlink className="h-3 w-3" />
              Disconnect
            </button>
          )}
        </div>

        {message && (
          <div
            className={`mx-6 mt-4 p-3 rounded-xl border text-xs flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        <div className="p-6 space-y-5">
          {/* Tabs: Webhook URL / OAuth */}
          <div className="flex border-b border-slate-800">
            <button
              type="button"
              onClick={() => setTab('webhook')}
              className={`pb-2.5 text-xs font-medium border-b-2 transition-all flex items-center gap-2 px-3 ${
                tab === 'webhook'
                  ? 'border-brand-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Link className="h-3.5 w-3.5" />
              Incoming Webhook (Instant)
            </button>
            <button
              type="button"
              onClick={() => setTab('oauth')}
              className={`pb-2.5 text-xs font-medium border-b-2 transition-all flex items-center gap-2 px-3 ${
                tab === 'oauth'
                  ? 'border-brand-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Slack className="h-3.5 w-3.5" />
              Slack OAuth 2.0 Flow
            </button>
          </div>

          {tab === 'webhook' ? (
            <form onSubmit={handleConnectWebhook} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Slack Incoming Webhook URL
                </label>
                <input
                  type="url"
                  required
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/services/T.../B.../.."
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-900/90 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Create a Webhook in your Slack Workspace App to receive instant rate-limit alerts.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Channel Name
                  </label>
                  <input
                    type="text"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-xl text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Workspace Name
                  </label>
                  <input
                    type="text"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-xl text-slate-200"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white rounded-xl transition-all shadow-glow-indigo disabled:opacity-50"
              >
                {isSubmitting ? 'Connecting...' : 'Save & Connect Slack'}
              </button>
            </form>
          ) : (
            <div className="text-center py-4 space-y-4">
              <p className="text-xs text-slate-300">
                Click below to authorize ReachInbox with your Slack workspace via OAuth 2.0.
              </p>
              <button
                onClick={handleOAuthConnect}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#4A154B] hover:bg-[#611f69] text-white text-xs font-semibold transition-all shadow-md"
              >
                <Slack className="h-4 w-4" />
                Connect with Slack OAuth
                <ExternalLink className="h-3 w-3" />
              </button>
              <p className="text-[11px] text-slate-400">
                Requires SLACK_CLIENT_ID and SLACK_CLIENT_SECRET configured in .env.
              </p>
            </div>
          )}

          {/* Test Alert Button */}
          {slackStatus.connected && (
            <div className="pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-medium text-slate-200">Verify Live Integration</h4>
                  <p className="text-[11px] text-slate-400">Send an instant test message to your Slack channel</p>
                </div>
                <button
                  type="button"
                  onClick={handleTestNotification}
                  disabled={isTesting}
                  className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl flex items-center gap-1.5 transition-all"
                >
                  <Send className="h-3 w-3 text-brand-400" />
                  {isTesting ? 'Sending...' : 'Test Slack Alert'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SlackModal;
