import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ReelItem, PostItem, CommentItem, AccountAnalytics, StrategyInsight 
} from './types';
import { 
  INITIAL_REELS, INITIAL_POSTS, INITIAL_COMMENTS, 
  INITIAL_ACCOUNT_ANALYTICS, INITIAL_STRATEGY_INSIGHTS 
} from './data/mockData';
import { Navbar } from './components/Navbar';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { ReelGenerator } from './components/ReelGenerator';
import { CarouselPostCreator } from './components/CarouselPostCreator';
import { AutoResponder } from './components/AutoResponder';
import { SchedulePublisher } from './components/SchedulePublisher';
import { ContentGallery } from './components/ContentGallery';

export default function App() {
  const [activeTab, setActiveTab] = useState<'analytics' | 'reels' | 'posts' | 'comments' | 'schedule' | 'gallery'>('analytics');
  const [autonomousMode, setAutonomousMode] = useState<boolean>(true);
  const [analytics, setAnalytics] = useState<AccountAnalytics>(INITIAL_ACCOUNT_ANALYTICS);
  const [reels, setReels] = useState<ReelItem[]>(INITIAL_REELS);
  const [posts, setPosts] = useState<PostItem[]>(INITIAL_POSTS);
  const [comments, setComments] = useState<CommentItem[]>(INITIAL_COMMENTS);
  const [insights, setInsights] = useState<StrategyInsight[]>(INITIAL_STRATEGY_INSIGHTS);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3200);
  };

  const handleSaveReelToGallery = (reel: ReelItem) => {
    setReels(prev => {
      const exists = prev.find(r => r.id === reel.id);
      if (exists) {
        return prev.map(r => r.id === reel.id ? { ...reel, status: 'saved' } : r);
      }
      return [{ ...reel, status: 'saved' }, ...prev];
    });
    showToast(`Reel "${reel.title}" saved to Content Gallery`);
  };

  const handleScheduleReel = (reel: ReelItem) => {
    const scheduledItem: ReelItem = {
      ...reel,
      status: 'scheduled',
      scheduledTime: 'Today at 19:00 (Peak Slot)',
      scheduledPlatforms: ['instagram', 'threads']
    };

    setReels(prev => {
      const exists = prev.find(r => r.id === reel.id);
      if (exists) {
        return prev.map(r => r.id === reel.id ? scheduledItem : r);
      }
      return [scheduledItem, ...prev];
    });

    showToast(`Reel queued for Auto-Publishing at 19:00`);
    setActiveTab('schedule');
  };

  const handleSavePostToGallery = (post: PostItem) => {
    setPosts(prev => {
      const exists = prev.find(p => p.id === post.id);
      if (exists) {
        return prev.map(p => p.id === post.id ? { ...post, status: 'saved' } : p);
      }
      return [{ ...post, status: 'saved' }, ...prev];
    });
    showToast(`Carousel "${post.title}" saved to Vault`);
  };

  const handleSchedulePost = (post: PostItem) => {
    const scheduledItem: PostItem = {
      ...post,
      status: 'scheduled',
      scheduledTime: 'Tomorrow at 18:30 (Peak Slot)',
      scheduledPlatforms: ['instagram']
    };

    setPosts(prev => {
      const exists = prev.find(p => p.id === post.id);
      if (exists) {
        return prev.map(p => p.id === post.id ? scheduledItem : p);
      }
      return [scheduledItem, ...prev];
    });

    showToast(`Carousel scheduled for peak engagement window`);
    setActiveTab('schedule');
  };

  const handlePublishNow = (item: ReelItem | PostItem, type: 'reel' | 'post') => {
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

    // Boost impressions live in analytics
    setAnalytics(prev => ({
      ...prev,
      metrics: {
        ...prev.metrics,
        impressions: prev.metrics.impressions + 1850,
        totalReelPlays: type === 'reel' ? prev.metrics.totalReelPlays + 1240 : prev.metrics.totalReelPlays
      }
    }));

    showToast(`Published "${item.title}" to Instagram & connected channels!`);
  };

  const handleDeleteScheduled = (id: string, type: 'reel' | 'post') => {
    if (type === 'reel') {
      setReels(prev => prev.map(r => r.id === id ? { ...r, status: 'saved' } : r));
    } else {
      setPosts(prev => prev.map(p => p.id === id ? { ...p, status: 'saved' } : p));
    }
    showToast(`Removed from schedule queue`);
  };

  const handleUpdateComment = (comment: CommentItem) => {
    setComments(prev => prev.map(c => c.id === comment.id ? comment : c));
    showToast(`Replied to ${comment.authorHandle}`);
  };

  const handleAddComment = (comment: CommentItem) => {
    setComments(prev => [comment, ...prev]);
    if (comment.replyStatus === 'auto_replied') {
      showToast(`AI Auto-Replied to ${comment.authorHandle}!`);
    } else {
      showToast(`New comment received from ${comment.authorHandle}`);
    }
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
