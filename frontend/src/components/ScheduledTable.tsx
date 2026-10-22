import React from 'react';
import { Clock, AlertCircle, Ban, Eye, Mail, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { EmailJob } from '../types';

interface ScheduledTableProps {
  emails: EmailJob[];
  loading: boolean;
  onCancel: (id: string) => void;
  onViewDetails: (email: EmailJob) => void;
  onOpenCompose: () => void;
}

export const ScheduledTable: React.FC<ScheduledTableProps> = ({
  emails,
  loading,
  onCancel,
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
        <div className="mx-auto h-14 w-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-4 border border-indigo-500/20">
          <Clock className="h-7 w-7" />
        </div>
        <h4 className="text-base font-semibold text-white mb-1">No scheduled emails in queue</h4>
        <p className="text-xs text-slate-400 max-w-sm mx-auto mb-6">
          Ready to launch your outreach campaign? Schedule emails with custom throttling and hourly limits.
        </p>
        <button
          onClick={onOpenCompose}
          className="gradient-reachinbox-glow px-4 py-2 text-xs font-semibold text-white rounded-xl inline-flex items-center gap-2 hover:opacity-95 transition-all shadow-glow-indigo"
        >
          <Mail className="h-3.5 w-3.5" />
          Compose New Email
        </button>
      </div>
    );
  }

  const getStatusBadge = (status: EmailJob['status']) => {
    switch (status) {
      case 'RATE_LIMITED_RESCHEDULED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <AlertCircle className="h-3 w-3" />
            Rate-Limited (Rescheduled)
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-ping"></span>
            Sending via SMTP...
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
            <Ban className="h-3 w-3" />
            Cancelled
          </span>
        );
      case 'SCHEDULED':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
            <Clock className="h-3 w-3" />
            Queued in BullMQ
          </span>
        );
    }
  };

  return (
    <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-800">
            <tr>
              <th className="py-3.5 px-5">Recipient / Lead</th>
              <th className="py-3.5 px-4">Subject</th>
              <th className="py-3.5 px-4">Sender</th>
              <th className="py-3.5 px-4">Scheduled For</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {emails.map((job) => {
              const scheduledDate = new Date(job.scheduledAt);
              const isPast = scheduledDate.getTime() < Date.now();
              const relativeTime = isPast ? 'Processing soon...' : `in ${formatDistanceToNow(scheduledDate)}`;

              return (
                <tr
                  key={job.id}
                  className="hover:bg-slate-800/40 transition-colors group"
                >
                  {/* Recipient */}
                  <td className="py-3.5 px-5 font-medium text-slate-200">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                        <Mail className="h-3.5 w-3.5" />
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

                  {/* Scheduled Time */}
                  <td className="py-3.5 px-4 text-slate-300">
                    <div className="font-medium text-indigo-300 flex items-center gap-1">
                      <Clock className="h-3 w-3 text-indigo-400" />
                      {relativeTime}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {format(scheduledDate, 'MMM d, yyyy h:mm:ss a')}
                    </div>
                  </td>

                  {/* Status Badge */}
                  <td className="py-3.5 px-4">
                    {getStatusBadge(job.status)}
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-5 text-right space-x-1">
                    <button
                      onClick={() => onViewDetails(job)}
                      title="View Details"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    {job.status !== 'CANCELLED' && job.status !== 'PROCESSING' && (
                      <button
                        onClick={() => onCancel(job.id)}
                        title="Cancel Scheduled Job"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      >
                        <Ban className="h-3.5 w-3.5" />
                      </button>
                    )}
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

export default ScheduledTable;
