import React from 'react';
import { Calendar, CheckCircle, Clock, AlertTriangle, Cpu, Layers } from 'lucide-react';
import { StatsData } from '../types';

interface StatsCardsProps {
  stats: StatsData | null;
  loading: boolean;
}

export const StatsCards: React.FC<StatsCardsProps> = ({ stats, loading }) => {
  const cards = [
    {
      title: 'Scheduled Emails',
      value: stats ? stats.totalScheduled : 0,
      subtext: stats ? `${stats.queue?.delayed || 0} in BullMQ delayed queue` : 'Loading...',
      icon: Calendar,
      color: 'text-indigo-400',
      bgColor: 'bg-indigo-500/10',
      borderColor: 'border-indigo-500/20',
    },
    {
      title: 'Sent Successfully',
      value: stats ? stats.totalSent : 0,
      subtext: 'Delivered via Ethereal SMTP',
      icon: CheckCircle,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20',
    },
    {
      title: 'Rate-Limit Rescheduled',
      value: stats ? stats.totalRescheduled : 0,
      subtext: 'Deferred to next hour window',
      icon: Clock,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
    },
    {
      title: 'Failed Sends',
      value: stats ? stats.totalFailed : 0,
      subtext: 'Max retries exhausted',
      icon: AlertTriangle,
      color: 'text-rose-400',
      bgColor: 'bg-rose-500/10',
      borderColor: 'border-rose-500/20',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className={`glass-panel p-5 rounded-xl border ${card.borderColor} transition-all hover:translate-y-[-2px]`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {card.title}
              </span>
              <div className={`p-2 rounded-lg ${card.bgColor}`}>
                <Icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold tracking-tight text-white">
                {loading ? (
                  <div className="h-8 w-16 bg-slate-800 animate-pulse rounded"></div>
                ) : (
                  card.value.toLocaleString()
                )}
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-500"></span>
              {card.subtext}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export default StatsCards;
