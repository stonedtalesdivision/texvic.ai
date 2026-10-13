import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, Volume2, VolumeX, Heart, MessageCircle, Send, Bookmark, 
  Music, Eye, Share2, Sparkles, Check, Download, Calendar, Layers, ShieldCheck,
  Trash2, Loader2, CheckCircle2, ExternalLink, X
} from 'lucide-react';
import { ReelItem, TrendingAudio } from '../types';
import { playTrendingAudioTrack, stopAudioTrack, setBeatListener } from '../utils/audioSynth';

interface ReelPlayerProps {
  reel: ReelItem;
  onSchedule?: (reel: ReelItem) => void;
  onSave?: (reel: ReelItem) => void;
  onPublishNow?: (reel: ReelItem) => void | Promise<void>;
  onDelete?: (reel: ReelItem) => void | Promise<void>;
  onClose?: () => void;
}

const IMPACT_WORD_REGEX = /^(lost|doomsday|secret|secrets|stolen|heist|never|banned|truth|archive|warning|found|killed|disappeared|classified|hidden|conspiracy|unsolved|trillion|billion|million|cad|autocad|rhino|revit|bim|ai|pros|pro|shortcut|shortcuts|trick|tricks|hack|hacks|mistake|mistakes|blueprint|blueprints|rule|rules|workflow|workflows|drawing|drawings|render|rendering|speed|faster|fast|free|stop|destroys|destroy|illegal|power|powerful|ultimate|cheat|code|floorplan|3d|\$\d+.*|\d+[%a-z]*|#\d+)$/i;

function renderHighlightedText(
  text: string, 
  highlight?: string, 
  accentColor: string = '#fbbf24'
) {
  if (!text) return null;

  const explicitTerms = new Set(
    (highlight || '')
      .toLowerCase()
      .split(/\s+/)
      .map(w => w.replace(/[^a-z0-9$%#]/gi, ''))
      .filter(w => w.length >= 2)
  );

  const boldChunks = text.split(/(\*\*[^*]+\*\*)/g);

  return boldChunks.map((chunk, chunkIdx) => {
    if (chunk.startsWith('**') && chunk.endsWith('**')) {
      const cleanBold = chunk.slice(2, -2);
      return (
        <mark
          key={`bold-${chunkIdx}`}
          className="inline-block px-1.5 py-0.5 mx-0.5 rounded-md font-black shadow-md border"
          style={{
            backgroundColor: `${accentColor}33`,
            color: accentColor,
            borderColor: `${accentColor}66`,
            textShadow: `0 0 12px ${accentColor}80`,
          }}
        >
          {cleanBold}
        </mark>
      );
    }

    const words = chunk.split(/(\s+)/);
    return words.map((w, wIdx) => {
      if (/^\s+$/.test(w)) return <span key={`sp-${chunkIdx}-${wIdx}`}>{w}</span>;
      const cleanWord = w.replace(/[^a-zA-Z0-9$%#]/g, '').toLowerCase();
      const isImpact = IMPACT_WORD_REGEX.test(cleanWord) || /^\d+[%a-z]*$/i.test(cleanWord);
      const isExplicit = explicitTerms.has(cleanWord);

      if (isImpact || isExplicit) {
        return (
          <mark
            key={`w-${chunkIdx}-${wIdx}`}
            className="inline-block px-1.5 py-0.5 mx-0.5 rounded-md font-black shadow-md border"
            style={{
              backgroundColor: `${accentColor}33`,
              color: accentColor,
              borderColor: `${accentColor}66`,
              textShadow: `0 0 12px ${accentColor}80`,
            }}
          >
            {w}
          </mark>
        );
      }

      return <span key={`w-${chunkIdx}-${wIdx}`}>{w}</span>;
    });
  });
}

export const ReelPlayer: React.FC<ReelPlayerProps> = ({ reel, onSchedule, onSave, onPublishNow, onDelete, onClose }) => {
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
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const duration = reel.duration || 8;
  const scenes = reel.scenes && reel.scenes.length > 0 ? reel.scenes : [];
  const timerRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hasGeneratedVideo = Boolean(reel.videoUrl);

  // Close window on Escape key
  useEffect(() => {
    if (!onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
      if (!hasGeneratedVideo && !isMuted && reel.audio) {
        playTrendingAudioTrack(reel.audio.synthPreset, reel.audio.bpm, reel.duration);
      }

      if (hasGeneratedVideo && videoRef.current) {
        videoRef.current.play().catch(() => {});
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
      if (hasGeneratedVideo && videoRef.current) {
        videoRef.current.pause();
      }
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
  }, [isPlaying, isMuted, duration, reel.audio, reel.duration, hasGeneratedVideo]);

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
      } else if (isPlaying && reel.audio && !hasGeneratedVideo) {
        playTrendingAudioTrack(reel.audio.synthPreset, reel.audio.bpm, reel.duration);
      } else if (isPlaying && hasGeneratedVideo && videoRef.current) {
        videoRef.current.muted = false;
        videoRef.current.play().catch(() => {});
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

  const handlePublishClick = async () => {
    if (!onPublishNow) return;
    setIsPublishing(true);
    try {
      await onPublishNow(reel);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDeleteClick = async () => {
    if (!onDelete) return;
    if (window.confirm(`Are you sure you want to delete Reel "${reel.title}"?`)) {
      setIsDeleting(true);
      try {
        await onDelete(reel);
      } finally {
        setIsDeleting(false);
      }
    }
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
    <div className="relative flex flex-col xl:flex-row items-center justify-center gap-5 sm:gap-6 p-3 sm:p-5 md:p-6 rounded-3xl backdrop-blur-2xl bg-slate-950/40 dark:bg-slate-950/40 bg-white/60 border border-white/10 dark:border-white/10 border-slate-200 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] transition-all duration-300">
      {/* Floating Quick Close Button in top right of player */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 sm:top-3 right-2 sm:right-3 z-30 p-1.5 sm:p-2 rounded-xl bg-slate-800/90 dark:bg-slate-800/90 bg-white/95 hover:bg-rose-500/20 text-slate-400 dark:text-slate-400 text-slate-600 hover:text-rose-500 border border-slate-200 dark:border-white/15 shadow-md cursor-pointer transition-all active:scale-95 group"
          title="Close preview (Esc)"
        >
          <X className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
        </button>
      )}

      {/* 9:16 Smartphone Reel Container (Zoomed-out proportions, OLED dark canvas preserved in Day & Night modes) */}
      <div className="preserve-dark relative w-[270px] sm:w-[310px] md:w-[325px] h-[490px] sm:h-[560px] md:h-[590px] max-w-full bg-black rounded-[36px] sm:rounded-[40px] p-2 sm:p-3 shadow-2xl shadow-purple-900/30 border-4 border-slate-700/80 select-none flex flex-col justify-between overflow-hidden ring-1 ring-white/15 shrink-0">
        
        {/* Dynamic Canvas / Animated Video Background */}
        <div 
          className={`absolute inset-0 bg-gradient-to-b ${getBackgroundStyle(activeScene?.visualTheme)} transition-all duration-700 overflow-hidden rounded-[38px]`}
        >
          {hasGeneratedVideo && (
            <video
              ref={videoRef}
              src={reel.videoUrl}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              loop
              muted={isMuted}
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
              onLoadedMetadata={(event) => {
                if (event.currentTarget.duration && !reel.duration) {
                  setCurrentTime(0);
                }
              }}
            />
          )}
          {!hasGeneratedVideo && <>
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

          </>}

          {!hasGeneratedVideo && <>
          {/* Grid ambient texture */}
          <div 
            className="absolute inset-0 opacity-[0.07] bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"
          />

          </>}

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

            {!hasGeneratedVideo && <>
            {/* Interactive Widget or Main Kinetic Headline Text */}
            <div 
              key={activeScene?.id || currentSceneIndex}
              className={`w-full max-w-[270px] transition-all duration-300 transform ${
                beatPulse ? 'scale-[1.03]' : 'scale-100'
              }`}
            >
              {activeScene?.visualFormat === 'pause-challenge' || activeScene?.interactiveWidget?.type === 'pause-challenge' ? (
                /* 0.5s Pause Challenge Banner */
                <div className="w-full bg-slate-950/90 backdrop-blur-md rounded-2xl border-2 border-rose-500 p-3 shadow-2xl text-left">
                  <div className="flex items-center justify-between text-[10px] font-bold text-rose-400 mb-1.5">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                      0.5s PAUSE CHALLENGE
                    </span>
                    <span className="bg-rose-500/20 px-1.5 py-0.5 rounded text-[9px] font-mono">
                      AT {activeScene.interactiveWidget?.pauseTarget || '0:04'}
                    </span>
                  </div>
                  <h3 className="text-xs sm:text-sm font-black text-white mb-2 leading-tight">
                    {activeScene.hookText || 'PAUSE TO READ SECRET'}
                  </h3>
                  <div className="bg-black/60 border border-yellow-500/40 rounded-xl p-2 mb-2">
                    <div className="text-[9px] font-mono text-yellow-400 font-bold mb-0.5">[ UNREDACTED RECORD ]</div>
                    <div className="text-[11px] font-mono font-black text-white break-words">
                      {activeScene.interactiveWidget?.anomalyClue || activeScene.secondaryText || 'COORDINATES: 47°09\'S 126°43\'W'}
                    </div>
                    <div className="text-[9px] text-slate-400 mt-0.5">Only 5% spot the hidden anomaly.</div>
                  </div>
                  <div className="text-[10px] font-bold text-center text-rose-300 bg-rose-500/10 py-1 rounded-lg">
                    🔍 PAUSE &amp; COMMENT WHAT YOU SPOT
                  </div>
                </div>
              ) : (
                /* Standard Kinetic Hook */
                <div>
                  <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white leading-tight tracking-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
                    {renderHighlightedText(
                      activeScene?.hookText || activeScene?.headline || reel.title,
                      activeScene?.highlight,
                      activeScene?.accentColor || '#fbbf24'
                    )}
                  </h2>
                  {activeScene?.highlight && (
                    <div className="mt-2.5 flex justify-center">
                      <span 
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl font-mono text-[10px] sm:text-xs font-black tracking-wider uppercase border shadow-lg backdrop-blur-md"
                        style={{
                          backgroundColor: `${activeScene.accentColor || '#fbbf24'}25`,
                          borderColor: `${activeScene.accentColor || '#fbbf24'}77`,
                          color: activeScene.accentColor || '#fbbf24',
                          boxShadow: `0 0 15px ${activeScene.accentColor || '#fbbf24'}35`,
                        }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full animate-ping" style={{ backgroundColor: activeScene.accentColor || '#fbbf24' }} />
                        ⚡ {activeScene.highlight.replace(/\*\*/g, '')}
                      </span>
                    </div>
                  )}
                  {activeScene?.secondaryText && (
                    <p className="mt-2.5 sm:mt-3 text-xs sm:text-sm md:text-base font-semibold text-white/90 bg-black/50 px-3 py-1.5 rounded-xl backdrop-blur-sm border border-white/10 shadow-lg inline-block">
                      {renderHighlightedText(
                        activeScene.secondaryText,
                        activeScene?.highlight,
                        activeScene?.accentColor || '#38bdf8'
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
            </>}

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
                <span className="text-[9px] font-black tracking-tighter bg-gradient-to-tr from-amber-400 via-rose-400 to-cyan-400 bg-clip-text text-transparent">
                  UA
                </span>
              </div>
            </div>
            <span className="text-xs font-bold tracking-tight">@theuntoldarch</span>
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
      <div className="flex-1 max-w-md w-full backdrop-blur-2xl bg-slate-900/85 dark:bg-slate-900/85 bg-white/95 border border-white/10 dark:border-white/10 border-slate-200 rounded-3xl p-4 sm:p-5 md:p-6 shadow-2xl space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-white/10 dark:border-white/10 border-slate-200">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white dark:text-white text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-pink-500" />
              Algorithm & Watch-Time Diagnostic
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-400 text-slate-600">
              Optimized for Instagram Explore & Loop Discovery
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSafeZones(!showSafeZones)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
                showSafeZones 
                  ? 'bg-sky-500/20 text-sky-400 dark:text-sky-300 border-sky-500/40 shadow-sm' 
                  : 'bg-slate-800/90 dark:bg-slate-800/90 bg-slate-100 text-slate-700 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Safe Zones
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-white border border-rose-500/30 transition-all flex items-center gap-1 cursor-pointer shadow-sm active:scale-95"
                title="Close preview (Esc)"
              >
                <X className="w-3.5 h-3.5" />
                <span>Close</span>
                <kbd className="hidden sm:inline-block px-1 text-[9px] font-mono rounded bg-black/10 dark:bg-white/10 text-slate-600 dark:text-slate-400">Esc</kbd>
              </button>
            )}
          </div>
        </div>

        {/* Retention & Hook Metrics */}
        <div className="grid grid-cols-2 gap-3 my-4">
          <div className="p-3.5 rounded-2xl bg-slate-800/40 backdrop-blur-md border border-white/10 transition-all duration-300 hover:border-emerald-500/30 hover:-translate-y-0.5">
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

          <div className="p-3.5 rounded-2xl bg-slate-800/40 backdrop-blur-md border border-white/10 transition-all duration-300 hover:border-pink-500/30 hover:-translate-y-0.5">
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
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-pink-500/15 via-purple-500/15 to-indigo-500/15 backdrop-blur-lg border border-pink-500/25 mb-4 shadow-sm transition-all duration-300 hover:border-pink-500/40">
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
        <div className="flex flex-col gap-2.5 pt-2 border-t border-white/10">
          {/* Prominent Publish Now Button or Published Live Badge */}
          {reel.status === 'published' ? (
            <div className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center justify-between shadow-sm">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Published Live on Instagram
              </span>
              {reel.permalink && (
                <a
                  href={reel.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-emerald-300 hover:text-white underline inline-flex items-center gap-1 transition-colors"
                >
                  View Live <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          ) : (
            onPublishNow && (
              <button
                type="button"
                disabled={isPublishing}
                onClick={handlePublishClick}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-black bg-gradient-to-r from-pink-600 via-rose-600 to-red-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-lg shadow-pink-600/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50 active:scale-[0.99] cursor-pointer"
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Publishing Reel to Instagram Live...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Publish Now to Instagram
                  </>
                )}
              </button>
            )
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={togglePlay}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
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
                className="py-2.5 px-3.5 rounded-xl text-xs font-bold bg-slate-800/90 hover:bg-slate-700 text-purple-300 border border-purple-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
                title="Schedule Reel"
              >
                <Calendar className="w-4 h-4" />
                Schedule
              </button>
            )}

            {onDelete && (
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteClick}
                className="py-2.5 px-3 rounded-xl text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                title="Delete Reel"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            )}
          </div>

          <div className="flex gap-2">
            {onSave && (
              <button
                type="button"
                onClick={() => onSave(reel)}
                className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Bookmark className="w-3.5 h-3.5" />
                Save to Reel Gallery
              </button>
            )}

            <button
              type="button"
              onClick={handleExport}
              className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold bg-slate-800 dark:bg-slate-800 bg-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              {exported ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Download className="w-3.5 h-3.5" />}
              {exported ? 'Downloaded!' : 'Export 9:16 Video'}
            </button>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-slate-800/80 dark:bg-slate-800/80 bg-slate-100 hover:bg-rose-500/15 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-300 border border-slate-300 dark:border-slate-700/80 hover:border-rose-500/40 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
            >
              <X className="w-3.5 h-3.5" />
              Close Preview Window
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-black/10 dark:bg-white/10 text-slate-600 dark:text-slate-400">Esc</kbd>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
