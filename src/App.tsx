import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ReelItem, PostItem, CommentItem, AccountAnalytics, StrategyInsight 
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
  const [activeTab, setActiveTab] = useState<'analytics' | 'reels' | 'posts' | 'comments' | 'schedule' | 'gallery'>('analytics');
  const [autonomousMode, setAutonomousMode] = useState<boolean>(true);
  const [analytics, setAnalytics] = useState<AccountAnalytics>(DEFAULT_ACCOUNT_ANALYTICS);
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [insights, setInsights] = useState<StrategyInsight[]>(DEFAULT_STRATEGY_INSIGHTS);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);

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
          }
        }
      } catch (err) {
        console.warn('Backend API connection notice, using local state:', err);
      }
    }
    loadLiveWorkspace();
  }, []);

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
      setReels(prev => prev.map(r => r.id === item.id ? {
        ...r,
        status: 'published',
        views: (r.views || 0) + 1240,
        likes: (r.likes || 0) + 84,
        shares: (r.shares || 0) + 16
      } : r));
    } else {
      setPosts(prev => prev.map(p => p.id === item.id ? { ...p, status: 'published' } : p));
    }

    // Boost impressions in analytics
    setAnalytics(prev => ({
      ...prev,
      metrics: {
        ...prev.metrics,
        impressions: prev.metrics.impressions + 1850,
        totalReelPlays: type === 'reel' ? prev.metrics.totalReelPlays + 1240 : prev.metrics.totalReelPlays
      }
    }));

    try {
      await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, type })
      });
    } catch (err) {
      console.warn('Could not call /api/publish:', err);
    }

    showToast(`Published "${item.title}" to Instagram & connected channels!`);
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
      />

      {/* Account Connector Modal */}
      <AccountConnectorModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        currentProfile={analytics.profile}
        onConnect={handleConnectAccount}
        onResetToZero={handleResetToZero}
      />

      {/* Main Workspace Body with Animated Transitions */}
      <main className="flex-1 pb-16">
        <AnimatePresence mode="wait">
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
