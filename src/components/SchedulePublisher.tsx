import React, { useState } from 'react';
import { 
  Calendar, Clock, CheckCircle2, Send, Instagram, Share2, 
  Trash2, AlertCircle, Plus, Sparkles, Zap, Flame, Film, Layers,
  Facebook, Loader2
} from 'lucide-react';
import { ReelItem, PostItem, Platform } from '../types';

interface SchedulePublisherProps {
  scheduledReels: ReelItem[];
  scheduledPosts: PostItem[];
  onPublishNow: (item: ReelItem | PostItem, type: 'reel' | 'post') => Promise<void>;
  onDeleteScheduled: (id: string, type: 'reel' | 'post') => void;
  onNavigateToCreate: () => void;
  onOpenAccountConnector?: (channel?: 'instagram' | 'facebook_page' | 'facebook_account') => void;
  onShowToast?: (msg: string) => void;
}

export const SchedulePublisher: React.FC<SchedulePublisherProps> = ({
  scheduledReels,
  scheduledPosts,
  onPublishNow,
  onDeleteScheduled,
  onNavigateToCreate,
  onOpenAccountConnector,
  onShowToast
}) => {
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishingFbId, setPublishingFbId] = useState<string | null>(null);
  const [publishedSuccessId, setPublishedSuccessId] = useState<string | null>(null);
  const [activePlatformFilter, setActivePlatformFilter] = useState<string>('all');

  const allItems = [
    ...scheduledReels.map(r => ({ ...r, itemType: 'reel' as const })),
    ...scheduledPosts.map(p => ({ ...p, itemType: 'post' as const }))
  ];

  const filteredItems = allItems.filter(item => {
    if (activePlatformFilter === 'all') return true;
    return item.scheduledPlatforms?.includes(activePlatformFilter as Platform);
  });

  const handleInstantPublish = async (item: any) => {
    setPublishingId(item.id);
    try {
      await onPublishNow(item, item.itemType);
      setPublishedSuccessId(item.id);
      setTimeout(() => setPublishedSuccessId(null), 3000);
    } catch (error) {
      console.error('Publish failed:', error);
    } finally {
      setPublishingId(null);
    }
  };

  const handlePublishFacebook = async (item: any) => {
    setPublishingFbId(item.id);
    try {
      const res = await fetch('/api/reels/publish-facebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reelId: item.id })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to publish Reel to Facebook Page.');
      }
      setPublishedSuccessId(item.id);
      setTimeout(() => setPublishedSuccessId(null), 3000);
      onShowToast?.(`Posted Reel "${item.title}" to Facebook Page!`);
    } catch (error: any) {
      const msg = error?.message || 'Publishing to Facebook failed.';
      if (onShowToast) {
        onShowToast(msg);
      }
      if (/configured|credentials|connect/i.test(msg) && onOpenAccountConnector) {
        onOpenAccountConnector('facebook_page');
      } else if (!onShowToast) {
        alert(msg);
      }
    } finally {
      setPublishingFbId(null);
    }
  };

  const getPlatformIcon = (platform: Platform) => {
    switch (platform) {
      case 'instagram':
        return <span key={platform} className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-pink-500/20 text-pink-300 border border-pink-500/30">Instagram</span>;
      case 'threads':
        return <span key={platform} className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-800 text-slate-300 border border-slate-700">Threads</span>;
      case 'facebook':
        return <span key={platform} className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30">Facebook Reels</span>;
      case 'tiktok':
        return <span key={platform} className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-teal-500/20 text-teal-300 border border-teal-500/30">TikTok</span>;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-slate-900 border border-purple-500/20 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 inline-flex items-center gap-1.5 mb-2">
            <Calendar className="w-3.5 h-3.5 text-purple-400" />
            Auto-Publishing & Multi-Platform Scheduler
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Automate Publishing on Peak Engagement Windows
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
            Instagram publishing is connected to the real Meta Graph API. Content is only marked live after Meta confirms publication.
          </p>
        </div>

        <button
          type="button"
          onClick={onNavigateToCreate}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white shadow-lg shadow-pink-500/20 flex items-center gap-2 transition-all self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          Queue New Reel or Post
        </button>
      </div>

      {/* Platform Filter Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: 'All Channels' },
            { id: 'instagram', label: 'Instagram' },
            { id: 'threads', label: 'Threads' },
            { id: 'facebook', label: 'Facebook' },
            { id: 'tiktok', label: 'TikTok' },
          ].map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActivePlatformFilter(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activePlatformFilter === p.id
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-slate-400 font-mono">
          {filteredItems.length} queued drops
        </span>
      </div>

      {/* Queue List */}
      {filteredItems.length === 0 ? (
        <div className="h-64 bg-slate-900/60 border border-slate-800 rounded-2xl flex flex-col items-center justify-center p-6 text-center">
          <Calendar className="w-10 h-10 text-slate-600 mb-3" />
          <h3 className="text-sm font-bold text-white mb-1">Queue is Clear</h3>
          <p className="text-xs text-slate-400 max-w-sm mb-4">
            Generate a new viral reel or carousel, and click <strong>"Schedule"</strong> to load it into the publishing pipeline.
          </p>
          <button
            type="button"
            onClick={onNavigateToCreate}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-500/30 flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Reel to Schedule
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((item) => {
            const isPublishing = publishingId === item.id;
            const isSuccess = publishedSuccessId === item.id;
            const isReel = item.itemType === 'reel';

            return (
              <div
                key={item.id}
                className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-5 transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                    isReel ? 'bg-pink-500/20 text-pink-400' : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {isReel ? <Film className="w-6 h-6" /> : <Layers className="w-6 h-6" />}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                        {isReel ? '9:16 Viral Reel' : 'Carousel Post'}
                      </span>
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {item.scheduledTime || 'Today at 19:00 (Peak Slot)'}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-white leading-snug">
                      {item.title}
                    </h4>

                    <p className="text-xs text-slate-400 line-clamp-1 max-w-xl">
                      {item.caption}
                    </p>

                    {/* Target Platforms */}
                    <div className="flex items-center gap-1.5 pt-1.5">
                      <span className="text-[10px] text-slate-500 mr-1">Broadcasting to:</span>
                      {(item.scheduledPlatforms || ['instagram']).map(p => getPlatformIcon(p))}
                    </div>
                  </div>
                </div>

                {/* Action Controls */}
                <div className="flex items-center gap-2 self-end md:self-auto shrink-0 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleInstantPublish(item)}
                    disabled={isPublishing || isSuccess || publishingFbId === item.id}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition-all ${
                      isSuccess
                        ? 'bg-emerald-500 text-slate-950 font-black'
                        : isPublishing
                        ? 'bg-slate-800 text-purple-300 cursor-wait'
                        : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/25'
                    }`}
                    title="Publish immediately across connected channels (Instagram + Facebook Page)"
                  >
                    {isSuccess ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-slate-950" />
                        Published Live!
                      </>
                    ) : isPublishing ? (
                      <>
                        <Clock className="w-4 h-4 animate-spin" />
                        Broadcasting...
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        Publish Now
                      </>
                    )}
                  </button>

                  {item.itemType === 'reel' && !item.fb_permalink && (
                    <button
                      type="button"
                      onClick={() => handlePublishFacebook(item)}
                      disabled={isPublishing || isSuccess || publishingFbId === item.id}
                      className="px-3 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/40 shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                      title="Post this scheduled reel directly to Facebook Page"
                    >
                      {publishingFbId === item.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                      ) : (
                        <Facebook className="w-3.5 h-3.5 text-white fill-white" />
                      )}
                      Post FB
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onDeleteScheduled(item.id, item.itemType)}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
