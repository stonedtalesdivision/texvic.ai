import React, { useState } from 'react';
import { 
  MessageSquare, Bot, Send, Sparkles, Filter, CheckCircle2, 
  AlertTriangle, MessageCircle, RefreshCw, Zap, ShieldAlert, ArrowRight 
} from 'lucide-react';
import { CommentItem } from '../types';

interface AutoResponderProps {
  comments: CommentItem[];
  autonomousMode: boolean;
  setAutonomousMode: (val: boolean | ((prev: boolean) => boolean)) => void;
  onUpdateComment: (comment: CommentItem) => void;
  onAddComment: (comment: CommentItem) => void;
}

export const AutoResponder: React.FC<AutoResponderProps> = ({
  comments,
  autonomousMode,
  setAutonomousMode,
  onUpdateComment,
  onAddComment
}) => {
  const [filterSentiment, setFilterSentiment] = useState<string>('all');
  const [draftReplies, setDraftReplies] = useState<Record<string, string>>({});
  const [loadingReplies, setLoadingReplies] = useState<Record<string, boolean>>({});

  const filteredComments = comments.filter(c => {
    if (filterSentiment === 'all') return true;
    if (filterSentiment === 'pending') return c.replyStatus === 'pending';
    return c.sentiment === filterSentiment;
  });

  const getSentimentBadge = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Positive</span>;
      case 'purchase_intent':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-500/20 text-pink-300 border border-pink-500/30">Keyword Lead</span>;
      case 'question':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">Question</span>;
      case 'skeptical':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">Skeptical</span>;
      case 'spam':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">Spam Filtered</span>;
      default:
        return null;
    }
  };

  const handleGenerateAiReply = async (comment: CommentItem) => {
    setLoadingReplies(prev => ({ ...prev, [comment.id]: true }));
    try {
      const response = await fetch('/api/agent/auto-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentText: comment.text,
          postTitle: comment.postTitle,
          authorHandle: comment.authorHandle
        })
      });

      const data = await response.json();
      if (data.success && data.result) {
        setDraftReplies(prev => ({
          ...prev,
          [comment.id]: data.result.replyText || `Thanks for the comment ${comment.authorHandle}!`
        }));
      }
    } catch (err) {
      console.error('Error generating AI reply:', err);
    } finally {
      setLoadingReplies(prev => ({ ...prev, [comment.id]: false }));
    }
  };

  const handleSendReply = (comment: CommentItem) => {
    const textToSend = draftReplies[comment.id];
    if (!textToSend) return;

    const updated: CommentItem = {
      ...comment,
      replyStatus: 'custom_replied',
      replyText: textToSend,
      replyTimestamp: 'Just now',
      autoRepliedByAi: false
    };

    onUpdateComment(updated);
    setDraftReplies(prev => {
      const copy = { ...prev };
      delete copy[comment.id];
      return copy;
    });
  };

  const handleSimulateNewComment = () => {
    const mockInbound = [
      {
        author: 'Liam Miller',
        handle: '@liamm_films',
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
        text: 'TOOL - sending to my video editor immediately!! 🙌',
        sentiment: 'purchase_intent' as const,
        intentLabel: 'Keyword Trigger ("TOOL")'
      },
      {
        author: 'Chloe Dupont',
        handle: '@chloed_designs',
        avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&auto=format&fit=crop&q=80',
        text: 'This retention pacing completely blew my mind. Applying on my next reel! 🔥',
        sentiment: 'positive' as const,
        intentLabel: 'High Praise'
      },
      {
        author: 'Jordan Vance',
        handle: '@jvance_growth',
        avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=100&auto=format&fit=crop&q=80',
        text: 'What audio track was used in the first 3 seconds? The bass sync was crazy.',
        sentiment: 'question' as const,
        intentLabel: 'Audio Inquiry'
      }
    ];

    const pick = mockInbound[Math.floor(Math.random() * mockInbound.length)];
    const newId = `cmt-${Date.now()}`;

    // If autonomous mode is ON, auto-reply immediately
    const autoReplyText = pick.sentiment === 'purchase_intent'
      ? `Just fired the complete cheat-sheet and workflow guide to your DMs ${pick.handle}! Check requests if not in inbox 🚀`
      : `Appreciate you ${pick.handle}! Keep crushing your reel retention! 🔥`;

    const newComment: CommentItem = {
      id: newId,
      postId: 'reel-viral-1',
      postTitle: 'The 3-Second Rule That 10x My Reel Views',
      author: pick.author,
      authorHandle: pick.handle,
      authorAvatar: pick.avatar,
      text: pick.text,
      timestamp: 'Just now',
      sentiment: pick.sentiment,
      intentLabel: pick.intentLabel,
      replyStatus: autonomousMode ? 'auto_replied' : 'pending',
      replyText: autonomousMode ? autoReplyText : undefined,
      replyTimestamp: autonomousMode ? 'Just now' : undefined,
      autoRepliedByAi: autonomousMode
    };

    onAddComment(newComment);
  };

  const pendingCount = comments.filter(c => c.replyStatus === 'pending').length;

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-8">
      {/* Banner */}
      <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-slate-900 border border-emerald-500/20 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1.5 mb-2">
            <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
            Autonomous Community & Lead Responder
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Auto-Respond to Comments & Dispatch Instant DM Lead Links
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
            Replying within 15 minutes boosts your post's placement on the Instagram Explore page by up to 2.4x.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSimulateNewComment}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 transition-all shadow-md"
          >
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            Simulate Inbound Comment
          </button>
        </div>
      </div>

      {/* Rules & Automation Status Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              autonomousMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
            }`}>
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">Autonomous Mode</span>
              <span className="text-[11px] text-slate-400">
                {autonomousMode ? 'Auto-replies live 24/7' : 'Manual approval mode'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAutonomousMode(prev => !prev)}
            className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all ${
              autonomousMode
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            {autonomousMode ? 'Active' : 'Enable'}
          </button>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-500/20 text-pink-400 flex items-center justify-center">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-bold text-white block">DM Keyword Trigger</span>
            <span className="text-[11px] text-slate-400">
              When user writes <strong>"TOOL"</strong> or <strong>"GUIDE"</strong>, auto-dispatch resource link.
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-bold text-white block">Spam & Scam Shield</span>
            <span className="text-[11px] text-slate-400">
              Auto-silences crypto spam, telegram bots, and promotional links.
            </span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: 'All Comments', count: comments.length },
            { id: 'pending', label: 'Needs Reply', count: pendingCount },
            { id: 'purchase_intent', label: 'Lead Triggers', count: comments.filter(c => c.sentiment === 'purchase_intent').length },
            { id: 'question', label: 'Questions', count: comments.filter(c => c.sentiment === 'question').length },
            { id: 'positive', label: 'Positive', count: comments.filter(c => c.sentiment === 'positive').length },
            { id: 'spam', label: 'Spam Filtered', count: comments.filter(c => c.sentiment === 'spam').length },
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilterSentiment(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                filterSentiment === f.id
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
              }`}
            >
              {f.label}
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-950 text-slate-400">
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Comment Stream List */}
      <div className="space-y-4">
        {filteredComments.map((comment) => {
          const isPending = comment.replyStatus === 'pending';
          const isLoading = loadingReplies[comment.id];
          const draftText = draftReplies[comment.id] !== undefined ? draftReplies[comment.id] : '';

          return (
            <div
              key={comment.id}
              className={`p-5 rounded-2xl border transition-all ${
                comment.sentiment === 'spam'
                  ? 'bg-slate-950/40 border-slate-800/60 opacity-60'
                  : 'bg-slate-900/80 border-slate-800 shadow-md'
              }`}
            >
              {/* Comment Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-3">
                  <img
                    src={comment.authorAvatar}
                    alt={comment.author}
                    className="w-9 h-9 rounded-full object-cover border border-slate-700"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">{comment.author}</span>
                      <span className="text-[11px] text-slate-400">{comment.authorHandle}</span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      on <em>"{comment.postTitle}"</em> • {comment.timestamp}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {getSentimentBadge(comment.sentiment)}
                  <span className="text-[10px] text-slate-400 font-mono">
                    {comment.intentLabel}
                  </span>
                </div>
              </div>

              {/* Comment Body */}
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium pl-12 mb-3">
                "{comment.text}"
              </p>

              {/* Already Replied State */}
              {comment.replyText && (
                <div className="ml-12 p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 text-xs text-slate-300 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-400 flex items-center gap-1.5 text-[11px]">
                      {comment.autoRepliedByAi ? (
                        <>
                          <Bot className="w-3.5 h-3.5" />
                          AI Autonomous Reply
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Replied
                        </>
                      )}
                    </span>
                    <span className="text-[10px] text-slate-500">{comment.replyTimestamp}</span>
                  </div>
                  <p className="leading-relaxed text-slate-200">{comment.replyText}</p>
                </div>
              )}

              {/* Pending Action Controls */}
              {isPending && comment.sentiment !== 'spam' && (
                <div className="ml-12 pt-3 border-t border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => handleGenerateAiReply(comment)}
                      disabled={isLoading}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-pink-500/10 hover:bg-pink-500/20 text-pink-300 border border-pink-500/30 flex items-center gap-1.5 transition-all"
                    >
                      {isLoading ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                      )}
                      Generate Smart AI Reply
                    </button>

                    <span className="text-[10px] text-slate-400">
                      Draft a personalized response or edit below
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={draftText}
                      onChange={(e) => setDraftReplies(prev => ({ ...prev, [comment.id]: e.target.value }))}
                      placeholder={`Reply to ${comment.authorHandle}...`}
                      className="flex-1 px-3.5 py-2 text-xs rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleSendReply(comment)}
                      disabled={!draftText.trim()}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-slate-950 flex items-center gap-1.5 transition-all"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Reply
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
