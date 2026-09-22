import React, { useState } from 'react';
import { 
  Sparkles, Layers, ChevronLeft, ChevronRight, Bookmark, Calendar, 
  Copy, Check, Send, Heart, MessageCircle, RefreshCw, CheckCircle2 
} from 'lucide-react';
import { PostItem, CarouselSlide } from '../types';
import { INITIAL_POSTS } from '../data/mockData';

interface CarouselPostCreatorProps {
  onSaveToGallery: (post: PostItem) => void;
  onSchedulePost: (post: PostItem) => void;
}

export const CarouselPostCreator: React.FC<CarouselPostCreatorProps> = ({
  onSaveToGallery,
  onSchedulePost
}) => {
  const [topic, setTopic] = useState('How 1 structural change in your content generates 10x bookmarks');
  const [niche, setNiche] = useState('Instagram Strategy & AI Growth');
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentPost, setCurrentPost] = useState<PostItem>(INITIAL_POSTS[0]);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const slides = currentPost.slides || [];
  const activeSlide = slides[activeSlideIndex] || slides[0];

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      let postData: any = null;
      try {
        const response = await fetch('/api/agent/generate-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic,
            niche,
            format: 'carousel'
          })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.post) {
            postData = data.post;
          }
        }
      } catch (fetchErr) {
        console.warn('Network issue fetching carousel, generating locally:', fetchErr);
      }

      if (!postData) {
        postData = {
          title: topic ? `How to 5x Your ${topic}` : `The 2026 Instagram Architecture`,
          caption: `Swipe through for the complete high-density breakdown on ${topic || niche}.\n\nMost creators plateau because their content doesn't deliver bookmarkable utility.\n\nSave this post so you don't lose the blueprint! 📌`,
          hashtags: ['#instagramgrowth', '#contentcreation', '#carouseldesign', '#creators', '#socialstrategy'],
          engagementScore: 94,
          slides: [
            {
              slideNumber: 1,
              headline: `How to 5x Your ${topic || 'Reach'}`,
              bodyText: 'The exact framework top creators use to dominate explore pages.',
              takeaway: 'Swipe to unlock the framework →',
              theme: 'dark'
            },
            {
              slideNumber: 2,
              headline: 'Mistake #1: Weak Visual Anchors',
              bodyText: "If your headline doesn't force a pause in 0.5s, the best value inside will never be read.",
              takeaway: 'Contrast is king on mobile screens.',
              theme: 'indigo'
            },
            {
              slideNumber: 3,
              headline: 'The Micro-Value Rule',
              bodyText: 'Deliver 1 concrete tactic that can be implemented within 10 minutes.',
              takeaway: 'Instant clarity drives saves & shares.',
              theme: 'slate'
            },
            {
              slideNumber: 4,
              headline: 'Save for Next Session',
              bodyText: 'Tap the bookmark icon to revisit this when you batch your weekly content.',
              takeaway: 'Bookmark & Tag a Creator 📌',
              theme: 'emerald'
            }
          ]
        };
      }

      const newPost: PostItem = {
        id: `post-${Date.now()}`,
        type: 'carousel',
        title: postData.title || topic,
        caption: postData.caption || `Here is how to master ${topic} on Instagram 🚀`,
        hashtags: postData.hashtags || ['#instagramtips', '#carouselgrowth', '#contentdesign'],
        slides: postData.slides || [],
        status: 'saved',
        scheduledPlatforms: ['instagram'],
        createdAt: new Date().toISOString(),
        engagementScore: postData.engagementScore || 94
      };
      setCurrentPost(newPost);
      setActiveSlideIndex(0);
    } catch (err) {
      console.error('Failed to generate post:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyCaption = () => {
    const fullText = `${currentPost.caption}\n\n${currentPost.hashtags.join(' ')}`;
    navigator.clipboard.writeText(fullText);
    setCopiedCaption(true);
    setTimeout(() => setCopiedCaption(false), 2000);
  };

  const handleSave = () => {
    onSaveToGallery(currentPost);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2400);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-slate-900 border border-amber-500/20 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1.5 mb-2">
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            High-Save Carousel Designer
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Create High-Density Instagram Carousels Optimized for Saves
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
            Carousels generate up to 3.1x more bookmarks than single images. Our AI designs each slide with structured readability.
          </p>
        </div>

        {savedSuccess && (
          <div className="px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Saved to Gallery!
          </div>
        )}
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Side: Inputs & Generator (6 cols) */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Carousel Parameters
            </h3>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Niche / Category
              </label>
              <input
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="e.g. AI Tools, Design, Freelancing"
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Topic or Value Proposition
              </label>
              <textarea
                rows={3}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="What actionable framework will you break down across slides?"
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 leading-relaxed"
              />
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className={`w-full py-3.5 px-5 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg transition-all ${
                isGenerating
                  ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-amber-500 to-pink-600 hover:from-amber-600 hover:to-pink-700 text-white shadow-amber-500/20'
              }`}
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                  Generating Multi-Slide Framework...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate 4-Slide Viral Carousel
                </>
              )}
            </button>
          </div>

          {/* Generated Caption & Hashtags Card */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Generated Instagram Caption & Hashtags
              </h3>
              <button
                type="button"
                onClick={handleCopyCaption}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 transition-all"
              >
                {copiedCaption ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedCaption ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto font-sans">
              {currentPost.caption}
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {currentPost.hashtags.map((tag, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-slate-800 text-pink-300 border border-slate-700"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleSave}
                className="flex-1 py-2 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center gap-1.5 transition-all"
              >
                <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                Save to Content Gallery
              </button>
              <button
                type="button"
                onClick={() => onSchedulePost(currentPost)}
                className="flex-1 py-2 rounded-lg text-xs font-bold bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 flex items-center justify-center gap-1.5 transition-all"
              >
                <Calendar className="w-3.5 h-3.5 text-purple-400" />
                Schedule Drop
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Interactive Carousel Slide Viewer (6 cols) */}
        <div className="lg:col-span-6 flex flex-col items-center">
          <div className="w-full max-w-[420px] bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl">
            {/* Slide Header Indicator */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white tracking-tight">
                  Slide {activeSlideIndex + 1} of {slides.length}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  {activeSlideIndex === 0 ? 'Cover Slide' : activeSlideIndex === slides.length - 1 ? 'Save CTA' : 'Value Slide'}
                </span>
              </div>

              {/* Slide dots */}
              <div className="flex items-center gap-1.5">
                {slides.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveSlideIndex(idx)}
                    className={`h-1.5 rounded-full transition-all ${
                      idx === activeSlideIndex ? 'w-6 bg-pink-500' : 'w-1.5 bg-slate-700'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* 1:1 Aspect Ratio Square Carousel Slide Frame */}
            <div className="relative aspect-square w-full rounded-2xl p-6 flex flex-col justify-between overflow-hidden shadow-inner border border-slate-800 bg-gradient-to-br from-slate-950 via-[#111624] to-[#1c1224]">
              {/* Subtle ambient lighting inside the slide */}
              <div className="absolute top-0 right-0 w-44 h-44 rounded-full bg-pink-500/10 blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-44 h-44 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

              {/* Slide Top Bar */}
              <div className="relative z-10 flex items-center justify-between text-xs text-slate-400 font-medium">
                <span className="font-bold text-pink-400">@alexcreates.ai</span>
                <span className="text-[10px] uppercase tracking-wider font-mono bg-slate-900/80 px-2 py-0.5 rounded-md border border-slate-800">
                  Part 0{activeSlideIndex + 1}
                </span>
              </div>

              {/* Slide Content Body */}
              <div className="relative z-10 my-auto text-left space-y-3">
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-snug">
                  {activeSlide?.headline}
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
                  {activeSlide?.bodyText}
                </p>
              </div>

              {/* Slide Bottom Callout */}
              <div className="relative z-10 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-400">
                  {activeSlide?.takeaway}
                </span>
                <div className="flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-slate-500" />
                  <Heart className="w-4 h-4 text-slate-500" />
                </div>
              </div>
            </div>

            {/* Slide Navigation Buttons */}
            <div className="flex items-center justify-between mt-4">
              <button
                type="button"
                disabled={activeSlideIndex === 0}
                onClick={() => setActiveSlideIndex(prev => Math.max(0, prev - 1))}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous Slide
              </button>

              <span className="text-xs text-slate-400 font-mono">
                {activeSlideIndex + 1} / {slides.length}
              </span>

              <button
                type="button"
                disabled={activeSlideIndex === slides.length - 1}
                onClick={() => setActiveSlideIndex(prev => Math.min(slides.length - 1, prev + 1))}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-all"
              >
                Next Slide
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
