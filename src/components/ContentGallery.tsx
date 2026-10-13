import React, { useState } from 'react';
import { 
  Film, Layers, Play, Calendar, Eye, 
  Bookmark, Download, Check, Trash2, Send, 
  Loader2, CheckCircle, ExternalLink, ChevronLeft, ChevronRight, X,
  Zap
} from 'lucide-react';
import { ReelItem, PostItem } from '../types';
import { ReelPlayer } from './ReelPlayer';
import { ThemeToggle } from './ThemeToggle';

interface ContentGalleryProps {
  reels: ReelItem[];
  posts: PostItem[];
  onScheduleReel: (reel: ReelItem) => void;
  onSchedulePost: (post: PostItem) => void;
  onPublishReelNow?: (reel: ReelItem) => Promise<void> | void;
  onPublishPostNow?: (post: PostItem) => Promise<void> | void;
  onDeleteReel?: (id: string) => Promise<void> | void;
  onDeletePost?: (id: string) => Promise<void> | void;
  onConvertedToReel?: (reel: ReelItem) => void;
  onShowToast?: (msg: string) => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const ContentGallery: React.FC<ContentGalleryProps> = ({
  reels,
  posts,
  onScheduleReel,
  onSchedulePost,
  onPublishReelNow,
  onPublishPostNow,
  onDeleteReel,
  onDeletePost,
  onConvertedToReel,
  onShowToast,
  theme,
  onToggleTheme
}) => {
  const [filterType, setFilterType] = useState<'all' | 'reels' | 'posts'>('all');
  const [activeModalReel, setActiveModalReel] = useState<ReelItem | null>(null);
  const [activeModalPost, setActiveModalPost] = useState<PostItem | null>(null);
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);
  const [downloadSuccessId, setDownloadSuccessId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [convertingPostId, setConvertingPostId] = useState<string | null>(null);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<{ id: string; title: string; type: 'reel' | 'post' } | null>(null);

  const handleConvertToReel = async (post: PostItem) => {
    setConvertingPostId(post.id);
    try {
      const res = await fetch('/api/carousel/convert-to-reel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id })
      });
      const data = await res.json();
      if (data.success && data.reel) {
        if (onConvertedToReel) {
          onConvertedToReel(data.reel);
        }
        if (onShowToast) {
          onShowToast(`⚡ Converted Carousel into Reel "${data.reel.title}"!`);
        }
        setFilterType('reels');
        setActiveModalPost(null);
      } else {
        if (onShowToast) onShowToast(data.error || 'Failed to convert carousel');
      }
    } catch {
      if (onShowToast) onShowToast('Error converting carousel to reel');
    } finally {
      setConvertingPostId(null);
    }
  };

  const handleDownload = (id: string) => {
    setDownloadSuccessId(id);
    setTimeout(() => setDownloadSuccessId(null), 2000);
  };

  const handleDeleteReelClick = (reel: ReelItem) => {
    setConfirmDeleteTarget({ id: reel.id, title: reel.title, type: 'reel' });
  };

  const handleDeletePostClick = (post: PostItem) => {
    setConfirmDeleteTarget({ id: post.id, title: post.title, type: 'post' });
  };

  const handleExecuteDelete = async () => {
    if (!confirmDeleteTarget) return;
    const { id, type } = confirmDeleteTarget;
    setDeletingId(id);
    try {
      if (type === 'reel' && onDeleteReel) {
        await onDeleteReel(id);
      } else if (type === 'post' && onDeletePost) {
        await onDeletePost(id);
      }
    } finally {
      setDeletingId(null);
      setConfirmDeleteTarget(null);
    }
  };

  const handlePublishReelClick = async (reel: ReelItem) => {
    if (!onPublishReelNow) return;
    setPublishingId(reel.id);
    try {
      await onPublishReelNow(reel);
    } catch (err: any) {
      console.error("Failed to publish reel:", err);
      if (onShowToast) {
        onShowToast(err?.message || "Failed to publish reel to Instagram");
      }
    } finally {
      setPublishingId(null);
    }
  };

