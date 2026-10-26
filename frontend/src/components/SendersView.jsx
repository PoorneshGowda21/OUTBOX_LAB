import React, { useState } from 'react';
import { Users, Plus, Shield, Gauge, AlertCircle, CheckCircle2 } from 'lucide-react';
import api from '../services/api';

export const SendersView = ({ senders, onRefresh }) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newLimit, setNewLimit] = useState(50);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddSender = async (e) => {
    e.preventDefault();
    if (!newEmail || !newName) return;

    setIsSubmitting(true);
    try {
      await api.createSender({
        email: newEmail,
        name: newName,
        hourlyLimit: newLimit,
      });
      setNewEmail('');
      setNewName('');
      setShowAddForm(false);
      onRefresh();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create sender');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">Sender Throughput &amp; Rate Limit Monitoring</h3>
          <p className="text-xs text-slate-400">
            Real-time hourly window tracking per mailbox. Excess jobs are automatically rescheduled to the next window.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-3 py-1.5 text-xs font-medium rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-all"
        >
          <Plus className="h-3.5 w-3.5 text-brand-400" />
          {showAddForm ? 'Cancel' : 'Add Mailbox'}
        </button>
      </div>

      {/* Add Sender Form */}
      {showAddForm && (
        <form onSubmit={handleAddSender} className="glass-panel p-4 rounded-xl border border-slate-700/80 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1">Sender Email</label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="e.g. outreach@reachinbox.ai"
                className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1">Display Name</label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Michael Scott"
                className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1">Hourly Limit</label>
              <input
                type="number"
                min={5}
                max={1000}
                value={newLimit}
                onChange={(e) => setNewLimit(parseInt(e.target.value, 10) || 50)}
                className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="gradient-reachinbox-glow px-4 py-1.5 text-xs font-semibold text-white rounded-lg transition-all"
            >
              {isSubmitting ? 'Saving...' : 'Save Mailbox'}
            </button>
          </div>
        </form>
      )}

      {/* Senders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {senders.map((sender) => {
          const sent = sender.currentHourSent || 0;
          const limit = sender.hourlyLimit;
          const percentage = Math.min(100, Math.round((sent / limit) * 100));
          const isExceeded = sent >= limit;

          return (
            <div
              key={sender.id}
              className={`glass-panel p-5 rounded-2xl border transition-all ${
                isExceeded ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-slate-800 flex items-center justify-center text-brand-400 border border-slate-700">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">{sender.name}</h4>
                    <p className="text-xs text-slate-400 font-mono">{sender.email}</p>
                  </div>
                </div>

                {isExceeded ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    <AlertCircle className="h-3 w-3" /> Rate Limited
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3" /> Available
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5 mt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Current Hour Window Throughput:</span>
                  <span className="font-semibold text-slate-200">
                    {sent} / {limit} emails ({percentage}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      isExceeded
                        ? 'bg-amber-400'
                        : percentage > 75
                        ? 'bg-indigo-400'
                        : 'bg-gradient-to-r from-brand-500 to-indigo-400'
                    }`}
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Gauge className="h-3 w-3 text-brand-400" /> Hourly Ceiling: {limit}/hr
                </span>
                <span>
                  Remaining: <strong className="text-slate-200">{Math.max(0, limit - sent)}</strong>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SendersView;
