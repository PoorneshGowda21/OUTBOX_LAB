import React from 'react';
import { X, Mail, Clock, ExternalLink, ShieldCheck, AlertCircle, Hash, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

export const EmailDetailModal = ({
  email,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !email) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-xl bg-[#111827] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-brand-500/10 text-brand-400">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Email Job Audit Inspector</h3>
              <p className="text-[11px] text-slate-400 font-mono">ID: {email.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
          {/* Status & Preview Bar */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">State:</span>
              <span className="font-semibold text-slate-100 uppercase tracking-wider text-[11px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700">
                {email.status}
              </span>
            </div>
            {email.etherealPreviewUrl && (
              <a
                href={email.etherealPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="gradient-reachinbox-glow px-3 py-1 rounded-lg text-white font-semibold flex items-center gap-1.5 text-xs shadow-sm hover:opacity-95"
              >
                <span>Open in Ethereal</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {/* Grid Metadata */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Recipient Lead</div>
              <div className="text-xs font-semibold text-white mt-0.5">{email.recipientEmail}</div>
            </div>
            <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Sender Mailbox</div>
              <div className="text-xs font-semibold text-white mt-0.5">{email.senderEmail}</div>
            </div>
            <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Scheduled Target</div>
              <div className="text-xs font-medium text-slate-200 mt-0.5">
                {format(new Date(email.scheduledAt), 'MMM d, yyyy h:mm:ss a')}
              </div>
            </div>
            <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Sent Timestamp</div>
              <div className="text-xs font-medium text-slate-200 mt-0.5">
                {email.sentAt ? format(new Date(email.sentAt), 'MMM d, yyyy h:mm:ss a') : 'Pending'}
              </div>
            </div>
          </div>

          {/* Queue & Idempotency parameters */}
          <div className="p-3.5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-400">BullMQ Job ID:</span>
              <span className="text-slate-200">{email.bullJobId || 'Dynamic'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Idempotency Key:</span>
              <span className="text-slate-300 truncate max-w-xs">{email.idempotencyKey}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Provider Throttling Delay:</span>
              <span className="text-slate-200">{Math.round(email.delayBetweenEmailsMs / 1000)} seconds</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Hourly Limit Ceiling:</span>
              <span className="text-slate-200">{email.hourlyLimit} emails/hour</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Attempts Made:</span>
              <span className="text-slate-200">{email.attempts} attempt(s)</span>
            </div>
          </div>

          {/* Error notice if failed */}
          {email.lastError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <div>
                <strong>Error reason:</strong> {email.lastError}
              </div>
            </div>
          )}

          {/* Subject & Body */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-400 mb-1">Subject</div>
              <div className="p-2.5 bg-slate-900 rounded-lg text-slate-100 font-medium">
                {email.subject}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-400 mb-1">Message Content</div>
              <div className="p-3 bg-slate-900 rounded-lg text-slate-300 whitespace-pre-wrap font-sans text-xs max-h-36 overflow-y-auto">
                {email.body}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800/80 bg-slate-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailDetailModal;
