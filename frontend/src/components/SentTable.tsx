import React from 'react';
import { CheckCircle2, AlertTriangle, ExternalLink, Mail, Clock, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { EmailJob } from '../types';

interface SentTableProps {
  emails: EmailJob[];
  loading: boolean;
  onViewDetails: (email: EmailJob) => void;
  onOpenCompose: () => void;
}

export const SentTable: React.FC<SentTableProps> = ({
  emails,
  loading,
  onViewDetails,
  onOpenCompose,
}) => {
  if (loading) {
    return (
      <div className="glass-panel rounded-2xl p-6 border border-slate-800">
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between py-3 border-b border-slate-800/60 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-slate-800"></div>
                <div className="space-y-1.5">
                  <div className="h-4 w-44 bg-slate-800 rounded"></div>
                  <div className="h-3 w-64 bg-slate-800/60 rounded"></div>
                </div>
              </div>
              <div className="h-6 w-24 bg-slate-800 rounded-full"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-12 text-center border border-slate-800">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-4 border border-emerald-500/20">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h4 className="text-base font-semibold text-white mb-1">No sent emails recorded yet</h4>
        <p className="text-xs text-slate-400 max-w-sm mx-auto mb-6">
          Once your scheduled emails are dispatched by the BullMQ worker via Ethereal SMTP, they will appear here with live preview links.
        </p>
        <button
          onClick={onOpenCompose}
          className="gradient-reachinbox-glow px-4 py-2 text-xs font-semibold text-white rounded-xl inline-flex items-center gap-2 hover:opacity-95 transition-all shadow-glow-indigo"
        >
          <Mail className="h-3.5 w-3.5" />
          Schedule Your First Email
        </button>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-800">
            <tr>
              <th className="py-3.5 px-5">Recipient / Lead</th>
              <th className="py-3.5 px-4">Subject</th>
              <th className="py-3.5 px-4">Sender</th>
              <th className="py-3.5 px-4">Sent At</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4">Ethereal Preview</th>
              <th className="py-3.5 px-5 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {emails.map((job) => {
              const sentDate = job.sentAt ? new Date(job.sentAt) : new Date(job.updatedAt);
              const isSent = job.status === 'SENT';

              return (
                <tr
                  key={job.id}
                  className="hover:bg-slate-800/40 transition-colors group"
                >
                  {/* Recipient */}
                  <td className="py-3.5 px-5 font-medium text-slate-200">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0 border border-emerald-500/20">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-100">{job.recipientEmail}</div>
                        <div className="text-[10px] text-slate-500 font-mono">Job: {job.id.substring(0, 8)}...</div>
                      </div>
                    </div>
                  </td>

                  {/* Subject */}
                  <td className="py-3.5 px-4 text-slate-300 max-w-xs truncate font-medium">
                    {job.subject}
                  </td>

                  {/* Sender */}
                  <td className="py-3.5 px-4 text-slate-400">
                    <span className="px-2 py-0.5 rounded-md bg-slate-800/80 text-[11px] border border-slate-700/60">
                      {job.senderEmail}
                    </span>
                  </td>

                  {/* Sent Time */}
                  <td className="py-3.5 px-4 text-slate-300">
                    <div className="font-medium text-slate-200">
                      {format(sentDate, 'MMM d, yyyy h:mm:ss a')}
                    </div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" /> Delay: {Math.round(job.delayBetweenEmailsMs / 1000)}s
                    </div>
                  </td>

                  {/* Status Badge */}
                  <td className="py-3.5 px-4">
                    {isSent ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        <CheckCircle2 className="h-3 w-3" />
                        Delivered
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30"
                        title={job.lastError || 'Delivery failed'}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Failed
                      </span>
                    )}
                  </td>

                  {/* Ethereal Preview URL Link */}
                  <td className="py-3.5 px-4">
                    {job.etherealPreviewUrl ? (
                      <a
                        href={job.etherealPreviewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-brand-300 bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 transition-all shadow-sm group-hover:border-brand-400"
                      >
                        <span>View in Ethereal</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-slate-500 text-[11px]">—</span>
                    )}
                  </td>

                  {/* Details button */}
                  <td className="py-3.5 px-5 text-right">
                    <button
                      onClick={() => onViewDetails(job)}
                      title="Inspect Email Record"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SentTable;
