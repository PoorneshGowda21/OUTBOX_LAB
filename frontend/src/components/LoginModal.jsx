import React, { useState } from 'react';
import { X, Mail, Shield, Sparkles, UserCheck } from 'lucide-react';
import api from '../services/api';

export const LoginModal = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [emailInput, setEmailInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleCustomLogin = async (email, name, avatar) => {
    setLoading(true);
    try {
      const res = await api.loginGoogle({
        userInfo: {
          email,
          name,
          avatar: avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff`,
        },
      });
      onLoginSuccess(res.user);
      onClose();
    } catch (err) {
      alert('Login failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const demoAccounts = [
    {
      name: 'Poornesh Gowda',
      email: 'poornesh@reachinbox.ai',
      role: 'Growth Engineer',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    },
    {
      name: 'Alex Johnson',
      email: 'alex.j@outreach.io',
      role: 'Lead Outreach Strategist',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-md bg-[#111827] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg gradient-reachinbox flex items-center justify-center">
              <Mail className="h-4 w-4 text-white" />
            </div>
            <h3 className="text-sm font-semibold text-white">Sign In to ReachInbox</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Google OAuth button */}
          <div className="space-y-3 text-center">
            <button
              onClick={() => handleCustomLogin('poornesh@reachinbox.ai', 'Poornesh Gowda')}
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-700 bg-white hover:bg-slate-100 text-slate-900 font-medium text-xs flex items-center justify-center gap-3 transition-all shadow-sm"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
            <p className="text-[11px] text-slate-400">Authenticates session with ReachInbox Scheduler API</p>
          </div>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-800"></div>
            <span className="flex-shrink mx-3 text-[11px] text-slate-400 uppercase font-semibold">Or Pick a Role Profile</span>
            <div className="flex-grow border-t border-slate-800"></div>
          </div>

          {/* Quick Profiles */}
          <div className="space-y-2">
            {demoAccounts.map((account, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleCustomLogin(account.email, account.name, account.avatar)}
                className="w-full p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-850 border border-slate-800 hover:border-brand-500/40 text-left flex items-center justify-between transition-all group"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={account.avatar}
                    alt={account.name}
                    className="h-8 w-8 rounded-full object-cover border border-slate-700"
                  />
                  <div>
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-brand-300 transition-colors">
                      {account.name}
                    </div>
                    <div className="text-[11px] text-slate-400">{account.email}</div>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  {account.role}
                </span>
              </button>
            ))}
          </div>

          {/* Custom manual credentials input */}
          <div className="pt-2">
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer hover:text-slate-300 font-medium">Use custom email credentials</summary>
              <div className="mt-3 space-y-2.5">
                <input
                  type="text"
                  placeholder="Your Name"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200"
                />
                <input
                  type="email"
                  placeholder="name@company.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200"
                />
                <button
                  type="button"
                  onClick={() => handleCustomLogin(emailInput || 'user@reachinbox.ai', nameInput || 'ReachInbox User')}
                  className="w-full py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-medium"
                >
                  Sign In with Custom Email
                </button>
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginModal;
