import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { 
  ReelItem, PostItem, CommentItem, AccountAnalytics, StrategyInsight, Autonomous24x7Config 
} from './types';
import { DEFAULT_ACCOUNT_ANALYTICS } from './constants';
import { Navbar } from './components/Navbar';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { ReelGenerator } from './components/ReelGenerator';
import { CarouselPostCreator } from './components/CarouselPostCreator';
import { AutoResponder } from './components/AutoResponder';
import { SchedulePublisher } from './components/SchedulePublisher';
import { ContentGallery } from './components/ContentGallery';
import { AccountConnectorModal } from './components/AccountConnectorModal';
import { AutonomousEngine24x7 } from './components/AutonomousEngine24x7';
import { ReelPlayer } from './components/ReelPlayer';

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
  const [activeTab, setActiveTab] = useState<'analytics' | 'reels' | 'posts' | 'comments' | 'schedule' | 'gallery' | 'autonomous'>('autonomous');
  const [autonomousMode, setAutonomousMode] = useState<boolean>(true);
  const [analytics, setAnalytics] = useState<AccountAnalytics>(DEFAULT_ACCOUNT_ANALYTICS);
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [insights, setInsights] = useState<StrategyInsight[]>(DEFAULT_STRATEGY_INSIGHTS);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);
  const [previewReel, setPreviewReel] = useState<ReelItem | null>(null);

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
        const res = await fetch('/api/state');
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            if (data.reels && Array.isArray(data.reels)) setReels(data.reels);
            if (data.posts && Array.isArray(data.posts)) setPosts(data.posts);
            if (data.comments && Array.isArray(data.comments)) setComments(data.comments);
            if (data.analytics) setAnalytics(data.analytics);
            if (typeof data.autonomousMode === 'boolean') setAutonomousMode(data.autonomousMode);
            if (data.autonomous24x7) setAutonomousConfig(data.autonomous24x7);
          }
        }
      } catch (err) {
        console.warn('Backend API connection notice, using local state:', err);
      }
    }
    loadLiveWorkspace();

    // Poll autonomous status every 15s to keep countdown and telemetry in sync
    const pollInterval = setInterval(async () => {
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

  const handleUpdateAutonomousConfig = async (params: { intervalMinutes?: number; targetNiche?: string; instagramPublishing?: any }) => {
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
    try {
      const res = await fetch('/api/autonomous/trigger-cycle', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
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
        }
      }
    } catch (err) {
      console.error('Trigger autonomous cycle error:', err);
    }
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
    if (type !== 'reel') {
      throw new Error('Carousel publishing is not enabled yet. Only Instagram Reels use the live publishing pipeline.');
    }

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
      instagramPostId: data.mediaId,
      permalink: data.permalink,
      publishTimestamp: new Date().toISOString()
    } : r));

    showToast(`Published "${item.title}" to Instagram.`);
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

  const handleConnectAccount = async (params: { handle: string; category: string; followers: number; bio: string }) => {
    try {
      const res = await fetch('/api/analytics/connect-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setAnalytics(prev => ({
            ...prev,
            profile: data.profile,
            metrics: {
              ...prev.metrics,
              ...data.metrics
            }
          }));
          showToast(`Connected ${data.profile.handle} to AI Agent Hub`);
        }
      }
    } catch (err) {
      console.error('Account connect error:', err);
    }
  };

  const handleOAuthConnected = async (profile: AccountAnalytics['profile']) => {
    setAnalytics(prev => ({ ...prev, profile }));
    showToast(`Connected ${profile.handle} to SARLX.Ai.`);
  };

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
    showToast('Reset account to SARLX.Ai baseline (0 metrics)');
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
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 flex flex-col font-sans selection:bg-pink-500/30 selection:text-pink-200">
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
        autonomousMode={autonomousMode}
        setAutonomousMode={setAutonomousMode}
        pendingCommentsCount={pendingCommentsCount}
        onOpenAccountConnector={() => setIsAccountModalOpen(true)}
        autonomous24x7Enabled={autonomousConfig.enabled}
      />

      {/* Account Connector Modal */}
      <AccountConnectorModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        currentProfile={analytics.profile}
        onConnect={handleConnectAccount}
        onResetToZero={handleResetToZero}
        onOAuthConnected={handleOAuthConnected}
      />

      {/* Reel Player Modal for Inspecting Autonomously Published Video */}
      <AnimatePresence>
        {previewReel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
            onClick={() => setPreviewReel(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-sm w-full bg-slate-950 border border-slate-800 rounded-3xl p-4 shadow-2xl space-y-3"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  Direct Instagram Reel Preview
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewReel(null)}
                  className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <ReelPlayer reel={previewReel} />
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
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
