import React, { useState } from 'react';
import { 
  Film, Layers, Play, Calendar, Eye, Heart, MessageCircle, 
  Share2, Bookmark, Download, Check, Sparkles, Filter, ExternalLink 
} from 'lucide-react';
import { ReelItem, PostItem } from '../types';
import { ReelPlayer } from './ReelPlayer';

interface ContentGalleryProps {
  reels: ReelItem[];
  posts: PostItem[];
  onScheduleReel: (reel: ReelItem) => void;
  onSchedulePost: (post: PostItem) => void;
}

export const ContentGallery: React.FC<ContentGalleryProps> = ({
  reels,
  posts,
  onScheduleReel,
  onSchedulePost
}) => {
  const [filterType, setFilterType] = useState<'all' | 'reels' | 'posts'>('all');
  const [activeModalReel, setActiveModalReel] = useState<ReelItem | null>(null);
  const [downloadSuccessId, setDownloadSuccessId] = useState<string | null>(null);

  const handleDownload = (id: string) => {
    setDownloadSuccessId(id);
    setTimeout(() => setDownloadSuccessId(null), 2000);
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
            Access all saved 9:16 video clips, viral carousels, and historical performance metrics in one centralized studio library.
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

            return (
              <div
                key={reel.id}
                className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden shadow-lg flex flex-col justify-between transition-all group"
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
                      {reel.status === 'published' ? (
                        <strong className="text-emerald-400 font-semibold flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" />
                          {(reel.views || 184500).toLocaleString()} Views
                        </strong>
                      ) : (
                        <span className="text-purple-400 font-semibold">Ready to Publish</span>
                      )}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(reel.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setActiveModalReel(reel)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Preview
                    </button>

                    <button
                      type="button"
                      onClick={() => onScheduleReel(reel)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      Schedule
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownload(reel.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      title="Download 9:16 Video"
                    >
                      {isDownloaded ? <Check className="w-4 h-4 text-emerald-400" /> : <Download className="w-4 h-4" />}
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

            return (
              <div
                key={post.id}
                className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden shadow-lg flex flex-col justify-between transition-all"
              >
                {/* 1:1 Aspect Preview */}
                <div className="aspect-[9/12] w-full bg-gradient-to-br from-slate-950 via-[#131b2e] to-[#0f172a] p-4 flex flex-col justify-between border-b border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {post.slides?.length || 4} Slides Carousel
                    </span>
                    <span className="text-[10px] font-bold text-amber-400 bg-slate-950/80 px-2 py-0.5 rounded">
                      {post.engagementScore}/100 Save Index
                    </span>
                  </div>

                  <div className="my-auto text-left">
                    <h3 className="text-base font-black text-white leading-tight">
                      {post.slides?.[0]?.headline || post.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-2 line-clamp-3">
                      {post.slides?.[0]?.bodyText || post.caption}
                    </p>
                  </div>

                  <div className="text-[10px] text-amber-400 font-semibold">
                    🔖 High-Saving Micro Framework
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="text-amber-400 font-semibold">Bookmark Optimized</span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(post.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => onSchedulePost(post)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      Schedule
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownload(post.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      title="Download Assets"
                    >
                      {isDownloaded ? <Check className="w-4 h-4 text-emerald-400" /> : <Download className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* Modal Preview for Reel Player */}
      {activeModalReel && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-4xl bg-slate-950 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Film className="w-4 h-4 text-pink-400" />
                {activeModalReel.title}
              </h3>
              <button
                type="button"
                onClick={() => setActiveModalReel(null)}
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Close Preview
              </button>
            </div>

            <ReelPlayer reel={activeModalReel} onSchedule={onScheduleReel} />
          </div>
        </div>
      )}
    </div>
  );
};
