import React from 'react';
import { Sparkles, Instagram, Flame, MessageSquare, Calendar, Film, BarChart3, Bot, CheckCircle2 } from 'lucide-react';
import { AccountAnalytics } from '../types';

interface NavbarProps {
  activeTab: 'analytics' | 'reels' | 'posts' | 'comments' | 'schedule' | 'gallery';
  setActiveTab: (tab: 'analytics' | 'reels' | 'posts' | 'comments' | 'schedule' | 'gallery') => void;
  analytics: AccountAnalytics;
  autonomousMode: boolean;
  setAutonomousMode: (val: boolean | ((prev: boolean) => boolean)) => void;
  pendingCommentsCount: number;
  onOpenAccountConnector?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  analytics,
  autonomousMode,
  setAutonomousMode,
  pendingCommentsCount,
  onOpenAccountConnector
}) => {
  return (
    <header className="sticky top-0 z-50 bg-[#0d121d]/90 backdrop-blur-md border-b border-slate-800/80 px-4 lg:px-8 py-3.5">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Brand & Profile Identity */}
        <div 
          onClick={onOpenAccountConnector}
          className="flex items-center gap-3.5 cursor-pointer group"
          title="Click to switch or configure Instagram profile"
        >
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-400 via-purple-500 to-pink-500 p-[2px] shadow-lg shadow-purple-500/25 group-hover:scale-105 transition-transform flex items-center justify-center">
              <div className="w-full h-full rounded-[10px] bg-[#0b0f19] flex items-center justify-center overflow-hidden">
                <span className="font-black text-sm tracking-tighter bg-gradient-to-tr from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  SX
                </span>
              </div>
            </div>
            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-[#0d121d] rounded-full" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white tracking-tight flex items-center gap-1.5 text-base group-hover:text-pink-300 transition-colors">
                {analytics.profile.name || 'SARLX.Ai'}
                <CheckCircle2 className="w-4 h-4 text-sky-400 fill-sky-400/20" />
              </span>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 flex items-center gap-1">
                <Flame className="w-3 h-3 text-pink-400" />
                {analytics.metrics.impressionsChange > 0 ? `+${analytics.metrics.impressionsChange}%` : '0%'} Impressions
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
              <span>{analytics.profile.followers.toLocaleString()} Followers</span>
              <span className="text-slate-600">•</span>
              <span className="text-emerald-400 font-medium">{analytics.metrics.impressions.toLocaleString()} Impressions</span>
              <span className="text-slate-600">•</span>
              <span className="text-[11px] text-pink-400/90 hover:underline">Edit Profile ✎</span>
            </p>
          </div>
        </div>

        {/* Autonomous Mode Toggle & Action */}
        <div className="flex items-center gap-3 self-end md:self-auto">
          {onOpenAccountConnector && (
            <button
              type="button"
              onClick={onOpenAccountConnector}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors"
            >
              <Instagram className="w-3.5 h-3.5 text-pink-400" />
              Sync Account
            </button>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800">
            <Bot className={`w-4 h-4 ${autonomousMode ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
            <div className="text-left">
              <span className="block text-[11px] font-semibold text-slate-200">
                {autonomousMode ? 'AI Autopilot Active' : 'Manual Co-Pilot'}
              </span>
              <span className="block text-[9px] text-slate-400">
                {autonomousMode ? 'Auto-replies & scheduling on' : 'Requires approval'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAutonomousMode(prev => !prev)}
              className={`ml-2 relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                autonomousMode ? 'bg-emerald-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  autonomousMode ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto mt-3 pt-2 border-t border-slate-800/50 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
            activeTab === 'analytics'
              ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5 text-sky-400" />
          Growth & Strategy
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reels')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
            activeTab === 'reels'
              ? 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-200 border border-pink-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Film className="w-3.5 h-3.5 text-pink-400" />
          AI Reel Studio
          <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-ping" />
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('posts')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
            activeTab === 'posts'
              ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          Carousel & Post Maker
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('comments')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all relative ${
            activeTab === 'comments'
              ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
          Auto-Responder
          {pendingCommentsCount > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-pink-500 text-white">
              {pendingCommentsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('schedule')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
            activeTab === 'schedule'
              ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Calendar className="w-3.5 h-3.5 text-purple-400" />
          Auto-Scheduler
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('gallery')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
            activeTab === 'gallery'
              ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Instagram className="w-3.5 h-3.5 text-rose-400" />
          Content Gallery
        </button>
      </div>
    </header>
  );
};
