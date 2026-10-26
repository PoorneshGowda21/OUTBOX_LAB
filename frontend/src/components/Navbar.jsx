import React from 'react';
import { Mail, Activity, Slack, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';

export const Navbar = ({
  user,
  slackStatus,
  onOpenSlackModal,
  onLogout,
  onOpenLoginModal,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#0B0F19]/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl gradient-reachinbox flex items-center justify-center shadow-glow-indigo">
            <Mail className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight text-white">ReachInbox</span>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20">
                Scheduler v2.0
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">Production BullMQ + Redis Cold Outreach Engine</p>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Live BullMQ Dashboard link */}
          <a
            href="http://localhost:5000/admin/queues"
            target="_blank"
            rel="noopener noreferrer"
            title="Open Live BullMQ Queue Monitoring Dashboard"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition-all hover:border-brand-500/50 shadow-sm"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <Activity className="h-3.5 w-3.5 text-brand-400" />
            <span className="hidden md:inline">Live Queue Board</span>
          </a>

          {/* Slack Integration status badge & trigger */}
          <button
            onClick={onOpenSlackModal}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              slackStatus.connected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-600 hover:text-white'
            }`}
          >
            <Slack className={`h-3.5 w-3.5 ${slackStatus.connected ? 'text-emerald-400' : 'text-slate-400'}`} />
            <span className="hidden sm:inline">
              {slackStatus.connected ? (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Slack Connected
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 text-amber-400" />
                  Connect Slack
                </span>
              )}
            </span>
          </button>

          {/* User profile / Login */}
          {user ? (
            <div className="flex items-center gap-3 pl-2 sm:border-l sm:border-slate-800">
              <div className="flex items-center gap-2.5">
                <img
                  src={
                    user.avatar ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=6366f1&color=fff`
                  }
                  alt={user.name}
                  className="h-8 w-8 rounded-full border border-slate-700 object-cover"
                />
                <div className="hidden lg:block text-left">
                  <div className="text-xs font-medium text-slate-200">{user.name}</div>
                  <div className="text-[11px] text-slate-400">{user.email}</div>
                </div>
              </div>
              <button
                onClick={onLogout}
                title="Logout"
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenLoginModal}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-brand-600 hover:bg-brand-500 text-white transition-all shadow-sm"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