  const handlePublishPostClick = async (post: PostItem) => {
    if (!onPublishPostNow) return;
    setPublishingId(post.id);
    try {
      await onPublishPostNow(post);
    } catch (err: any) {
      console.error("Failed to publish post:", err);
      if (onShowToast) {
        onShowToast(err?.message || "Failed to publish post to Instagram");
      }
    } finally {
      setPublishingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-8">
      {/* Gallery Header */}
      <div className="bg-gradient-to-r from-rose-500/10 via-pink-500/10 to-slate-900 border border-rose-500/20 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 inline-flex items-center gap-1.5 mb-2">
            <Bookmark className="w-3.5 h-3.5 text-rose-400" />
            Saved Content & Asset Vault
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Generated Reel & Post Gallery
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
            Access, publish live, schedule, or delete saved 9:16 video reels and viral carousels from your autonomous content vault.
          </p>
        </div>

        {/* Filter Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-900 p-1.5 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === 'all' ? 'bg-rose-500 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            All Content ({reels.length + posts.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('reels')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
              filterType === 'reels' ? 'bg-pink-500 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Film className="w-3 h-3" />
            Reels ({reels.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('posts')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
              filterType === 'posts' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3 h-3" />
            Carousels ({posts.length})
          </button>
        </div>
      </div>

      {/* Grid of Reels & Posts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* REELS */}
        {(filterType === 'all' || filterType === 'reels') &&
          reels.map((reel) => {
            const isDownloaded = downloadSuccessId === reel.id;
            const isPublishing = publishingId === reel.id;
            const isDeleting = deletingId === reel.id;
            const isPublished = reel.status === 'published';

            return (
              <div
                key={reel.id}
                className={`bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden shadow-lg flex flex-col justify-between transition-all group ${
                  isDeleting ? 'opacity-40 pointer-events-none' : ''
                }`}
              >
                {/* 9:16 Miniature Aspect Preview Card */}
                <div 
                  onClick={() => setActiveModalReel(reel)}
                  className="relative aspect-[9/12] w-full bg-gradient-to-br from-slate-950 via-[#1f112e] to-[#0f172a] p-4 flex flex-col justify-between cursor-pointer overflow-hidden border-b border-slate-800"
                >
                  <div className="flex items-center justify-between z-10">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-500/20 text-pink-300 border border-pink-500/30">
                      {reel.duration}s Reel
                    </span>
                    <span className="text-[10px] font-bold text-emerald-400 bg-slate-950/80 px-2 py-0.5 rounded">
                      {reel.hookScore}/100 Hook
                    </span>
                  </div>

                  {/* Play icon overlay on hover */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10 transition-colors">
                    <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                    </div>
                  </div>

                  <div className="z-10 text-left">
                    <h3 className="text-base font-extrabold text-white leading-tight drop-shadow-md">
                      {reel.title}
                    </h3>
                    <p className="text-[11px] text-pink-300 font-semibold mt-1">
                      🎵 {reel.audio?.title || 'Trending Audio'}
                    </p>
                  </div>
                </div>

                {/* Details & Actions Footer */}
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>
                      {isPublished ? (
                        <strong className="text-emerald-400 font-semibold flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" />
                          {(reel.views || 0).toLocaleString()} Views
                        </strong>
                      ) : (
                        <span className="text-purple-400 font-semibold">Ready to Publish</span>
                      )}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(reel.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Action Buttons Row */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
                    {/* Preview Button */}
                    <button
                      type="button"
                      onClick={() => setActiveModalReel(reel)}
                      className="py-1.5 px-2.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center gap-1 transition-all"
                      title="Preview Reel"
                    >
                      <Play className="w-3 h-3" />
                      Preview
                    </button>

                    {/* Publish Now Button (or Published badge) */}
                    {isPublished ? (
                      <span className="flex-1 py-1.5 px-2 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                        Published
                        {reel.permalink && (
                          <a
                            href={reel.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1 text-emerald-300 hover:text-white inline-flex items-center"
                            title="View live on Instagram"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={isPublishing}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePublishReelClick(reel);
                        }}
                        className="flex-1 py-1.5 px-2 rounded-lg text-xs font-bold bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-md shadow-pink-600/30 flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                        title="Publish immediately to Instagram"
                      >
                        {isPublishing ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Publishing...
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            Publish Now
                          </>
                        )}
                      </button>
                    )}

                    {/* Schedule Button */}
                    <button
                      type="button"
                      onClick={() => onScheduleReel(reel)}
                      className="py-1.5 px-2.5 rounded-lg text-xs font-bold bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 flex items-center justify-center gap-1 transition-all"
                      title="Schedule Reel"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      Schedule
                    </button>

                    {/* Download Button */}
                    <button
                      type="button"
                      onClick={() => handleDownload(reel.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      title="Download 9:16 Video"
                    >
                      {isDownloaded ? <Check className="w-4 h-4 text-emerald-400" /> : <Download className="w-4 h-4" />}
                    </button>

                    {/* Delete Button */}
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => handleDeleteReelClick(reel)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Delete Reel from Gallery"
                    >
                      {isDeleting ? <Loader2 className="w-4 h-4 animate-spin text-rose-400" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

        {/* CAROUSEL POSTS */}
        {(filterType === 'all' || filterType === 'posts') &&
          posts.map((post) => {
            const isDownloaded = downloadSuccessId === post.id;
            const isPublishing = publishingId === post.id;
            const isDeleting = deletingId === post.id;
            const isPublished = post.status === 'published';

            return (
              <div
                key={post.id}
                className={`bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden shadow-lg flex flex-col justify-between transition-all ${
                  isDeleting ? 'opacity-40 pointer-events-none' : ''
                }`}
              >
                {/* 1:1 Aspect Preview */}
                <div 
                  onClick={() => {
                    setActiveModalPost(post);
                    setActiveSlideIndex(0);
                  }}
                  className="aspect-[9/12] w-full bg-gradient-to-br from-slate-950 via-[#131b2e] to-[#0f172a] p-4 flex flex-col justify-between border-b border-slate-800 cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {post.slides?.length || 4} Slides Carousel
                    </span>
                    <span className="text-[10px] font-bold text-amber-400 bg-slate-950/80 px-2 py-0.5 rounded">
                      {post.engagementScore}/100 Save Index
                    </span>
                  </div>

                  <div className="my-auto text-left">
                    <h3 className="text-base font-black text-white leading-tight group-hover:text-amber-300 transition-colors">
                      {post.slides?.[0]?.headline || post.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-2 line-clamp-3">
                      {post.slides?.[0]?.bodyText || post.caption}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-amber-400 font-semibold">
                    <span>🔖 High-Saving Micro Framework</span>
                    <span className="text-slate-400 text-[11px] group-hover:text-white transition-colors">
                      Tap to Preview Slides →
                    </span>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="text-amber-400 font-semibold">
                      {isPublished ? 'Live on Instagram' : 'Bookmark Optimized'}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(post.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
                    {/* Publish Now Button (or Published badge) */}
                    {isPublished ? (
                      <span className="flex-1 py-1.5 px-2 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                        Published
                        {post.permalink && (
                          <a
                            href={post.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1 text-emerald-300 hover:text-white inline-flex items-center"
                            title="View live on Instagram"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={isPublishing}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePublishPostClick(post);
                        }}
                        className="flex-1 py-1.5 px-2 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black shadow-md shadow-amber-500/20 flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                        title="Publish Carousel immediately to Instagram"
                      >
                        {isPublishing ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Publishing...
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            Publish Now
                          </>
                        )}
                      </button>
                    )}

                    {/* Convert to Reel Button */}
                    <button
                      type="button"
                      disabled={convertingPostId === post.id}
                      onClick={() => handleConvertToReel(post)}
                      className="py-1.5 px-2.5 rounded-lg text-xs font-bold bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 flex items-center justify-center gap-1 transition-all disabled:opacity-50"
                      title="1-Click Convert this Carousel into a Kinetic 9:16 Video Reel"
                    >
                      {convertingPostId === post.id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                          <span>Converting...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5 text-cyan-400" />
                          <span>To Reel</span>
                        </>
                      )}
                    </button>

                    {/* Schedule Button */}
                    <button
                      type="button"
                      onClick={() => onSchedulePost(post)}
                      className="py-1.5 px-2.5 rounded-lg text-xs font-bold bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 flex items-center justify-center gap-1 transition-all"
                      title="Schedule Carousel"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      Schedule
                    </button>

                    {/* Download Button */}
                    <button
                      type="button"
                      onClick={() => handleDownload(post.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      title="Download Assets"
                    >
                      {isDownloaded ? <Check className="w-4 h-4 text-emerald-400" /> : <Download className="w-4 h-4" />}
                    </button>

                    {/* Delete Button */}
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => handleDeletePostClick(post)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Delete Carousel from Gallery"
                    >
                      {isDeleting ? <Loader2 className="w-4 h-4 animate-spin text-rose-400" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* Modal Preview for Reel Player */}
      {activeModalReel && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-start sm:items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto"
          onClick={() => setActiveModalReel(null)}
        >
          <div 
            className="relative w-full max-w-5xl my-auto max-h-[95vh] flex flex-col bg-slate-950/95 dark:bg-slate-950/95 bg-white border border-white/15 dark:border-white/15 border-slate-200 rounded-3xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sticky Top Header - ALWAYS visible, never scrolled away */}
            <div className="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-6 py-3 bg-slate-900/95 dark:bg-slate-900/95 bg-slate-50/95 backdrop-blur-xl border-b border-white/10 dark:border-white/10 border-slate-200 select-none">
              <h3 className="text-sm sm:text-base font-bold text-white dark:text-white text-slate-900 flex items-center gap-2">
                <Film className="w-4 h-4 text-pink-500" />
                <span className="truncate max-w-[200px] sm:max-w-md">{activeModalReel.title}</span>
              </h3>
              <div className="flex items-center gap-2 sm:gap-3">
                {onToggleTheme && theme && (
                  <ThemeToggle theme={theme} onToggle={onToggleTheme} variant="icon-only" />
                )}
                <button
                  type="button"
                  onClick={() => setActiveModalReel(null)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 dark:text-rose-400 hover:text-white border border-rose-500/30 transition-all cursor-pointer shadow-sm active:scale-95 group"
                  title="Close preview window (Esc)"
                >
                  <X className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-300" />
                  <span>Close Window</span>
                  <kbd className="hidden sm:inline-block px-1 py-0.2 text-[10px] font-mono rounded bg-black/10 dark:bg-white/10 text-slate-600 dark:text-slate-300">Esc</kbd>
                </button>
              </div>
            </div>

            {/* Scrollable Preview Body with Zoom-out Proportions */}
            <div className="overflow-y-auto p-3 sm:p-5 no-scrollbar flex-1 flex flex-col items-center justify-center">
              <div className="w-full">
                <ReelPlayer
                  reel={activeModalReel}
                  onSchedule={onScheduleReel}
                  onPublishNow={handlePublishReelClick}
                  onDelete={(r) => {
                    handleDeleteReelClick(r);
                    setActiveModalReel(null);
                  }}
                  onClose={() => setActiveModalReel(null)}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Preview for Carousel Slides */}
      {activeModalPost && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <h3 className="text-base font-bold text-white line-clamp-1">
                  {activeModalPost.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModalPost(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Slide Card Viewer */}
            {activeModalPost.slides && activeModalPost.slides.length > 0 && (
              <div className="space-y-4">
                <div className="relative aspect-square max-w-md mx-auto w-full bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between shadow-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold text-amber-400">
                      SLIDE {activeSlideIndex + 1} OF {activeModalPost.slides.length}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-950/80 px-2 py-0.5 rounded">
                      {activeModalPost.slides[activeSlideIndex]?.theme || 'Dark Aesthetic'}
                    </span>
                  </div>

                  <div className="my-auto space-y-3 text-left">
                    <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">
                      {activeModalPost.slides[activeSlideIndex]?.headline}
                    </h2>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {activeModalPost.slides[activeSlideIndex]?.bodyText}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 text-xs font-bold text-amber-400">
                    💡 {activeModalPost.slides[activeSlideIndex]?.takeaway}
                  </div>
                </div>

                {/* Navigation controls */}
                <div className="flex items-center justify-between max-w-md mx-auto">
                  <button
                    type="button"
                    disabled={activeSlideIndex === 0}
                    onClick={() => setActiveSlideIndex(prev => Math.max(0, prev - 1))}
                    className="py-1.5 px-3 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white border border-slate-800 flex items-center gap-1 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" /> Previous
                  </button>

                  <div className="flex items-center gap-1.5">
                    {activeModalPost.slides.map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveSlideIndex(idx)}
                        className={`w-2.5 h-2.5 rounded-full transition-all ${
                          idx === activeSlideIndex ? 'bg-amber-400 scale-125' : 'bg-slate-700'
                        }`}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={activeSlideIndex === activeModalPost.slides.length - 1}
                    onClick={() => setActiveSlideIndex(prev => Math.min(activeModalPost.slides!.length - 1, prev + 1))}
                    className="py-1.5 px-3 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white border border-slate-800 flex items-center gap-1 disabled:opacity-40"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Carousel Modal Actions: Publish Now, Schedule, Delete */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800 max-w-md mx-auto">
                  <div className="flex items-center gap-2 flex-1">
                    {activeModalPost.status === 'published' ? (
                      <span className="py-2 px-3 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        Published
                        {activeModalPost.permalink && (
                          <a
                            href={activeModalPost.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1 text-emerald-200 hover:text-white underline inline-flex items-center gap-1"
                          >
                            View on IG <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </span>
                    ) : (
                      onPublishPostNow && (
                        <button
                          type="button"
                          disabled={publishingId === activeModalPost.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePublishPostClick(activeModalPost);
                          }}
                          className="py-2 px-4 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-md shadow-amber-500/20 flex items-center gap-2 transition-all disabled:opacity-50"
                        >
                          {publishingId === activeModalPost.id ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Publishing...
                            </>
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" />
                              Publish Now
                            </>
                          )}
                        </button>
                      )
                    )}

                    {onSchedulePost && (
                      <button
                        type="button"
                        onClick={() => {
                          onSchedulePost(activeModalPost);
                          setActiveModalPost(null);
                        }}
                        className="py-2 px-3.5 rounded-xl text-xs font-bold bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 flex items-center gap-1.5 transition-all"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        Schedule
                      </button>
                    )}

                    {/* Convert to Reel Modal Action */}
                    <button
                      type="button"
                      disabled={convertingPostId === activeModalPost.id}
                      onClick={() => handleConvertToReel(activeModalPost)}
                      className="py-2 px-3.5 rounded-xl text-xs font-bold bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5 transition-all disabled:opacity-50"
                      title="Convert this Carousel into a Kinetic 9:16 Video Reel"
                    >
                      {convertingPostId === activeModalPost.id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                          <span>Synthesizing Reel...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Convert to Reel</span>
                        </>
                      )}
                    </button>
                  </div>

                  {onDeletePost && (
                    <button
                      type="button"
                      disabled={deletingId === activeModalPost.id}
                      onClick={() => {
                        handleDeletePostClick(activeModalPost);
                        setActiveModalPost(null);
                      }}
                      className="py-2 px-3.5 rounded-xl text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      {deletingId === activeModalPost.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      Delete Carousel
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Delete {confirmDeleteTarget.type === 'reel' ? 'Reel' : 'Carousel'}?
                </h3>
                <p className="text-xs text-slate-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              Are you sure you want to permanently remove <strong className="text-white">"{confirmDeleteTarget.title}"</strong> from your content vault?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={() => setConfirmDeleteTarget(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={handleExecuteDelete}
                className="px-4 py-2 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50"
              >
                {deletingId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
