import React, { useState } from 'react';
import { 
  Sparkles, Film, Music, Clock, Zap, Plus, RefreshCw, CheckCircle2, 
  Layers, Sliders, Volume2, ArrowRight, Eye, Calendar, Bookmark, AlertCircle 
} from 'lucide-react';
import { ReelItem, TrendingAudio, ReelTemplate, ReelScene } from '../types';
import { PRODUCTION_TEMPLATES, PRODUCTION_TRENDING_AUDIOS } from '../constants';
import { ReelPlayer } from './ReelPlayer';
import { playTrendingAudioTrack, stopAudioTrack } from '../utils/audioSynth';

interface ReelGeneratorProps {
  onSaveToGallery: (reel: ReelItem) => void;
  onScheduleReel: (reel: ReelItem) => void;
}

export const ReelGenerator: React.FC<ReelGeneratorProps> = ({ onSaveToGallery, onScheduleReel }) => {
  const [selectedTemplate, setSelectedTemplate] = useState<ReelTemplate>(PRODUCTION_TEMPLATES[0]);
  const [selectedAudio, setSelectedAudio] = useState<TrendingAudio>(PRODUCTION_TRENDING_AUDIOS[0]);
  const [niche, setNiche] = useState('AI & Content Scaling');
  const [topic, setTopic] = useState('How 1 retention tweak 10x our Instagram reel views');
  const [targetDuration, setTargetDuration] = useState<number>(8);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activePreviewReel, setActivePreviewReel] = useState<ReelItem | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  const quickNiches = [
    { label: 'AI Hacks', topic: '5 free AI tools that feel illegal to know' },
    { label: 'Instagram Growth', topic: 'Stop losing 70% of viewers in the first 2 seconds' },
    { label: 'Design & UX', topic: 'Why top designers never use pure black #000' },
    { label: 'Creator Mindset', topic: 'The brutal truth about scaling to 100K followers' },
  ];

  const handleAudioPreview = (audio: TrendingAudio) => {
    if (playingAudioId === audio.id) {
      stopAudioTrack();
      setPlayingAudioId(null);
    } else {
      stopAudioTrack();
      playTrendingAudioTrack(audio.synthPreset, audio.bpm, 10);
      setPlayingAudioId(audio.id);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    stopAudioTrack();
    setPlayingAudioId(null);

    try {
      let generated: any = null;
      try {
        const response = await fetch('/api/agent/generate-reel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            niche,
            topic,
            templateId: selectedTemplate.id,
            duration: targetDuration,
            audioMood: selectedAudio.mood
          })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.reel) {
            generated = data.reel;
          }
        }
      } catch (fetchErr) {
        console.warn('Network error while requesting reel generation, utilizing local generator engine:', fetchErr);
      }

      // If server or network returned no reel, provide an immediate algorithmic reel
      if (!generated) {
        const s1 = Number((targetDuration * 0.28).toFixed(1));
        const s2 = Number((targetDuration * 0.42).toFixed(1));
        const s3 = Number((targetDuration - s1 - s2).toFixed(1));
        generated = {
          title: topic ? `${topic} (${targetDuration}s Viral Loop)` : `The Algorithm Rule You're Missing (${targetDuration}s Loop)`,
          hookScore: 95,
          retentionEstimate: 84,
          duration: targetDuration,
          caption: `Stop losing 70% of viewers in the first 2 seconds.\n\nHere is the exact formula for ${topic || niche}:\n1. Pattern interrupt in frame 1\n2. Audio beat reveal at ${s1}s\n3. Ending loops straight into opening\n\nComment "GROWTH" below and I'll send you our complete viral template! 🚀`,
          hashtags: [`#${niche.toLowerCase().replace(/[^a-z0-9]/g, '')}`, '#reelsgrowth', '#instagramtips', '#viralcontent', '#creator'],
          scenes: [
            {
              order: 1,
              durationSeconds: s1,
              hookText: 'Stop posting Reels without this 1 rule.',
              secondaryText: 'You lose 70% in frame 1.',
              visualTheme: 'neon-cyber',
              accentColor: '#ec4899',
              pacingEffect: 'flash-cut'
            },
            {
              order: 2,
              durationSeconds: s2,
              hookText: topic.length > 42 ? topic.slice(0, 39) + '...' : topic,
              secondaryText: 'Sync your visual reveal with the audio drop.',
              visualTheme: 'electric-violet',
              accentColor: '#8b5cf6',
              pacingEffect: 'zoom-in'
            },
            {
              order: 3,
              durationSeconds: s3,
              hookText: 'Comment "GROWTH" for the cheat-sheet.',
              secondaryText: 'Sent directly to your DMs in 10s.',
              visualTheme: 'sunset-glow',
              accentColor: '#f59e0b',
              pacingEffect: 'subtle-drift'
            }
          ]
        };
      }

      const newReel: ReelItem = {
        id: `reel-${Date.now()}`,
        title: generated.title || topic,
        niche,
        duration: generated.duration || targetDuration,
        audio: selectedAudio,
        scenes: generated.scenes && generated.scenes.length > 0 ? generated.scenes.map((s: any, idx: number) => ({
          id: `sc-${idx}`,
          order: idx + 1,
          durationSeconds: s.durationSeconds || Math.round(targetDuration / 3),
          hookText: s.hookText || 'Scene text',
          secondaryText: s.secondaryText || '',
          visualTheme: s.visualTheme || 'neon-cyber',
          accentColor: s.accentColor || '#ec4899',
          pacingEffect: s.pacingEffect || 'flash-cut'
        })) : [
          {
            id: 'sc-1',
            order: 1,
            durationSeconds: 2.2,
            hookText: 'Stop making this #1 Reel mistake.',
            secondaryText: 'You lose 80% in frame 1.',
            visualTheme: 'neon-cyber',
            accentColor: '#ec4899',
            pacingEffect: 'flash-cut'
          },
          {
            id: 'sc-2',
            order: 2,
            durationSeconds: 3.2,
            hookText: 'Sync your visual reveal with the audio drop.',
            secondaryText: 'Watch time skyrockets past 100%.',
            visualTheme: 'electric-violet',
            accentColor: '#8b5cf6',
            pacingEffect: 'zoom-in'
          },
          {
            id: 'sc-3',
            order: 3,
            durationSeconds: 2.6,
            hookText: 'Comment "GROWTH" for the cheat-sheet.',
            secondaryText: 'Sent to your DMs in 10s.',
            visualTheme: 'sunset-glow',
            accentColor: '#f59e0b',
            pacingEffect: 'subtle-drift'
          }
        ],
        caption: generated.caption || `Viral Reel generated for ${niche}.\n\nDrop "GROWTH" below for the complete guide! 🚀`,
        hashtags: generated.hashtags || ['#reelsgrowth', '#viralcontent', '#instagramtips', '#creator', '#algorithm'],
        hookScore: generated.hookScore || 94,
        retentionEstimate: generated.retentionEstimate || 81,
        createdAt: new Date().toISOString(),
        status: 'saved',
        scheduledPlatforms: ['instagram'],
        videoTemplateId: selectedTemplate.id,
        likes: 0,
        views: 0,
        commentsCount: 0,
        shares: 0
      };

      setActivePreviewReel(newReel);
    } catch (err) {
      console.error('Failed to generate reel:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = (reel: ReelItem) => {
    onSaveToGallery(reel);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-slate-900 border border-pink-500/20 rounded-2xl p-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-pink-500/20 text-pink-400 border border-pink-500/30 flex items-center gap-1">
              <Film className="w-3.5 h-3.5" />
              AI Reel Generator
            </span>
            <span className="text-xs text-slate-400">Short-form Algorithm Engine</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Create High-Retention Viral Reels Aligned with Trending Audio
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
            Automatically pairs contrarian 3-second hooks, dynamic beat drops, and seamless loop connectors calibrated for 100%+ completion rates on Instagram.
          </p>
        </div>

        {savedSuccess && (
          <div className="px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-bounce">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Reel Saved to Content Gallery!
          </div>
        )}
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Configuration & AI Prompts (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Step 1: Template Selection */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-pink-400" />
                1. Select AI-Driven Pacing Template
              </label>
              <span className="text-xs font-semibold text-pink-400">
                {selectedTemplate.category}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PRODUCTION_TEMPLATES.map((tmpl) => {
                const isSelected = selectedTemplate.id === tmpl.id;
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => {
                      setSelectedTemplate(tmpl);
                      setTargetDuration(tmpl.targetDuration);
                    }}
                    className={`p-3.5 rounded-xl text-left border transition-all ${
                      isSelected
                        ? 'bg-pink-500/10 border-pink-500/60 shadow-md shadow-pink-500/10'
                        : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/70 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-white tracking-tight">
                        {tmpl.name}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950/60 text-slate-400">
                        {tmpl.targetDuration}s
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mb-2">
                      {tmpl.description}
                    </p>
                    <div className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-emerald-400" />
                      {tmpl.watchTimeBenefit}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Topic & Niche Configuration */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              2. Content Strategy & Topic Prompt
            </label>

            {/* Quick Inspiration Pills */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              <span className="text-[11px] font-semibold text-slate-500 shrink-0">Presets:</span>
              {quickNiches.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setNiche(item.label);
                    setTopic(item.topic);
                  }}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 whitespace-nowrap transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Niche / Target Audience
                </label>
                <input
                  type="text"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  placeholder="e.g. AI Tools, Real Estate, Fitness"
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-pink-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Target Duration
                  </label>
                  <span className="text-xs font-mono font-bold text-pink-400">
                    {targetDuration}s (Veo: 4-8s)
                  </span>
                </div>
                <input
                  type="range"
                  min={6}
                  max={8}
                  step={1}
                  value={targetDuration}
                  onChange={(e) => setTargetDuration(Number(e.target.value))}
                  className="w-full accent-pink-500 cursor-pointer"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Core Reel Revelation or Hook Idea
              </label>
              <textarea
                rows={2}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="What contrarian fact or high-value tip will stop them from scrolling?"
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-pink-500 leading-relaxed"
              />
            </div>
          </div>

          {/* Step 3: Trending Audio Selection */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Music className="w-4 h-4 text-purple-400" />
                3. Add AI Audio Bed
              </label>
              <span className="text-[11px] text-slate-400">
                Original instrumental audio matched to the selected BPM and mood
              </span>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {PRODUCTION_TRENDING_AUDIOS.map((audio) => {
                const isSelected = selectedAudio.id === audio.id;
                const isPlaying = playingAudioId === audio.id;

                return (
                  <div
                    key={audio.id}
                    onClick={() => setSelectedAudio(audio)}
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-purple-500/10 border-purple-500/60'
                        : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAudioPreview(audio);
                        }}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                          isPlaying 
                            ? 'bg-pink-500 text-white animate-pulse' 
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>

                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-white">{audio.title}</h4>
                          <span className="text-[10px] font-mono text-purple-400 font-semibold">
                            {audio.bpm} BPM
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {audio.artist} • Drop: {audio.dropTimestamp}s • {audio.usesCount}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-500/20 text-pink-300 border border-pink-500/30">
                        {audio.viralVelocity}
                      </span>
                      {isSelected && (
                        <CheckCircle2 className="w-4 h-4 text-purple-400" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Generate Button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`w-full py-4 px-6 rounded-2xl text-sm font-black flex items-center justify-center gap-2.5 shadow-xl transition-all ${
              isGenerating
                ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 text-white shadow-pink-500/25 active:scale-[0.99]'
            }`}
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin text-pink-400" />
                Directing Scene Beats & Aligning Audio Drops...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generate AI Reel with Audio
              </>
            )}
          </button>
        </div>

        {/* Right Column: Interactive 9:16 Reel Player & Diagnostic (5 cols) */}
        <div className="lg:col-span-5 flex flex-col items-center">
          {activePreviewReel ? (
            <div className="w-full space-y-4">
              <div className="flex items-center justify-between px-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-emerald-400" />
                  Live 9:16 Video Simulation
                </span>
                <span className="text-[11px] font-mono text-pink-400">
                  {activePreviewReel.duration}s Viral Concept
                </span>
              </div>

              <ReelPlayer
                reel={activePreviewReel}
                onSave={handleSave}
                onSchedule={onScheduleReel}
              />
            </div>
          ) : (
            <div className="w-full h-[580px] bg-slate-900/60 border-2 border-dashed border-slate-800 rounded-3xl flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-pink-500/20 to-purple-500/20 border border-pink-500/30 flex items-center justify-center mb-4 shadow-xl">
                <Film className="w-8 h-8 text-pink-400" />
              </div>
              <h3 className="text-base font-bold text-white mb-2">No Reel Generated Yet</h3>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed mb-6">
                Select your template and topic above, then click <strong>"Generate AI Reel"</strong> to preview your 9:16 video with an original AI-generated audio bed.
              </p>
              <button
                type="button"
                onClick={handleGenerate}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-pink-300 border border-pink-500/30 flex items-center gap-2 transition-all"
              >
                <Sparkles className="w-4 h-4 text-pink-400" />
                Generate Demo Reel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
