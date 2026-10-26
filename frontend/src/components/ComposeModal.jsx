import React, { useState, useRef } from 'react';
import { X, Upload, Mail, Clock, ShieldAlert, Sparkles, AlertCircle, Check, FileText } from 'lucide-react';
import confetti from 'canvas-confetti';
import api from '../services/api';

export const ComposeModal = ({
  isOpen,
  onClose,
  senders,
  onScheduledSuccess,
}) => {
  const [selectedSender, setSelectedSender] = useState(senders[0]?.email || 'growth@reachinbox.ai');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [rawEmails, setRawEmails] = useState('');
  const [parsedRecipients, setParsedRecipients] = useState([]);
  const [scheduleMode, setScheduleMode] = useState('now');
  const [customStartTime, setCustomStartTime] = useState('');
  const [delaySeconds, setDelaySeconds] = useState(2);
  const [hourlyLimit, setHourlyLimit] = useState(50);
  const [fileName, setFileName] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  // Regex parser to extract all valid emails from text or CSV
  const extractEmails = (text) => {
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
    const matches = text.match(emailRegex) || [];
    // Deduplicate and trim
    return Array.from(new Set(matches.map((e) => e.trim().toLowerCase())));
  };

  const handleTextChange = (e) => {
    const text = e.target.value;
    setRawEmails(text);
    const emails = extractEmails(text);
    setParsedRecipients(emails);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      const emails = extractEmails(content);
      setParsedRecipients(emails);
      setRawEmails(emails.join(', '));
    };
    reader.readAsText(file);
  };

  const removeRecipient = (indexToRemove) => {
    const updated = parsedRecipients.filter((_, idx) => idx !== indexToRemove);
    setParsedRecipients(updated);
    setRawEmails(updated.join(', '));
  };

  const insertVariable = (variable) => {
    setBody((prev) => prev + ` {{${variable}}}`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (parsedRecipients.length === 0) {
      setError('Please upload or enter at least one valid recipient email address.');
      return;
    }

    if (!subject.trim()) {
      setError('Subject line is required.');
      return;
    }

    if (!body.trim()) {
      setError('Email body is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const startTime =
        scheduleMode === 'custom' && customStartTime
          ? new Date(customStartTime).toISOString()
          : new Date().toISOString();

      const payload = {
        senderEmail: selectedSender,
        recipients: parsedRecipients,
        subject,
        body,
        startTime,
        delayBetweenEmailsMs: delaySeconds * 1000,
        hourlyLimit,
      };

      await api.scheduleEmails(payload);

      // Trigger celebratory confetti
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 },
      });

      onScheduledSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to schedule emails.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-2xl bg-[#111827] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-brand-500/10 text-brand-400">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Compose &amp; Schedule Outreach</h3>
              <p className="text-xs text-slate-400">Multi-lead batch scheduling with throttling &amp; rate limit guards</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Sender Selection */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Sender Address
            </label>
            <select
              value={selectedSender}
              onChange={(e) => setSelectedSender(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs bg-slate-900/90 border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
            >
              {senders.map((s) => (
                <option key={s.id} value={s.email}>
                  {s.name} ({s.email}) — Limit: {s.hourlyLimit}/hr
                </option>
              ))}
            </select>
          </div>

          {/* Lead CSV Upload & Detected Leads Count */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                Recipient Leads (CSV or Paste List)
              </label>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  parsedRecipients.length > 0
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {parsedRecipients.length} valid email{parsedRecipients.length === 1 ? '' : 's'} detected
              </span>
            </div>

            {/* Dropzone & Text Area */}
            <div className="space-y-2">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer border-2 border-dashed border-slate-700/80 hover:border-brand-500/60 rounded-xl p-3.5 text-center bg-slate-900/40 hover:bg-slate-900/80 transition-all flex items-center justify-center gap-3"
              >
                <Upload className="h-4 w-4 text-brand-400" />
                <span className="text-xs text-slate-300">
                  {fileName ? (
                    <span className="text-brand-300 font-medium flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" /> {fileName}
                    </span>
                  ) : (
                    'Click to upload CSV / TXT file of email leads'
                  )}
                </span>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".csv,.txt"
                  className="hidden"
                />
              </div>

              <textarea
                rows={3}
                value={rawEmails}
                onChange={handleTextChange}
                placeholder="Or paste email addresses separated by commas, spaces, or line breaks (e.g. lead1@acme.com, lead2@startup.io)..."
                className="w-full px-3.5 py-2 text-xs bg-slate-900/90 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 font-mono transition-all"
              />
            </div>

            {/* Email Chips Preview */}
            {parsedRecipients.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-slate-900/60 rounded-xl border border-slate-800">
                {parsedRecipients.slice(0, 15).map((email, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-slate-800 text-slate-300 border border-slate-700"
                  >
                    {email}
                    <button
                      type="button"
                      onClick={() => removeRecipient(idx)}
                      className="text-slate-400 hover:text-rose-400"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {parsedRecipients.length > 15 && (
                  <span className="text-[11px] text-slate-400 self-center px-1">
                    +{parsedRecipients.length - 15} more leads
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Subject Line */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Subject Line
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Quick question regarding your cold email pipeline"
              className="w-full px-3.5 py-2.5 text-xs bg-slate-900/90 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
            />
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-300">
                Email Message Body
              </label>
              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                <span>Insert:</span>
                <button
                  type="button"
                  onClick={() => insertVariable('name')}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-brand-300 text-[10px]"
                >
                  {'{{name}}'}
                </button>
                <button
                  type="button"
                  onClick={() => insertVariable('company')}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-brand-300 text-[10px]"
                >
                  {'{{company}}'}
                </button>
              </div>
            </div>
            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your cold outreach copy here..."
              className="w-full px-3.5 py-2.5 text-xs bg-slate-900/90 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
            />
          </div>

          {/* Throttling & Rate Limit Settings */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-brand-400" /> Scheduling &amp; Throttling Rules
              </span>
              <span className="text-[11px] text-brand-400 font-mono">BullMQ Delayed Queues</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Start Time Mode */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Start Execution
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setScheduleMode('now')}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                      scheduleMode === 'now'
                        ? 'bg-brand-500/20 text-brand-300 border-brand-500/40'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    Immediate
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleMode('custom')}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                      scheduleMode === 'custom'
                        ? 'bg-brand-500/20 text-brand-300 border-brand-500/40'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    Pick Date
                  </button>
                </div>
                {scheduleMode === 'custom' && (
                  <input
                    type="datetime-local"
                    value={customStartTime}
                    onChange={(e) => setCustomStartTime(e.target.value)}
                    className="mt-1.5 w-full px-2 py-1 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-200"
                  />
                )}
              </div>

              {/* Min Delay Between Emails */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Min Delay (Provider Throttling)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={delaySeconds}
                    onChange={(e) => setDelaySeconds(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-200"
                  />
                  <span className="text-xs text-slate-400 font-mono">sec</span>
                </div>
              </div>

              {/* Hourly Limit */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Hourly Limit
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={5}
                    max={1000}
                    value={hourlyLimit}
                    onChange={(e) => setHourlyLimit(Math.max(5, parseInt(e.target.value, 10) || 5))}
                    className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-200"
                  />
                  <span className="text-xs text-slate-400 font-mono">/hr</span>
                </div>
              </div>
            </div>

            {/* Smart ETA Calculation */}
            {parsedRecipients.length > 0 && (
              <div className="text-[11px] text-slate-400 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 flex items-center justify-between">
                <span>
                  Estimated duration: ~
                  <strong className="text-slate-200">
                    {Math.ceil((parsedRecipients.length * delaySeconds) / 60)} min
                  </strong>{' '}
                  ({delaySeconds}s staggered delay across {parsedRecipients.length} jobs)
                </span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <Check className="h-3 w-3" /> Auto Slack Alert Guard
                </span>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || parsedRecipients.length === 0}
              className="gradient-reachinbox-glow px-5 py-2 text-xs font-semibold text-white rounded-xl flex items-center gap-2 hover:opacity-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-glow-indigo"
            >
              {isSubmitting ? (
                <>
                  <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Scheduling Jobs...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Schedule {parsedRecipients.length > 0 ? `${parsedRecipients.length} Emails` : 'Outreach'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ComposeModal;
