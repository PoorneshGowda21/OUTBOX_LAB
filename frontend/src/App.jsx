import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  Calendar,
  Send,
  Search,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle2,
  Users,
  Activity,
  Layers,
  Sparkles,
  Zap,
} from 'lucide-react';
import api from './services/api';
import Navbar from './components/Navbar';
import StatsCards from './components/StatsCards';
import ScheduledTable from './components/ScheduledTable';
import SentTable from './components/SentTable';
import SendersView from './components/SendersView';
import ComposeModal from './components/ComposeModal';
import SlackModal from './components/SlackModal';
import LoginModal from './components/LoginModal';
import EmailDetailModal from './components/EmailDetailModal';

export const App = () => {
  // Authentication State
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('reachinbox_user');
    return saved
      ? JSON.parse(saved)
      : {
          id: 'admin-1',
          name: 'Poornesh Gowda',
          email: 'poornesh@reachinbox.ai',
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
        };
  });

  // Navigation State
  const [activeTab, setActiveTab] = useState('scheduled');

  // Modals
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isSlackOpen, setIsSlackOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(null);

  // Data State
  const [scheduledEmails, setScheduledEmails] = useState([]);
  const [sentEmails, setSentEmails] = useState([]);
  const [senders, setSenders] = useState([]);
  const [stats, setStats] = useState(null);
  const [slackStatus, setSlackStatus] = useState({
    connected: false,
    channel: null,
    teamName: null,
    lastNotifiedAt: null,
    hasWebhook: false,
  });

  // Search & Loading
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSource, setSearchSource] = useState('elasticsearch');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Save user in localStorage
  useEffect(() => {
    if (user) {
      localStorage.setItem('reachinbox_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('reachinbox_user');
    }
  }, [user]);

  // Fetch all dashboard data
  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setRefreshing(true);

    try {
      const [statsRes, schedRes, sentRes, slackRes] = await Promise.all([
        api.getStats().catch(() => null),
        api.getScheduledEmails({ search: searchQuery }).catch(() => ({ emails: [] })),
        api.getSentEmails({ search: searchQuery }).catch(() => ({ emails: [] })),
        api.getSlackStatus(user?.id).catch(() => ({
          connected: false,
          channel: null,
          teamName: null,
          lastNotifiedAt: null,
          hasWebhook: false,
        })),
      ]);

      if (statsRes) {
        setStats(statsRes.stats);
        if (statsRes.senders) setSenders(statsRes.senders);
      }

      if (schedRes && schedRes.emails) {
        setScheduledEmails(schedRes.emails);
      }

      if (sentRes && sentRes.emails) {
        setSentEmails(sentRes.emails);
      }

      if (slackRes) {
        setSlackStatus(slackRes);
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery, user]);

  // Initial load and live polling interval
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData(true);
    }, 4000); // 4-second auto-poll for live status updates
    return () => clearInterval(interval);
  }, [fetchData]);

  // Handle Search input
  const handleSearchChange = async (e) => {
    const q = e.target.value;
    setSearchQuery(q);

    if (q.trim()) {
      try {
        const searchResults = await api.searchEmails(q);
        setSearchSource(searchResults.source);
        if (activeTab === 'scheduled') {
          setScheduledEmails(
            searchResults.emails.filter((em) =>
              ['SCHEDULED', 'PENDING', 'PROCESSING', 'RATE_LIMITED_RESCHEDULED'].includes(em.status)
            )
          );
        } else if (activeTab === 'sent') {
          setSentEmails(
            searchResults.emails.filter((em) => ['SENT', 'FAILED'].includes(em.status))
          );
        }
      } catch (err) {
        console.error('Search error:', err);
      }
    } else {
      fetchData(true);
    }
  };

  // Handle Cancel Email
  const handleCancelEmail = async (id) => {
    if (!confirm('Are you sure you want to cancel this scheduled email?')) return;
    try {
      await api.cancelEmail(id);
      fetchData(true);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to cancel email');
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col font-sans selection:bg-brand-500 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        user={user}
        slackStatus={slackStatus}
        onOpenSlackModal={() => setIsSlackOpen(true)}
        onLogout={() => setUser(null)}
        onOpenLoginModal={() => setIsLoginOpen(true)}
      />

      {/* Hero Glow Accent */}
      <div className="relative isolate pointer-events-none select-none">
        <div
          className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80 pointer-events-none"
          aria-hidden="true"
        >
          <div
            className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#6366f1] to-[#a855f7] opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem] pointer-events-none"
            style={{
              clipPath:
                'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
            }}
          />
        </div>
      </div>

      {/* Main Container */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Email Outreach Dispatcher
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                BullMQ Ready
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              High-throughput asynchronous email scheduler with provider throttling, hourly rate limits, and Slack alerts.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchData()}
              disabled={refreshing}
              title="Refresh queue status"
              className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 transition-all"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-brand-400' : ''}`} />
            </button>

            <button
              onClick={() => setIsComposeOpen(true)}
              className="gradient-reachinbox-glow px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white flex items-center gap-2 hover:opacity-95 transition-all shadow-glow-indigo"
            >
              <Plus className="h-4 w-4" />
              <span>Compose New Email</span>
            </button>
          </div>
        </div>

        {/* Top Metric Cards */}
        <StatsCards stats={stats} loading={loading && !stats} />

        {/* Tab Navigation & Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-800 pb-4">
          {/* Tabs */}
          <div className="flex items-center gap-2">
            <button
              id="tab-scheduled"
              onClick={() => setActiveTab('scheduled')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'scheduled'
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>Scheduled Emails</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                {stats?.totalScheduled || scheduledEmails.length}
              </span>
            </button>

            <button
              id="tab-sent"
              onClick={() => setActiveTab('sent')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'sent'
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Send className="h-3.5 w-3.5" />
              <span>Sent Emails</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                {stats?.totalSent || sentEmails.length}
              </span>
            </button>

            <button
              id="tab-senders"
              onClick={() => setActiveTab('senders')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'senders'
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>Rate Limits &amp; Throughput</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[260px]">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search by subject, lead, or body..."
              className="w-full pl-9 pr-20 py-2 text-xs bg-slate-900/90 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
            />
            {searchQuery && (
              <span className="absolute right-2.5 top-2 text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30">
                {searchSource === 'elasticsearch' ? 'Elasticsearch' : 'DB Search'}
              </span>
            )}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'scheduled' && (
          <ScheduledTable
            emails={scheduledEmails}
            loading={loading}
            onCancel={handleCancelEmail}
            onViewDetails={(em) => setSelectedEmail(em)}
            onOpenCompose={() => setIsComposeOpen(true)}
          />
        )}

        {activeTab === 'sent' && (
          <SentTable
            emails={sentEmails}
            loading={loading}
            onViewDetails={(em) => setSelectedEmail(em)}
            onOpenCompose={() => setIsComposeOpen(true)}
          />
        )}

        {activeTab === 'senders' && (
          <SendersView senders={senders} onRefresh={() => fetchData(true)} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-400 bg-[#0B0F19]">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-300">ReachInbox Scheduler</span>
            <span>•</span>
            <span>BullMQ + Redis Persistent Queues</span>
            <span>•</span>
            <span>PostgreSQL &amp; Ethereal Fake SMTP</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-400">
            <a
              href="http://localhost:5000/admin/queues"
              target="_blank"
              rel="noreferrer"
              className="hover:text-brand-400 transition-colors"
            >
              Queue Monitor
            </a>
            <button onClick={() => setIsSlackOpen(true)} className="hover:text-brand-400 transition-colors">
              Slack Configuration
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        senders={senders}
        onScheduledSuccess={() => {
          fetchData(true);
          setActiveTab('scheduled');
        }}
      />

      <SlackModal
        isOpen={isSlackOpen}
        onClose={() => setIsSlackOpen(false)}
        slackStatus={slackStatus}
        onStatusUpdated={() => fetchData(true)}
      />

      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onLoginSuccess={(loggedUser) => setUser(loggedUser)}
      />

      <EmailDetailModal
        email={selectedEmail}
        isOpen={!!selectedEmail}
        onClose={() => setSelectedEmail(null)}
      />
    </div>
  );
};

export default App;
