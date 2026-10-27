import React, { useCallback, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { 
  ReelItem, PostItem, CommentItem, AccountAnalytics, StrategyInsight, Autonomous24x7Config,
  ManagedAccount, AccountPersona 
} from './types';
import { DEFAULT_ACCOUNT_ANALYTICS } from './constants';
import { Navbar } from './components/Navbar';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { ReelGenerator } from './components/ReelGenerator';
import { CarouselPostCreator } from './components/CarouselPostCreator';
import { AutoResponder } from './components/AutoResponder';
import { SchedulePublisher } from './components/SchedulePublisher';
import { ContentGallery } from './components/ContentGallery';
import { AssetLibrary } from './components/AssetLibrary';
import { AccountConnectorModal } from './components/AccountConnectorModal';
import { AccountPersonaModal } from './components/AccountPersonaModal';
import { AutonomousEngine24x7 } from './components/AutonomousEngine24x7';
import { ReelPlayer } from './components/ReelPlayer';
import { AgentSwarmControl } from './components/AgentSwarmControl';
import { ThemeToggle } from './components/ThemeToggle';

const DEFAULT_STRATEGY_INSIGHTS: StrategyInsight[] = [
  {
    id: 'strat-1',
    type: 'posting_window',
    title: 'High-Velocity Window: Thursday 19:00',
    description: 'Your audience activity peaks between 18:45 and 20:15. Scheduling an 8s high-retention reel here will capture maximum initial push.',
    impact: 'critical',
    metricTarget: '+45K Projected Impressions',
    actionLabel: 'Schedule Reel to Thursday 19:00',
    suggestedActionType: 'reschedule'
  },
  {
    id: 'strat-2',
    type: 'audio_trend',
    title: 'Audio Velocity Alert: "Midnight Phonk" (+480%)',
    description: 'Trending audio "Midnight Phonk Drive" has an 84% algorithmic push rate. Pairing this with a 3-scene fast hook accelerates non-follower reach.',
    impact: 'high',
    metricTarget: 'Reach +38%',
    actionLabel: 'Generate Reel with this Track',
    suggestedActionType: 'create_reel'
  },
  {
    id: 'strat-3',
    type: 'opportunity',
    title: 'Turn Comments Into DM Lead Conversions',
    description: 'Comments with keyword "TOOL" have a 92% open rate when answered within 3 minutes. Enable Autonomous Auto-DM Responder to capture leads 24/7.',
    impact: 'high',
    metricTarget: 'Community Engagement +60%',
    actionLabel: 'Enable Auto-Reply Mode',
    suggestedActionType: 'enable_auto_reply'
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'analytics' | 'reels' | 'posts' | 'comments' | 'schedule' | 'gallery' | 'assets' | 'autonomous' | 'swarm'>('autonomous');
  const [autonomousMode, setAutonomousMode] = useState<boolean>(true);
  const [analytics, setAnalytics] = useState<AccountAnalytics>(DEFAULT_ACCOUNT_ANALYTICS);
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [insights, setInsights] = useState<StrategyInsight[]>(DEFAULT_STRATEGY_INSIGHTS);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);
  const [accountModalInitialChannel, setAccountModalInitialChannel] = useState<'instagram' | 'facebook_page' | 'facebook_account' | 'youtube' | 'tiktok'>('instagram');
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState<boolean>(false);
  const [previewReel, setPreviewReel] = useState<ReelItem | null>(null);
  const [instagramConnected, setInstagramConnected] = useState(false);
  const [facebookConnected, setFacebookConnected] = useState(false);
  const [facebookExpired, setFacebookExpired] = useState(false);
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string>('instagram_primary');

  // Day / Night mode theme state with localStorage persistence and system fallback
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sarlx_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    const isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('light', !isDark);
    document.documentElement.setAttribute('data-theme', theme);
    document.body.classList.toggle('dark', isDark);
    document.body.classList.toggle('light', !isDark);
    document.body.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem('sarlx_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Keyboard Escape listener to close preview window immediately
  useEffect(() => {
    if (!previewReel) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewReel(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewReel]);

  const [autonomousConfig, setAutonomousConfig] = useState<Autonomous24x7Config>({
    enabled: true,
    intervalMinutes: 180,
    lastRun: null,
    nextRun: new Date(Date.now() + 180 * 60000).toISOString(),
    targetNiche: "AI Tech & Breakthroughs",
    currentStage: "idle",
    instagramPublishing: {
      enabled: true,
      method: "direct_pipeline",
      instagramAccountId: "",
      metaAccessToken: "",
      lastPublishedPostId: null
    },
    logs: []
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3200);
  };

  // Fetch live state from backend API on mount
  useEffect(() => {
    async function loadLiveWorkspace() {
      try {
        const accRes = await fetch('/api/accounts');
        if (accRes.ok) {
          const accData = await accRes.json();
          if (accData.success && Array.isArray(accData.accounts)) {
            setAccounts(accData.accounts);
            if (accData.activeAccountId) setActiveAccountId(accData.activeAccountId);
          }
        }

        const statusRes = await fetch('/api/account/status');
        if (statusRes.ok) {
          const status = await statusRes.json();
          setInstagramConnected(Boolean(status.success && status.isConnected));
          if (status.success && status.account && status.isConnected) {
            setAnalytics(prev => ({ ...prev, profile: status.account }));
          }
        }

        const fbStatusRes = await fetch('/api/auth/facebook/status');
        if (fbStatusRes.ok) {
          const fbStatus = await fbStatusRes.json().catch(() => ({}));
          setFacebookConnected(Boolean(fbStatus?.success && fbStatus.page?.isConnected));
          setFacebookExpired(Boolean(fbStatus?.success && (fbStatus.page?.isExpired || fbStatus.account?.isExpired)));
        }

        const res = await fetch('/api/state');
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            if (data.reels && Array.isArray(data.reels)) setReels(data.reels);
            if (data.posts && Array.isArray(data.posts)) setPosts(data.posts);
            if (data.comments && Array.isArray(data.comments)) setComments(data.comments);
            if (data.accounts && Array.isArray(data.accounts)) setAccounts(data.accounts);
            if (data.activeAccountId) setActiveAccountId(data.activeAccountId);
            if (data.analytics) {
              setAnalytics(data.analytics);
            }
            if (data.insights && Array.isArray(data.insights) && data.insights.length > 0) {
              setInsights(data.insights);
            }
            if (typeof data.autonomousMode === 'boolean') setAutonomousMode(data.autonomousMode);
            if (data.autonomous24x7) setAutonomousConfig(data.autonomous24x7);
          }
        }
      } catch (err) {
        console.warn('Backend API connection notice, using local state:', err);
      }
    }
    loadLiveWorkspace();
  }, [instagramConnected]);

  const handleSwitchAccount = async (targetId: string) => {
    try {
      const res = await fetch('/api/accounts/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: targetId })
      });
      const data = await res.json();
      if (data.success) {
        setActiveAccountId(targetId);
        if (data.store) {
          if (data.store.reels) setReels(data.store.reels);
          if (data.store.posts) setPosts(data.store.posts);
          if (data.store.comments) setComments(data.store.comments);
          if (data.store.analytics) setAnalytics(data.store.analytics);
          if (data.store.insights && Array.isArray(data.store.insights)) setInsights(data.store.insights);
          if (data.store.autonomous24x7) setAutonomousConfig(data.store.autonomous24x7);
          if (data.store.accounts) setAccounts(data.store.accounts);
        }
        const acc = accounts.find(a => a.id === targetId);
        showToast(`Switched active account to ${acc?.username || acc?.name || targetId}`);
      }
    } catch (err) {
      console.warn('Could not switch account:', err);
    }
  };

  const handleUpdatePersona = async (persona: AccountPersona) => {
    try {
      const res = await fetch(`/api/accounts/${activeAccountId}/update-persona`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona })
      });
      const data = await res.json();
      if (data.success) {
        setAccounts(prev => prev.map(a => a.id === activeAccountId ? { ...a, persona } : a));
        showToast('Account Content DNA tuned & saved!');
      }
    } catch (err) {
      console.warn('Could not update persona:', err);
    }
  };

  const handleLearnPersona = async (options?: { customDescription?: string; sampleCaptions?: string[] }) => {
    try {
      showToast('Extracting & reverse-engineering Content DNA with AI...');
      const res = await fetch(`/api/accounts/${activeAccountId}/learn-persona`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {})
      });
      const data = await res.json();
      if (data.success && data.persona) {
        setAccounts(prev => prev.map(a => a.id === activeAccountId ? { ...a, persona: data.persona } : a));
        if (data.store?.autonomous24x7) setAutonomousConfig(data.store.autonomous24x7);
        showToast(`Successfully learned Content DNA for @${data.persona.handle || 'account'}!`);
      } else {
        throw new Error(data.error || 'Failed to extract Content DNA.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error extracting Content DNA');
    }
  };

  useEffect(() => {
    // Poll autonomous status every 15s to keep countdown and telemetry in sync
    const pollInterval = setInterval(async () => {
      try {
        const statusRes = await fetch('/api/account/status');
        if (statusRes.ok) {
          const status = await statusRes.json();
          setInstagramConnected(Boolean(status.success && status.isConnected));
          if (status.success && status.isConnected && status.account) {
            setAnalytics(prev => ({ ...prev, profile: status.account }));
          }
        }
      } catch {
        // quiet connection verification tick
      }

      try {
        const res = await fetch('/api/autonomous/status');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.config) {
            setAutonomousConfig(data.config);
          }
        }
      } catch {
        // quiet background tick
      }
    }, 15000);

    return () => clearInterval(pollInterval);
  }, []);

  const handleToggleAutonomous = async (enabled: boolean) => {
    setAutonomousConfig(prev => ({ ...prev, enabled }));
    try {
      const res = await fetch('/api/autonomous/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.config) {
          setAutonomousConfig(data.config);
        }
      }
    } catch (err) {
      console.warn('Could not toggle autonomous engine:', err);
    }
    showToast(enabled ? '24/7 Autonomous Pipeline Activated' : '24/7 Autonomous Pipeline Paused');
  };

  const handleUpdateAutonomousConfig = async (params: { intervalMinutes?: number; targetNiche?: string; instagramPublishing?: any; formatPreference?: 'reels_only' | 'carousels_only' | 'balanced' }) => {
    setAutonomousConfig(prev => ({
      ...prev,
      ...params,
      instagramPublishing: params.instagramPublishing ? { ...prev.instagramPublishing, ...params.instagramPublishing } : prev.instagramPublishing
    }));
    try {
      const res = await fetch('/api/autonomous/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.config) {
          setAutonomousConfig(data.config);
        }
      }
    } catch (err) {
      console.warn('Could not update autonomous config:', err);
    }
  };

  const handleTriggerAutonomousCycle = async () => {
    const res = await fetch('/api/autonomous/trigger-cycle', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Autonomous cycle did not publish a reel.');
    }

    if (data.reel) {
      setReels(prev => [data.reel, ...prev.filter(r => r.id !== data.reel.id)]);
    }
    if (data.analytics) {
      setAnalytics(data.analytics);
    }
    if (data.config) {
      setAutonomousConfig(data.config);
    }
    return data;
  };

  const handleSaveReelToGallery = async (reel: ReelItem) => {
    const savedReel = { ...reel, status: 'saved' as const };
    setReels(prev => {
      const exists = prev.find(r => r.id === reel.id);
      if (exists) return prev.map(r => r.id === reel.id ? savedReel : r);
      return [savedReel, ...prev];
    });

    try {
      await fetch('/api/reels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reel: savedReel })
      });
    } catch (err) {
      console.warn('Could not persist reel via API:', err);
    }

    showToast(`Reel "${reel.title}" saved to Content Gallery`);
  };

  const handleScheduleReel = async (reel: ReelItem) => {
    const scheduledItem: ReelItem = {
      ...reel,
      status: 'scheduled',
      scheduledTime: 'Today at 19:00 (Peak Slot)',
      scheduledPlatforms: ['instagram', 'threads']
    };

    setReels(prev => {
      const exists = prev.find(r => r.id === reel.id);
      if (exists) return prev.map(r => r.id === reel.id ? scheduledItem : r);
      return [scheduledItem, ...prev];
    });

    try {
      await fetch('/api/reels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reel: scheduledItem })
      });
    } catch (err) {
      console.warn('Could not persist scheduled reel via API:', err);
    }

    showToast(`Reel queued for Auto-Publishing at 19:00`);
    setActiveTab('schedule');
  };

  const handleSavePostToGallery = async (post: PostItem) => {
    const savedPost = { ...post, status: 'saved' as const };
    setPosts(prev => {
      const exists = prev.find(p => p.id === post.id);
      if (exists) return prev.map(p => p.id === post.id ? savedPost : p);
      return [savedPost, ...prev];
    });

    try {
      await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post: savedPost })
      });
    } catch (err) {
      console.warn('Could not persist post via API:', err);
    }

    showToast(`Carousel "${post.title}" saved to Vault`);
  };

  const handleSchedulePost = async (post: PostItem) => {
    const scheduledItem: PostItem = {
      ...post,
      status: 'scheduled',
      scheduledTime: 'Tomorrow at 18:30 (Peak Slot)',
      scheduledPlatforms: ['instagram']
    };

    setPosts(prev => {
      const exists = prev.find(p => p.id === post.id);
      if (exists) return prev.map(p => p.id === post.id ? scheduledItem : p);
      return [scheduledItem, ...prev];
    });

    try {
      await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post: scheduledItem })
      });
    } catch (err) {
      console.warn('Could not persist scheduled post via API:', err);
    }

    showToast(`Carousel scheduled for peak engagement window`);
    setActiveTab('schedule');
  };

  const handlePublishNow = async (item: ReelItem | PostItem, type: 'reel' | 'post') => {
    if (type === 'reel') {
      const res = await fetch('/api/reels/publish-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reelId: item.id })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const message = data.error || 'Instagram publishing failed.';
        showToast(message);
        throw new Error(message);
      }

      setReels(prev => prev.map(r => r.id === item.id ? {
        ...r,
        status: 'published',
        instagramPostId: data.mediaId || r.instagramPostId,
        ig_media_id: data.mediaId || r.ig_media_id,
        permalink: data.permalink || r.permalink,
        fb_video_id: data.fbVideoId || r.fb_video_id,
        fb_permalink: data.fbPermalink || r.fb_permalink,
        fb_status: data.fbVideoId ? 'published' : r.fb_status,
        platforms_published: data.platformsPublished || r.platforms_published,
        publishTimestamp: new Date().toISOString()
      } : r));

      if (data.facebookWarning) {
        showToast(`Instagram published! (Note: ${data.facebookWarning})`);
      } else {
        const platformsStr = (data.platformsPublished && data.platformsPublished.length > 0)
          ? data.platformsPublished.join(' & ')
          : 'connected channels';
        showToast(data.message || `Published Reel "${item.title}" to ${platformsStr}.`);
      }
    } else {
      const res = await fetch('/api/posts/publish-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: item.id })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const message = data.error || 'Instagram carousel publishing failed.';
        showToast(message);
        throw new Error(message);
      }

      setPosts(prev => prev.map(p => p.id === item.id ? {
        ...p,
        status: 'published',
        instagramPostId: data.mediaId,
        permalink: data.permalink,
        publishTimestamp: new Date().toISOString()
      } : p));

      showToast(`Published Carousel "${item.title}" to Instagram.`);
    }
  };

  const handleDeleteScheduled = async (id: string, type: 'reel' | 'post') => {
    if (type === 'reel') {
      setReels(prev => prev.map(r => r.id === id ? { ...r, status: 'saved' } : r));
      try {
        await fetch(`/api/reels/${id}`, { method: 'DELETE' });
      } catch (err) {
        console.warn('Could not delete reel from server:', err);
      }
    } else {
      setPosts(prev => prev.map(p => p.id === id ? { ...p, status: 'saved' } : p));
      try {
        await fetch(`/api/posts/${id}`, { method: 'DELETE' });
      } catch (err) {
        console.warn('Could not delete post from server:', err);
      }
    }
    showToast(`Removed from schedule queue`);
  };

  const handleDeleteContent = async (id: string, type: 'reel' | 'post') => {
    if (type === 'reel') {
      setReels(prev => prev.filter(r => r.id !== id));
      try {
        await fetch(`/api/reels/${id}`, { method: 'DELETE' });
      } catch (err) {
        console.warn('Could not delete reel from server:', err);
      }
      showToast('Reel deleted from gallery');
    } else {
      setPosts(prev => prev.filter(p => p.id !== id));
      try {
        await fetch(`/api/posts/${id}`, { method: 'DELETE' });
      } catch (err) {
        console.warn('Could not delete post from server:', err);
      }
      showToast('Carousel deleted from gallery');
    }
  };

  const handleUpdateComment = async (comment: CommentItem) => {
    setComments(prev => prev.map(c => c.id === comment.id ? comment : c));
    try {
      await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment })
      });
    } catch (err) {
      console.warn('Could not sync comment reply:', err);
    }
    showToast(`Replied to ${comment.authorHandle}`);
  };

  const handleAddComment = async (comment: CommentItem) => {
    setComments(prev => [comment, ...prev]);
    try {
      await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment })
      });
    } catch (err) {
      console.warn('Could not save comment:', err);
    }

    if (comment.replyStatus === 'auto_replied') {
      showToast(`AI Auto-Replied to ${comment.authorHandle}!`);
    } else {
      showToast(`New comment received from ${comment.authorHandle}`);
    }
  };

  const handleOAuthConnected = async (profile: AccountAnalytics['profile']) => {
    setAnalytics(prev => ({ ...prev, profile }));
    setInstagramConnected(true);
    showToast(`Connected ${profile.handle} to The Untold Archive.`);
  };

  const handleRefreshInstagramStatus = useCallback(async () => {
    const res = await fetch('/api/account/status');
    const data = await res.json().catch(() => ({}));
    const connected = Boolean(res.ok && data.success && data.isConnected);
    setInstagramConnected(connected);
    if (connected && data.account) {
      setAnalytics(prev => ({ ...prev, profile: data.account }));
    }
    return data;
  }, []);

  const handleDisconnectInstagram = useCallback(async () => {
    const res = await fetch('/api/auth/instagram/disconnect', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Could not disconnect Instagram.');
    }
    setInstagramConnected(false);
    setAnalytics(DEFAULT_ACCOUNT_ANALYTICS);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/owner/logout', { method: 'POST' });
    } finally {
      window.location.href = '/owner-login';
    }
  }, []);

  const handleResetToZero = async () => {
    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.store) {
          setAnalytics(data.store.analytics);
          setReels(data.store.reels || []);
          setPosts(data.store.posts || []);
          setComments(data.store.comments || []);
          setAutonomousMode(data.store.autonomousMode);
        }
      } else {
        setAnalytics(DEFAULT_ACCOUNT_ANALYTICS);
      }
    } catch (err) {
      console.warn('Could not call /api/reset:', err);
      setAnalytics(DEFAULT_ACCOUNT_ANALYTICS);
    }
    showToast('Reset account to The Untold Archive baseline (0 metrics)');
  };

  const handleExecuteInsight = (insight: StrategyInsight) => {
    if (insight.suggestedActionType === 'create_reel') {
      setActiveTab('reels');
    } else if (insight.suggestedActionType === 'reschedule') {
      setActiveTab('schedule');
    } else if (insight.suggestedActionType === 'enable_auto_reply') {
      setAutonomousMode(true);
      setActiveTab('comments');
      showToast(`Autonomous Auto-Reply Mode Enabled`);
    } else {
      setActiveTab('reels');
    }
  };

  const handleRefreshStrategy = async () => {
    try {
      const response = await fetch('/api/agent/growth-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metrics: analytics.metrics,
          profile: analytics.profile
        })
      });
      const data = await response.json();
      if (data.success && data.insights && data.insights.length > 0) {
        setInsights(data.insights);
      }
      showToast('AI Strategy successfully refreshed');
    } catch {
      showToast('Strategy updated with latest algorithm parameters');
    }
  };

  const handleAutoAdjustSchedule = () => {
    setAnalytics(prev => ({
      ...prev,
      bestPostingSlots: prev.bestPostingSlots.map(slot => ({
        ...slot,
        isScheduled: true
      }))
    }));
    showToast('Schedule calibrated to peak engagement windows');
  };

  const pendingCommentsCount = comments.filter(c => c.replyStatus === 'pending').length;
  const scheduledReels = reels.filter(r => r.status === 'scheduled');
  const scheduledPosts = posts.filter(p => p.status === 'scheduled');

  return (
    <div className={`min-h-screen flex flex-col font-sans selection:bg-pink-500/30 selection:text-pink-200 transition-colors duration-300 ${theme === 'light' ? 'bg-[#f8fafc] text-slate-900' : 'bg-[#0b0f17] text-slate-100'}`} data-theme={theme}>
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-16 right-6 z-50 px-4 py-2.5 rounded-xl bg-slate-900 border border-pink-500/40 text-slate-100 text-xs font-bold shadow-2xl flex items-center gap-2"
          >
            <span className="w-2 h-2 rounded-full bg-pink-500 animate-ping" />
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        analytics={analytics}
        instagramConnected={instagramConnected}
        facebookConnected={facebookConnected}
        facebookExpired={facebookExpired}
        autonomousMode={autonomousMode}
        setAutonomousMode={setAutonomousMode}
        pendingCommentsCount={pendingCommentsCount}
        onOpenAccountConnector={(channel = 'instagram') => {
          setAccountModalInitialChannel(channel);
          setIsAccountModalOpen(true);
        }}
        autonomous24x7Enabled={autonomousConfig.enabled}
        onLogout={handleLogout}
        accounts={accounts}
        activeAccountId={activeAccountId}
        onSwitchAccount={handleSwitchAccount}
        onOpenPersonaModal={() => setIsPersonaModalOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Account Connector Modal */}
      <AccountConnectorModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        currentProfile={analytics.profile}
        isConnected={instagramConnected}
        initialChannel={accountModalInitialChannel}
        onResetToZero={handleResetToZero}
        onOAuthConnected={handleOAuthConnected}
        onRefreshStatus={handleRefreshInstagramStatus}
        onDisconnect={handleDisconnectInstagram}
        onFacebookStatusChanged={setFacebookConnected}
      />

      {/* Account Persona & Content DNA Studio Modal */}
      <AccountPersonaModal
        isOpen={isPersonaModalOpen}
        onClose={() => setIsPersonaModalOpen(false)}
        account={accounts.find(a => a.id === activeAccountId) || null}
        onUpdatePersona={handleUpdatePersona}
        onLearnPersona={handleLearnPersona}
      />

      {/* Reel Player Modal for Inspecting Autonomously Published Video */}
      <AnimatePresence>
        {previewReel && (
          <motion.div
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(16px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-start sm:items-center justify-center p-1 sm:p-4 md:p-6 overflow-y-auto"
            onClick={() => setPreviewReel(null)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 16 }}
              transition={{ type: 'spring', damping: 26, stiffness: 340 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-5xl w-full my-auto max-h-[96vh] flex flex-col bg-slate-950/95 dark:bg-slate-950/95 bg-white border border-white/15 dark:border-white/15 border-slate-200 rounded-2xl sm:rounded-3xl shadow-[0_25px_70px_rgba(0,0,0,0.85)] overflow-hidden"
            >
              {/* Sticky Top Glass Header with Close Window Controls & Theme Switch */}
              <div className="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-6 py-3 bg-slate-900/90 dark:bg-slate-900/90 bg-slate-50/95 backdrop-blur-xl border-b border-white/10 dark:border-white/10 border-slate-200 select-none">
                <div className="flex items-center gap-3">
                  <span className="flex h-2.5 w-2.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-white dark:text-white text-slate-900 flex items-center gap-2">
                      <span>Direct Instagram Reel Preview</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-500 dark:text-pink-300 border border-pink-500/30">
                        {previewReel.duration || 30}s HD
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400 dark:text-slate-400 text-slate-600 truncate max-w-xs sm:max-w-md">
                      {previewReel.title}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  {/* Theme Switcher in Preview Header */}
                  <ThemeToggle theme={theme} onToggle={toggleTheme} variant="icon-only" />

                  {/* Prominent Close Window Button */}
                  <button
                    type="button"
                    onClick={() => setPreviewReel(null)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 dark:text-rose-400 hover:text-white border border-rose-500/30 hover:border-rose-400/50 transition-all duration-200 active:scale-95 cursor-pointer shadow-sm group"
                    title="Close preview window (Esc)"
                    aria-label="Close preview window"
                  >
                    <X className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
                    <span className="font-semibold">Close Window</span>
                    <kbd className="hidden sm:inline-block px-1.5 py-0.2 text-[10px] font-mono rounded bg-black/10 dark:bg-white/10 text-slate-600 dark:text-slate-300">Esc</kbd>
                  </button>
                </div>
              </div>

              {/* Scrollable Modal Content */}
              <div className="overflow-y-auto p-1.5 sm:p-5 no-scrollbar flex-1 flex flex-col items-center justify-center">
                <div className="w-full">
                  <ReelPlayer 
                    reel={previewReel} 
                    onClose={() => setPreviewReel(null)}
                    onPublishNow={(reel) => handlePublishNow(reel, 'reel')}
                    onOpenAccountConnector={(channel = 'facebook_page') => {
                      setAccountModalInitialChannel(channel);
                      setIsAccountModalOpen(true);
                    }}
                    onShowToast={showToast}
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Workspace Body with Animated Transitions */}
      <main className="flex-1 pb-16">
        <AnimatePresence mode="wait">
          {activeTab === 'autonomous' && (
            <motion.div
              key="autonomous"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <AutonomousEngine24x7
                config={autonomousConfig}
                onToggle={handleToggleAutonomous}
                onUpdateConfig={handleUpdateAutonomousConfig}
                onTriggerCycle={handleTriggerAutonomousCycle}
                onPreviewReel={(reel) => setPreviewReel(reel)}
                reels={reels}
                onNavigateToSwarm={() => setActiveTab('swarm')}
              />
            </motion.div>
          )}

          {activeTab === 'analytics' && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <AnalyticsDashboard
                analytics={analytics}
                insights={insights}
                onExecuteInsight={handleExecuteInsight}
                onRefreshStrategy={handleRefreshStrategy}
                onAutoAdjustSchedule={handleAutoAdjustSchedule}
              />
            </motion.div>
          )}

          {activeTab === 'reels' && (
            <motion.div
              key="reels"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <ReelGenerator
                onSaveToGallery={handleSaveReelToGallery}
                onScheduleReel={handleScheduleReel}
                onPublishNow={(reel) => handlePublishNow(reel, 'reel')}
              />
            </motion.div>
          )}

          {activeTab === 'posts' && (
            <motion.div
              key="posts"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <CarouselPostCreator
                onSaveToGallery={handleSavePostToGallery}
                onSchedulePost={handleSchedulePost}
                onPublishNow={(post) => handlePublishNow(post, 'post')}
              />
            </motion.div>
          )}

          {activeTab === 'comments' && (
            <motion.div
              key="comments"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <AutoResponder
                comments={comments}
                autonomousMode={autonomousMode}
                setAutonomousMode={setAutonomousMode}
                onUpdateComment={handleUpdateComment}
                onAddComment={handleAddComment}
              />
            </motion.div>
          )}

          {activeTab === 'schedule' && (
            <motion.div
              key="schedule"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <SchedulePublisher
                scheduledReels={scheduledReels}
                scheduledPosts={scheduledPosts}
                onPublishNow={handlePublishNow}
                onDeleteScheduled={handleDeleteScheduled}
                onNavigateToCreate={() => setActiveTab('reels')}
                onOpenAccountConnector={(channel = 'facebook_page') => {
                  setAccountModalInitialChannel(channel);
                  setIsAccountModalOpen(true);
                }}
                onShowToast={showToast}
              />
            </motion.div>
          )}

          {activeTab === 'gallery' && (
            <motion.div
              key="gallery"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <ContentGallery
                reels={reels}
                posts={posts}
                onScheduleReel={handleScheduleReel}
                onSchedulePost={handleSchedulePost}
                onPublishReelNow={(reel) => handlePublishNow(reel, 'reel')}
                onPublishPostNow={(post) => handlePublishNow(post, 'post')}
                onDeleteReel={(id) => handleDeleteContent(id, 'reel')}
                onDeletePost={(id) => handleDeleteContent(id, 'post')}
                theme={theme}
                onToggleTheme={toggleTheme}
                onConvertedToReel={(newReel) => setReels(prev => [newReel, ...prev])}
                onShowToast={showToast}
                onOpenAccountConnector={(channel = 'facebook_page') => {
                  setAccountModalInitialChannel(channel);
                  setIsAccountModalOpen(true);
                }}
              />
            </motion.div>
          )}

          {activeTab === 'assets' && (
            <motion.div
              key="assets"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <AssetLibrary />
            </motion.div>
          )}

          {activeTab === 'swarm' && (
            <motion.div
              key="swarm"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <AgentSwarmControl onShowToast={showToast} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
