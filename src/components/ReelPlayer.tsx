import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, Volume2, VolumeX, Heart, MessageCircle, Send, Bookmark, 
  Music, Eye, Share2, Sparkles, Check, Download, Calendar, Layers, ShieldCheck
} from 'lucide-react';
import { ReelItem, TrendingAudio } from '../types';
import { playTrendingAudioTrack, stopAudioTrack, setBeatListener } from '../utils/audioSynth';

interface ReelPlayerProps {
  reel: ReelItem;
  onSchedule?: (reel: ReelItem) => void;
  onSave?: (reel: ReelItem) => void;
}

export const ReelPlayer: React.FC<ReelPlayerProps> = ({ reel, onSchedule, onSave }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(reel.likes || 14200);
  const [saved, setSaved] = useState(false);
  const [beatPulse, setBeatPulse] = useState(false);
  const [exported, setExported] = useState(false);

  const duration = reel.duration || 8;
  const scenes = reel.scenes && reel.scenes.length > 0 ? reel.scenes : [];
  const timerRef = useRef<number | null>(null);

  // Sync beats with audio synthesizer
  useEffect(() => {
    setBeatListener((beatIndex) => {
      setBeatPulse(true);
      setTimeout(() => setBeatPulse(false), 120);
    });

    return () => {
      setBeatListener(null);
      stopAudioTrack();
    };
  }, []);

  // Playback timer loop
  useEffect(() => {
    if (isPlaying) {
      if (!isMuted && reel.audio) {
        playTrendingAudioTrack(reel.audio.synthPreset, reel.audio.bpm, reel.duration);
      }

      const intervalMs = 50;
      timerRef.current = window.setInterval(() => {
        setCurrentTime(prev => {
          const next = prev + intervalMs / 1000;
          if (next >= duration) {
            // Loop back seamlessly
            return 0;
          }
          return next;
        });
      }, intervalMs);
    } else {
      stopAudioTrack();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isPlaying, isMuted, duration, reel.audio, reel.duration]);

  // Update current scene based on currentTime
  useEffect(() => {
    if (scenes.length === 0) return;
    let accumulated = 0;
    for (let i = 0; i < scenes.length; i++) {
      accumulated += scenes[i].durationSeconds;
      if (currentTime <= accumulated || i === scenes.length - 1) {
        setCurrentSceneIndex(i);
        break;
      }
    }
  }, [currentTime, scenes]);

  const activeScene = scenes[currentSceneIndex] || scenes[0];

  const togglePlay = () => {
    setIsPlaying(prev => !prev);
  };

  const toggleMute = () => {
    setIsMuted(prev => {
      const next = !prev;
      if (next) {
        stopAudioTrack();
      } else if (isPlaying && reel.audio) {
        playTrendingAudioTrack(reel.audio.synthPreset, reel.audio.bpm, reel.duration);
      }
      return next;
    });
  };

  const handleLike = () => {
    setLiked(prev => {
      const next = !prev;
      setLikesCount(c => next ? c + 1 : c - 1);
      return next;
    });
  };

  const handleExport = () => {
    setExported(true);
    setTimeout(() => setExported(false), 2400);
  };

  // Get background gradient by scene theme
  const getBackgroundStyle = (theme?: string) => {
    switch (theme) {
      case 'neon-cyber':
        return 'from-[#0f172a] via-[#31103f] to-[#090d16]';
      case 'sunset-glow':
        return 'from-[#2b0c1b] via-[#4a1525] to-[#120a17]';
      case 'minimal-dark':
        return 'from-[#090b10] via-[#131926] to-[#050608]';
      case 'electric-violet':
        return 'from-[#17092b] via-[#2d1254] to-[#0a0714]';
      case 'emerald-flux':
        return 'from-[#051f1a] via-[#093328] to-[#04120e]';
      default:
        return 'from-[#0f172a] via-[#1e1b4b] to-[#090d16]';
    }
  };

  return (
    <div className="flex flex-col xl:flex-row items-center justify-center gap-6 p-4">
      {/* 9:16 Smartphone Reel Container */}
      <div className="relative w-[320px] sm:w-[350px] h-[640px] sm:h-[680px] bg-black rounded-[42px] p-3 shadow-2xl shadow-purple-900/20 border-4 border-slate-700/60 select-none flex flex-col justify-between overflow-hidden">
        
        {/* Dynamic Canvas / Animated Video Background */}
        <div 
          className={`absolute inset-0 bg-gradient-to-b ${getBackgroundStyle(activeScene?.visualTheme)} transition-all duration-700 overflow-hidden rounded-[38px]`}
        >
          {/* Animated decorative geometric & lighting elements */}
          <div 
            className={`absolute top-1/4 -left-12 w-64 h-64 rounded-full blur-3xl opacity-40 transition-transform duration-300 pointer-events-none ${
              beatPulse ? 'scale-125 opacity-70' : 'scale-100 opacity-40'
            }`}
            style={{ backgroundColor: activeScene?.accentColor || '#ec4899' }}
          />
          <div 
            className="absolute bottom-1/3 -right-12 w-64 h-64 rounded-full blur-3xl opacity-30 bg-indigo-600 pointer-events-none"
          />

          {/* Grid ambient texture */}
          <div 
            className="absolute inset-0 opacity-[0.07] bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"
          />

          {/* Reel Interactive Canvas Center - High Watch-Time Typography */}
          <div 
            onClick={togglePlay}
            className="relative z-10 w-full h-full flex flex-col items-center justify-center px-6 text-center cursor-pointer"
          >
            {/* Safe zone overlay guide (when enabled) */}
            {showSafeZones && (
              <div className="absolute inset-x-4 top-16 bottom-28 border-2 border-dashed border-sky-400/40 rounded-2xl pointer-events-none flex flex-col justify-between p-3 bg-sky-500/5">
                <span className="text-[10px] font-mono text-sky-300 bg-sky-950/80 px-2 py-0.5 rounded self-start">
                  Instagram Safe Area (Recommended for Text)
                </span>
                <span className="text-[10px] font-mono text-sky-300 bg-sky-950/80 px-2 py-0.5 rounded self-end">
                  Keep Clear of Buttons & Caption
                </span>
              </div>
            )}

            {/* Scene Pacing Badge */}
            <div className="mb-4 flex items-center gap-2">
              <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-black/60 text-white/90 backdrop-blur-md border border-white/20 shadow-lg flex items-center gap-1.5">
                <span 
                  className="w-2 h-2 rounded-full animate-ping"
                  style={{ backgroundColor: activeScene?.accentColor || '#ec4899' }}
                />
                Scene {currentSceneIndex + 1}/{scenes.length} • {activeScene?.pacingEffect || 'pacing'}
              </span>
            </div>

            {/* Main Kinetic Headline Text */}
            <div 
              key={activeScene?.id || currentSceneIndex}
              className={`transition-all duration-300 transform ${
                beatPulse ? 'scale-[1.03]' : 'scale-100'
              }`}
            >
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight tracking-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
                {activeScene?.hookText || reel.title}
              </h2>

              {activeScene?.secondaryText && (
                <p className="mt-3 text-sm sm:text-base font-semibold text-white/90 bg-black/40 px-3.5 py-1.5 rounded-xl backdrop-blur-sm border border-white/10 shadow-lg inline-block">
                  {activeScene.secondaryText}
                </p>
              )}
            </div>

            {/* Subtle Play Prompt when paused */}
            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md border border-white/40 flex items-center justify-center shadow-xl">
                  <Play className="w-8 h-8 text-white fill-white ml-1" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Top Header Overlays */}
        <div className="relative z-20 flex items-center justify-between px-2 pt-2">
          {/* Timeline scene segments progress bar */}
          <div className="w-full flex items-center gap-1 mb-2">
            {scenes.map((sc, idx) => {
              const isCurrent = idx === currentSceneIndex;
              const isPast = idx < currentSceneIndex;
              return (
                <div 
                  key={sc.id || idx}
                  className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden"
                >
                  <div 
                    className={`h-full bg-white transition-all duration-100 ${
                      isPast ? 'w-full' : isCurrent ? 'w-full' : 'w-0'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative z-20 flex items-center justify-between px-3 text-xs text-white/80 font-medium">
          <span className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-md">
            Reels
          </span>
          <button 
            type="button"
            onClick={toggleMute}
            className="p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-colors"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-pink-400" />}
          </button>
        </div>

        {/* Right Interaction Sidebar (Instagram Native UI) */}
        <div className="absolute right-3 bottom-20 z-20 flex flex-col items-center gap-4 text-white">
          <button 
            type="button"
            onClick={handleLike}
            className="flex flex-col items-center gap-1 group"
          >
            <div className={`p-2 rounded-full backdrop-blur-md transition-all ${
              liked ? 'bg-pink-500 text-white scale-110' : 'bg-black/40 text-white group-hover:bg-black/60'
            }`}>
              <Heart className={`w-6 h-6 ${liked ? 'fill-white' : ''}`} />
            </div>
            <span className="text-[11px] font-bold drop-shadow">
              {(likesCount / 1000).toFixed(1)}K
            </span>
          </button>

          <button 
            type="button"
            className="flex flex-col items-center gap-1 group"
          >
            <div className="p-2 rounded-full bg-black/40 text-white group-hover:bg-black/60 backdrop-blur-md">
              <MessageCircle className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-bold drop-shadow">
              {reel.commentsCount || 382}
            </span>
          </button>

          <button 
            type="button"
            onClick={handleExport}
            className="flex flex-col items-center gap-1 group"
          >
            <div className="p-2 rounded-full bg-black/40 text-white group-hover:bg-black/60 backdrop-blur-md">
              <Send className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-bold drop-shadow">
              {reel.shares || 4120}
            </span>
          </button>

          <button 
            type="button"
            onClick={() => setSaved(!saved)}
            className="flex flex-col items-center gap-1 group"
          >
            <div className={`p-2 rounded-full backdrop-blur-md transition-all ${
              saved ? 'bg-amber-500 text-white' : 'bg-black/40 text-white group-hover:bg-black/60'
            }`}>
              <Bookmark className={`w-6 h-6 ${saved ? 'fill-white' : ''}`} />
            </div>
            <span className="text-[11px] font-bold drop-shadow">Save</span>
          </button>

          {/* Rotating Vinyl Sound Disc */}
          <div className="relative mt-1">
            <div className={`w-8 h-8 rounded-full bg-slate-900 border-2 border-white/80 p-1 flex items-center justify-center shadow-lg ${
              isPlaying ? 'animate-spin' : ''
            }`} style={{ animationDuration: '3s' }}>
              <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-pink-500 to-amber-400" />
            </div>
          </div>
        </div>

        {/* Bottom Profile Info & Caption Overlay */}
        <div className="relative z-20 px-4 pb-4 text-white">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-400 via-purple-500 to-pink-500 p-[1.5px] flex items-center justify-center shadow-md shadow-purple-500/20">
              <div className="w-full h-full rounded-full bg-[#0b0f19] flex items-center justify-center">
                <span className="text-[9px] font-black tracking-tighter bg-gradient-to-tr from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  SX
                </span>
              </div>
            </div>
            <span className="text-xs font-bold tracking-tight">@SARLX.Ai</span>
            <button className="text-[10px] font-bold px-2 py-0.5 rounded-md border border-white/50 bg-white/10 backdrop-blur-md hover:bg-white/20 transition-all">
              Follow
            </button>
          </div>

          {/* Reel Caption Line */}
          <p className="text-xs text-white/95 line-clamp-2 leading-relaxed drop-shadow mb-2 font-medium">
            {reel.caption.split('\n')[0]} <span className="text-white/60 font-normal">...more</span>
          </p>

          {/* Trending Audio Pill with animated equalizer */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-md text-[11px] text-white/90 border border-white/15 w-fit max-w-[220px]">
            <Music className="w-3 h-3 text-pink-400 shrink-0" />
            <span className="truncate">{reel.audio?.title || 'Trending Audio'}</span>
            <span className="text-pink-400 text-[10px] font-bold shrink-0">{reel.audio?.bpm || 142} BPM</span>
            {isPlaying && (
              <div className="flex items-end gap-0.5 h-2.5 ml-1 shrink-0">
                <span className="w-0.5 bg-pink-400 animate-pulse h-full" />
                <span className="w-0.5 bg-pink-400 animate-pulse h-1.5" />
                <span className="w-0.5 bg-pink-400 animate-pulse h-2" />
              </div>
            )}
          </div>
        </div>

        {/* Safe-zone indicator bottom tag */}
        <div className="text-center pb-1">
          <span className="text-[9px] text-slate-500">Instagram 9:16 Vertical Live Preview</span>
        </div>
      </div>

      {/* Control & Inspection Panel Beside the Reel */}
      <div className="flex-1 max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-pink-400" />
              Algorithm & Watch-Time Diagnostic
            </h3>
            <p className="text-xs text-slate-400">Optimized for Instagram Explore & Loop Discovery</p>
          </div>
          <button
            type="button"
            onClick={() => setShowSafeZones(!showSafeZones)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 ${
              showSafeZones 
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' 
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Safe Zones
          </button>
        </div>

        {/* Retention & Hook Metrics */}
        <div className="grid grid-cols-2 gap-3 my-4">
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <span className="text-[11px] font-semibold text-slate-400 block mb-1">
              Estimated Retention
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-400">{reel.retentionEstimate || 82}%</span>
              <span className="text-[10px] text-emerald-500 font-bold">+26% vs avg</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              High replay chance due to seamless loop
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <span className="text-[11px] font-semibold text-slate-400 block mb-1">
              Hook Velocity Score
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-pink-400">{reel.hookScore || 95}/100</span>
              <span className="text-[10px] text-pink-400 font-bold">Grade A+</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Pattern interrupt triggers in 0.8s
            </span>
          </div>
        </div>

        {/* Audio Information Card */}
        <div className="p-3 rounded-xl bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-indigo-500/10 border border-pink-500/20 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-pink-500/20 text-pink-400 flex items-center justify-center">
                <Music className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">{reel.audio?.title || 'Midnight Phonk Drive'}</h4>
                <p className="text-[11px] text-slate-400">{reel.audio?.artist || 'DJ Vex'} • {reel.audio?.bpm} BPM</p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-500/20 text-pink-300 border border-pink-500/30">
              {reel.audio?.viralVelocity || '+480% trending'}
            </span>
          </div>
          <p className="text-[11px] text-slate-300 mt-2">
            🎧 Drop aligned at <strong>{reel.audio?.dropTimestamp || 2.2}s</strong>. Viewers experience the reveal exactly on beat.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5 pt-2 border-t border-slate-800">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={togglePlay}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                isPlaying 
                  ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-lg shadow-amber-500/20' 
                  : 'bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white shadow-lg shadow-pink-500/20'
              }`}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-slate-950" /> : <Play className="w-4 h-4 fill-white" />}
              {isPlaying ? 'Pause Playback' : 'Play Live Preview (With Audio)'}
            </button>

            {onSchedule && (
              <button
                type="button"
                onClick={() => onSchedule(reel)}
                className="py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-500/30 flex items-center gap-1.5 transition-all"
              >
                <Calendar className="w-4 h-4" />
                Schedule
              </button>
            )}
          </div>

          <div className="flex gap-2">
            {onSave && (
              <button
                type="button"
                onClick={() => onSave(reel)}
                className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center justify-center gap-1.5 transition-all"
              >
                <Bookmark className="w-3.5 h-3.5" />
                Save to Reel Gallery
              </button>
            )}

            <button
              type="button"
              onClick={handleExport}
              className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center justify-center gap-1.5 transition-all"
            >
              {exported ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Download className="w-3.5 h-3.5" />}
              {exported ? 'Downloaded!' : 'Export 9:16 Video'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
