import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, Volume2, VolumeX, Heart, MessageCircle, Send, Bookmark, 
  Music, Eye, Share2, Sparkles, Check, Download, Calendar, Layers, ShieldCheck,
  Trash2, Loader2, CheckCircle2, ExternalLink, X, ChevronLeft, ChevronRight,
  Gauge, Copy
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

function renderSingleFocusText(
  text: string, 
  highlight?: string, 
  accentColor: string = '#fbbf24'
) {
  if (!text) return null;

  const cleanText = text.replace(/\*\*/g, '');
  const words = cleanText.split(/(\s+)/);

  const explicitTerms = new Set(
    (highlight || '')
      .toLowerCase()
      .split(/\s+/)
      .map(w => w.replace(/[^a-z0-9$%#]/gi, ''))
      .filter(w => w.length >= 2)
  );

  // Identify the single highest-impact keyword in the phrase (never highlight the whole sentence)
  let bestWordIdx = -1;
  let bestScore = -1;
  let nonSpaceIdx = 0;

  words.forEach((w) => {
    if (/^\s+$/.test(w)) return;
    const cleanWord = w.replace(/[^a-zA-Z0-9$%#]/g, '').toLowerCase();
    let score = 0;
    if (explicitTerms.has(cleanWord)) score += 50;
    if (IMPACT_WORD_REGEX.test(cleanWord)) score += 30;
    if (/^\d+/.test(cleanWord)) score += 20;
    if (cleanWord.length >= 4) score += Math.min(cleanWord.length, 10);

    if (score > bestScore) {
      bestScore = score;
      bestWordIdx = nonSpaceIdx;
    }
    nonSpaceIdx++;
  });

  nonSpaceIdx = 0;
  return words.map((w, wIdx) => {
    if (/^\s+$/.test(w)) return <span key={`sp-${wIdx}`}>{w}</span>;

    const isFocus = (nonSpaceIdx === bestWordIdx);
    nonSpaceIdx++;

    if (isFocus) {
      return (
        <mark
          key={`w-${wIdx}`}
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

    return <span key={`w-${wIdx}`}>{w}</span>;
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
  const [playbackRate, setPlaybackRate] = useState<number>(1.20);
  const [copiedShare, setCopiedShare] = useState<boolean>(false);
  const [floatingHearts, setFloatingHearts] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const clickTimerRef = useRef<number | null>(null);

  const duration = reel.duration || 8;
  const scenes = reel.scenes && reel.scenes.length > 0 ? reel.scenes : [];
  const timerRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hasGeneratedVideo = Boolean(reel.videoUrl);

  const [activeWordIndex, setActiveWordIndex] = useState<number>(0);
  const speechBoundaryActiveRef = useRef<boolean>(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Load and cache browser voices as soon as they become ready
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length > 0) {
        setAvailableVoices(v);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  // Jump directly to a specific scene
  const jumpToScene = (targetIdx: number) => {
    if (scenes.length === 0 || targetIdx < 0 || targetIdx >= scenes.length) return;
    let targetTime = 0;
    for (let i = 0; i < targetIdx; i++) {
      targetTime += scenes[i]?.durationSeconds || (duration / scenes.length);
    }
    setCurrentTime(targetTime + 0.02);
    setCurrentSceneIndex(targetIdx);
    setActiveWordIndex(0);
    if (videoRef.current) {
      videoRef.current.currentTime = targetTime;
    }
  };

  // Keyboard navigation & controls (Space, Esc, Arrows, M, L)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName;
      if (['INPUT', 'TEXTAREA'].includes(targetTag)) return;

      if (e.key === 'Escape' && onClose) {
        onClose();
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying(prev => !prev);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        jumpToScene(Math.max(0, currentSceneIndex - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        jumpToScene(Math.min(scenes.length - 1, currentSceneIndex + 1));
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setIsMuted(prev => !prev);
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        setLiked(prev => {
          const next = !prev;
          setLikesCount(c => next ? c + 1 : c - 1);
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, currentSceneIndex, scenes.length]);

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

  // Playback timer loop with dynamic rate scaling
  useEffect(() => {
    if (isPlaying) {
      if (!hasGeneratedVideo && !isMuted && reel.audio) {
        playTrendingAudioTrack(reel.audio.synthPreset, reel.audio.bpm, reel.duration);
      }

      if (hasGeneratedVideo && videoRef.current) {
        videoRef.current.playbackRate = playbackRate;
        videoRef.current.play().catch(() => {});
      }

      const baseInterval = 50;
      timerRef.current = window.setInterval(() => {
        setCurrentTime(prev => {
          const next = prev + (baseInterval / 1000) * (playbackRate / 1.20);
          if (next >= duration) {
            // Loop back seamlessly
            return 0;
          }
          return next;
        });
      }, baseInterval);
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
  }, [isPlaying, isMuted, duration, reel.audio, reel.duration, hasGeneratedVideo, playbackRate]);

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

  // Browser Speech Synthesis preview fallback with Word-Level Boundary Event Sync
  useEffect(() => {
    if (!isPlaying || isMuted || hasGeneratedVideo || typeof window === 'undefined' || !window.speechSynthesis) {
      speechBoundaryActiveRef.current = false;
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      return;
    }

    const currentScene = scenes[currentSceneIndex];
    const narration = currentScene?.voiceScript || currentScene?.voiceText || currentScene?.headline || currentScene?.hookText || currentScene?.text;
    if (narration) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(narration);
      
      // Select the best available natural/neural adult male narrator voice
      const voices = availableVoices.length > 0 ? availableVoices : (typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis.getVoices() : []);
      
      const isExplicitlyFemale = (name: string) => 
        /female|woman|girl|zira|samantha|victoria|karen|catherine|stephanie|lisa|jenny|eva|amber|susan|helena|anna|maria|serena|yuri|zoe|aria|sara|cortana|katrina|hazel|fiona|moira|veena|tessa|allison|kendra/i.test(name);
      
      const isExplicitlyMale = (name: string) =>
        /male|man|boy|david|guy|christopher|ryan|andrew|eric|daniel|oliver|arthur|george|mark|richard|james|brian|william|charon|fenrir|baritone|broadcaster/i.test(name);

      // Tier A: Neural / Natural English Male Voice
      let matureVoice = voices.find(v => 
        v.lang.startsWith('en') && 
        /neural|natural|online/i.test(v.name) && 
        isExplicitlyMale(v.name) && 
        !isExplicitlyFemale(v.name)
      );

      // Tier B: Any English Male Voice
      if (!matureVoice) {
        matureVoice = voices.find(v => 
          v.lang.startsWith('en') && 
          isExplicitlyMale(v.name) && 
          !isExplicitlyFemale(v.name)
        );
      }

      // Tier C: Any English Voice that is NOT female
      if (!matureVoice) {
        matureVoice = voices.find(v => 
          v.lang.startsWith('en') && 
          !isExplicitlyFemale(v.name)
        );
      }
      
      if (matureVoice) {
        utterance.voice = matureVoice;
      }
      utterance.rate = playbackRate || 1.20; // 1.20x default crisp, modern tempo
      utterance.pitch = 1.0; // Natural, un-warped human voice pitch

      speechBoundaryActiveRef.current = true;
      setActiveWordIndex(0);

      // Real-time word boundary sync: updates as each single word is spoken by speech synthesis
      utterance.onboundary = (event: SpeechSynthesisEvent) => {
        if (event.name === 'word') {
          const textBefore = narration.slice(0, event.charIndex);
          const wordsBefore = textBefore.trim().split(/\s+/).filter(Boolean);
          setActiveWordIndex(wordsBefore.length);
        }
      };

      utterance.onend = () => {
        speechBoundaryActiveRef.current = false;
      };

      utterance.onerror = () => {
        speechBoundaryActiveRef.current = false;
      };

      window.speechSynthesis.speak(utterance);
    }

    return () => {
      speechBoundaryActiveRef.current = false;
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isPlaying, isMuted, hasGeneratedVideo, currentSceneIndex, scenes, playbackRate, availableVoices]);

  // Continuous sync of active word index across scenes and video playback
  useEffect(() => {
    if (!isPlaying) {
      setActiveWordIndex(0);
      return;
    }

    // If browser speech synthesis is actively firing boundary events, let it drive
    if (speechBoundaryActiveRef.current && !hasGeneratedVideo) {
      return;
    }

    const currentScene = scenes[currentSceneIndex];
    const narration = currentScene?.voiceScript || currentScene?.voiceText || currentScene?.headline || currentScene?.hookText || currentScene?.text || reel.title || '';
    const words = narration.replace(/\*\*/g, '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      setActiveWordIndex(0);
      return;
    }

    let sceneStartTime = 0;
    for (let i = 0; i < currentSceneIndex; i++) {
      sceneStartTime += scenes[i]?.durationSeconds || (duration / (scenes.length || 1));
    }
    const sceneDuration = currentScene?.durationSeconds || (duration / (scenes.length || 1));
    const sceneElapsed = Math.max(0, currentTime - sceneStartTime);
    const progress = Math.min(0.999, Math.max(0, sceneElapsed / sceneDuration));
    const calculatedWordIdx = Math.floor(progress * words.length);
    setActiveWordIndex(calculatedWordIdx);
  }, [currentTime, currentSceneIndex, scenes, duration, isPlaying, hasGeneratedVideo, reel.title]);

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

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (clickTimerRef.current) {
      // Double tap / click detected: burst floating heart!
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      
      const newHeart = { id: Date.now(), x, y };
      setFloatingHearts(prev => [...prev, newHeart]);
      setTimeout(() => {
        setFloatingHearts(prev => prev.filter(h => h.id !== newHeart.id));
      }, 950);

      if (!liked) {
        setLiked(true);
        setLikesCount(c => c + 1);
      }
    } else {
      // Single tap: toggle play
      clickTimerRef.current = window.setTimeout(() => {
        clickTimerRef.current = null;
        togglePlay();
      }, 240);
    }
  };

  const handleShare = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(window.location.href);
    }
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2400);
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
            onClick={handleCanvasClick}
            className="relative z-10 w-full h-full flex flex-col items-center justify-center px-4 sm:px-6 text-center cursor-pointer select-none"
          >
            {/* Double-Tap Animated Floating Heart Burst (Instagram Style) */}
            {floatingHearts.map((heart) => (
              <div
                key={heart.id}
                className="pointer-events-none absolute z-50 flex items-center justify-center animate-ping"
                style={{
                  left: heart.x - 28,
                  top: heart.y - 28,
                  animationDuration: '0.85s',
                }}
              >
                <Heart className="w-14 h-14 fill-rose-500 text-rose-400 drop-shadow-[0_0_20px_rgba(244,63,94,0.95)]" />
              </div>
            ))}

            {/* Quick Interactive Slide Switchers (Left & Right Arrow overlays) */}
            {scenes.length > 1 && (
              <>
                {currentSceneIndex > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      jumpToScene(currentSceneIndex - 1);
                    }}
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 z-30 p-1.5 rounded-full bg-black/45 hover:bg-black/75 text-white/70 hover:text-white border border-white/20 backdrop-blur-md transition-all active:scale-90 cursor-pointer shadow-lg"
                    title="Previous Slide (←)"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}
                {currentSceneIndex < scenes.length - 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      jumpToScene(currentSceneIndex + 1);
                    }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 z-30 p-1.5 rounded-full bg-black/45 hover:bg-black/75 text-white/70 hover:text-white border border-white/20 backdrop-blur-md transition-all active:scale-90 cursor-pointer shadow-lg"
                    title="Next Slide (→)"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </>
            )}

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
            <div className="mb-3 flex items-center gap-2">
              <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-black/60 text-white/90 backdrop-blur-md border border-white/20 shadow-lg flex items-center gap-1.5">
                <span 
                  className="w-2 h-2 rounded-full animate-ping"
                  style={{ backgroundColor: activeScene?.accentColor || '#ec4899' }}
                />
                Scene {currentSceneIndex + 1}/{scenes.length} • {activeScene?.pacingEffect || 'pacing'}
              </span>
            </div>

            {!hasGeneratedVideo && (() => {
              const currentTemplate = activeScene?.visualFormat || (currentSceneIndex === 0 ? 'full-bleed-cinematic' : currentSceneIndex === 1 ? 'classified-dossier' : 'satellite-telemetry');
              const narration = activeScene?.voiceScript || activeScene?.voiceText || activeScene?.headline || activeScene?.hookText || activeScene?.text || reel.title || '';
              const narrationWords = narration.replace(/\*\*/g, '').trim().split(/\s+/).filter(Boolean);
              const phraseSize = 5;
              const phraseStart = Math.floor(Math.max(0, activeWordIndex) / phraseSize) * phraseSize;
              const visiblePhraseWords = narrationWords.slice(phraseStart, phraseStart + phraseSize);
              const accent = activeScene?.accentColor || '#fbbf24';

              const cleanSecondary = activeScene?.secondaryText && !/pause|0:0[1-9]|comment\s+[a-b]|drop\s+\[a\]/i.test(activeScene.secondaryText)
                ? activeScene.secondaryText.replace(/\*\*/g, '')
                : null;

              if (currentTemplate === 'classified-dossier' || currentSceneIndex === 1) {
                // =========================================================
                // SLIDE 2: CLASSIFIED DOSSIER FOLDER CARD BOX
                // Strictly bounded & centered inside the card box (No text overflow!)
                // =========================================================
                return (
                  <div 
                    key={`dossier-${activeScene?.id || currentSceneIndex}`}
                    className={`w-full max-w-[270px] sm:max-w-[285px] rounded-2xl bg-slate-950/92 border-2 border-amber-500/80 p-3 sm:p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.85)] backdrop-blur-xl relative flex flex-col items-center justify-between overflow-hidden transition-all duration-300 transform ${
                      beatPulse ? 'scale-[1.03] border-amber-400' : 'scale-100'
                    }`}
                  >
                    {/* Ambient glowing folder corner tint */}
                    <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-amber-500/20 blur-xl pointer-events-none" />

                    {/* Top Dossier Header / Confidential Intelligence Tag */}
                    <div className="w-full flex items-center justify-between pb-2 border-b border-white/15">
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/50">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                        <span className="text-[9px] font-mono font-black text-rose-400 tracking-wider uppercase">
                          CONFIDENTIAL // DOSSIER
                        </span>
                      </div>
                      <span className="text-[9px] font-mono font-bold text-slate-400 tracking-wider">
                        REC: 02 // ARCHIVE
                      </span>
                    </div>

                    {/* Dossier Card Core Headline - Strictly bounded into the box */}
                    <div className="w-full my-2 px-1 text-center">
                      <h2 className="text-sm sm:text-base font-black text-white leading-tight tracking-tight drop-shadow-md break-words">
                        {renderSingleFocusText(
                          activeScene?.hookText || activeScene?.headline || reel.title,
                          activeScene?.highlight,
                          accent
                        )}
                      </h2>
                    </div>

                    {/* Real-Time Spoken Karaoke Caption (Single Word Active Sync) bounded inside box */}
                    {visiblePhraseWords.length > 0 && (
                      <div className="w-full px-2 py-1.5 my-1 rounded-xl bg-black/60 border border-amber-500/30 shadow-inner">
                        <div className="text-[8px] font-mono font-bold text-amber-400/80 mb-0.5 flex items-center justify-center gap-1 uppercase tracking-widest">
                          <span className="w-1 h-1 rounded-full bg-amber-400 animate-ping" />
                          {isPlaying ? 'Narration Sync' : 'Voiceover Preview'}
                        </div>
                        <div className="text-xs sm:text-sm font-black leading-snug flex flex-wrap items-center justify-center gap-x-1">
                          {visiblePhraseWords.map((word: string, localIdx: number) => {
                            const globalIdx = phraseStart + localIdx;
                            const isCurrentWord = isPlaying ? globalIdx === activeWordIndex : localIdx === 0;

                            if (isCurrentWord) {
                              return (
                                <mark
                                  key={`spk-${globalIdx}`}
                                  className="inline-block px-1.5 py-0.5 rounded-md font-black scale-105 border shadow-lg transition-all duration-100"
                                  style={{
                                    backgroundColor: `${accent}40`,
                                    color: accent,
                                    borderColor: `${accent}cc`,
                                    textShadow: `0 0 12px ${accent}`,
                                  }}
                                >
                                  {word}
                                </mark>
                              );
                            }

                            return (
                              <span
                                key={`spk-${globalIdx}`}
                                className="inline-block text-white/90 font-bold"
                              >
                                {word}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Clean Secondary Detail inside the Dossier Box */}
                    {cleanSecondary && (
                      <div className="w-full text-center my-1 px-1">
                        <p className="text-[10px] sm:text-[11px] font-semibold text-slate-300 leading-snug break-words line-clamp-2">
                          {cleanSecondary}
                        </p>
                      </div>
                    )}

                    {/* Bottom Dossier Action Pill - Anchored cleanly inside the box */}
                    <div className="w-full mt-1.5 pt-1.5 border-t border-white/10 flex items-center justify-between">
                      <span className="text-[9px] font-mono font-bold text-amber-400/90 tracking-wider">
                        FORENSIC TIMELINE
                      </span>
                      <span className="text-[8px] font-mono text-slate-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/10">
                        AUTHENTIC RECORD
                      </span>
                    </div>
                  </div>
                );
              }

              if (currentTemplate === 'satellite-telemetry' || currentSceneIndex === 2) {
                // =========================================================
                // SLIDE 3: SATELLITE TELEMETRY RECONNAISSANCE HUD
                // =========================================================
                return (
                  <div 
                    key={`telemetry-${activeScene?.id || currentSceneIndex}`}
                    className={`w-full max-w-[270px] sm:max-w-[285px] rounded-2xl bg-slate-950/85 border border-sky-400/60 p-3 sm:p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.85)] backdrop-blur-xl relative flex flex-col items-center justify-between overflow-hidden transition-all duration-300 transform ${
                      beatPulse ? 'scale-[1.03] border-sky-300' : 'scale-100'
                    }`}
                  >
                    {/* HUD Reticle Corner Brackets */}
                    <div className="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 border-sky-400 pointer-events-none" />
                    <div className="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 border-sky-400 pointer-events-none" />
                    <div className="absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2 border-sky-400 pointer-events-none" />
                    <div className="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 border-sky-400 pointer-events-none" />

                    {/* Top Telemetry Header */}
                    <div className="w-full flex items-center justify-between pb-2 border-b border-sky-400/20">
                      <div className="flex items-center gap-1.5 text-sky-400 text-[9px] font-mono font-bold tracking-wider uppercase">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
                        [ SATELLITE RECON ]
                      </div>
                      <span className="text-[9px] font-mono text-slate-400">
                        ORBITAL LOCK
                      </span>
                    </div>

                    {/* Telemetry Core Headline */}
                    <div className="w-full my-2 px-1 text-center">
                      <h2 className="text-sm sm:text-base font-black text-white leading-tight tracking-tight drop-shadow-md break-words">
                        {renderSingleFocusText(
                          activeScene?.hookText || activeScene?.headline || reel.title,
                          activeScene?.highlight,
                          '#38bdf8'
                        )}
                      </h2>
                    </div>

                    {/* Spoken Karaoke Caption */}
                    {visiblePhraseWords.length > 0 && (
                      <div className="w-full px-2 py-1.5 my-1 rounded-xl bg-black/60 border border-sky-400/30 shadow-inner">
                        <div className="text-[8px] font-mono font-bold text-sky-400/80 mb-0.5 flex items-center justify-center gap-1 uppercase tracking-widest">
                          <span className="w-1 h-1 rounded-full bg-sky-400 animate-ping" />
                          {isPlaying ? 'Narration Sync' : 'Voiceover Preview'}
                        </div>
                        <div className="text-xs sm:text-sm font-black leading-snug flex flex-wrap items-center justify-center gap-x-1">
                          {visiblePhraseWords.map((word: string, localIdx: number) => {
                            const globalIdx = phraseStart + localIdx;
                            const isCurrentWord = isPlaying ? globalIdx === activeWordIndex : localIdx === 0;

                            if (isCurrentWord) {
                              return (
                                <mark
                                  key={`spk-${globalIdx}`}
                                  className="inline-block px-1.5 py-0.5 rounded-md font-black scale-105 border shadow-lg transition-all duration-100"
                                  style={{
                                    backgroundColor: 'rgba(56, 189, 248, 0.25)',
                                    color: '#38bdf8',
                                    borderColor: '#38bdf8',
                                    textShadow: '0 0 12px #38bdf8',
                                  }}
                                >
                                  {word}
                                </mark>
                              );
                            }

                            return (
                              <span key={`spk-${globalIdx}`} className="inline-block text-white/90 font-bold">
                                {word}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Bottom Telemetry Status */}
                    <div className="w-full mt-1.5 pt-1.5 border-t border-sky-400/20 flex items-center justify-between text-[9px] font-mono text-sky-300">
                      <span>COORDINATES VERIFIED</span>
                      <span className="text-slate-400">INTEL // ARCHIVE</span>
                    </div>
                  </div>
                );
              }

              // =========================================================
              // SLIDE 1 (or other): FULL-BLEED CINEMATIC HOOK
              // =========================================================
              return (
                <div 
                  key={activeScene?.id || currentSceneIndex}
                  className={`w-full max-w-[280px] transition-all duration-300 transform ${
                    beatPulse ? 'scale-[1.03]' : 'scale-100'
                  }`}
                >
                  {/* Clean Authoritative Headline with Single Keyword Focus Accent */}
                  <h2 className="text-xl sm:text-2xl font-black text-white leading-tight tracking-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)]">
                    {renderSingleFocusText(
                      activeScene?.hookText || activeScene?.headline || reel.title,
                      activeScene?.highlight,
                      accent
                    )}
                  </h2>

                  {/* Real-Time Spoken Karaoke Caption (Single Word Active Sync) */}
                  {visiblePhraseWords.length > 0 && (
                    <div className="mt-4 px-3.5 py-2.5 rounded-2xl bg-black/65 backdrop-blur-md border border-white/15 shadow-2xl">
                      <div className="text-[9px] font-mono font-bold text-white/50 mb-1.5 flex items-center justify-center gap-1.5 uppercase tracking-widest">
                        <span className="w-1.5 h-1.5 rounded-full animate-ping" style={{ backgroundColor: accent }} />
                        {isPlaying ? 'Narration' : 'Voiceover Preview'}
                      </div>
                      <div className="text-sm sm:text-base font-black leading-snug flex flex-wrap items-center justify-center">
                        {visiblePhraseWords.map((word: string, localIdx: number) => {
                          const globalIdx = phraseStart + localIdx;
                          const isCurrentWord = isPlaying ? globalIdx === activeWordIndex : localIdx === 0;

                          if (isCurrentWord) {
                            return (
                              <mark
                                key={`spk-${globalIdx}`}
                                className="inline-block px-2 py-0.5 mx-1 rounded-lg font-black scale-110 border shadow-xl transition-all duration-100"
                                style={{
                                  backgroundColor: `${accent}40`,
                                  color: accent,
                                  borderColor: `${accent}cc`,
                                  textShadow: `0 0 16px ${accent}`,
                                  boxShadow: `0 0 20px ${accent}66`,
                                }}
                              >
                                {word}
                              </mark>
                            );
                          }

                          return (
                            <span
                              key={`spk-${globalIdx}`}
                              className="inline-block mx-0.5 text-white/90 font-bold"
                              style={{ textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}
                            >
                              {word}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Clean Archival Secondary Detail (No Gimmicks) */}
                  {cleanSecondary && (
                    <p className="mt-3 text-xs sm:text-sm font-semibold text-slate-200/90 bg-black/50 px-3 py-1.5 rounded-xl backdrop-blur-sm border border-white/10 shadow-lg inline-block">
                      {cleanSecondary}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Subtle Play Prompt when paused */}
            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] pointer-events-none">
                <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md border border-white/40 flex items-center justify-center shadow-xl">
                  <Play className="w-8 h-8 text-white fill-white ml-1" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Top Header Overlays */}
        <div className="relative z-20 flex items-center justify-between px-2 pt-2">
          {/* Interactive timeline scene segments progress bar */}
          <div className="w-full flex items-center gap-1.5 mb-2">
            {scenes.map((sc, idx) => {
              const isCurrent = idx === currentSceneIndex;
              const isPast = idx < currentSceneIndex;
              return (
                <button
                  key={sc.id || idx}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    jumpToScene(idx);
                  }}
                  title={`Jump to Slide ${idx + 1}: ${idx === 0 ? 'Cinematic Hook' : idx === 1 ? 'Classified Dossier Box' : 'Recon Telemetry'}`}
                  className="h-2 flex-1 bg-white/25 hover:bg-white/45 rounded-full overflow-hidden transition-all duration-200 cursor-pointer group relative"
                >
                  <div 
                    className={`h-full transition-all duration-100 ${
                      isPast 
                        ? 'w-full bg-white' 
                        : isCurrent 
                        ? 'w-full bg-gradient-to-r from-pink-500 via-amber-400 to-rose-500 shadow-[0_0_8px_rgba(236,72,153,0.8)]' 
                        : 'w-0'
                    }`}
                  />
                  {isCurrent && (
                    <span className="absolute inset-0 bg-white/30 animate-pulse pointer-events-none" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative z-20 flex items-center justify-between px-3 text-xs text-white/80 font-medium">
          <div className="flex items-center gap-1.5">
            <span className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-md font-bold">
              Reels
            </span>
            {/* Speed Selector Pill */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const nextRate = playbackRate === 1.0 ? 1.2 : playbackRate === 1.2 ? 1.5 : 1.0;
                setPlaybackRate(nextRate);
              }}
              className="px-2 py-0.5 rounded-full bg-black/50 hover:bg-black/70 text-amber-300 hover:text-amber-200 border border-amber-500/30 text-[10px] font-mono font-bold backdrop-blur-md transition-all cursor-pointer flex items-center gap-1 active:scale-95"
              title="Click to toggle voice playback speed"
            >
              <Gauge className="w-3 h-3 text-amber-400" />
              <span>{playbackRate.toFixed(1)}x</span>
            </button>
          </div>
          <button 
            type="button"
            onClick={toggleMute}
            className="p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-colors cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-pink-400" />}
          </button>
        </div>

        {/* Right Interaction Sidebar (Instagram Native UI) */}
        <div className="absolute right-3 bottom-20 z-20 flex flex-col items-center gap-4 text-white">
          <button 
            type="button"
            onClick={handleLike}
            className="flex flex-col items-center gap-1 group active:scale-90 transition-transform cursor-pointer"
          >
            <div className={`p-2 rounded-full backdrop-blur-md transition-all ${
              liked ? 'bg-pink-500 text-white scale-110 shadow-lg shadow-pink-500/50' : 'bg-black/40 text-white group-hover:bg-black/60'
            }`}>
              <Heart className={`w-6 h-6 ${liked ? 'fill-white' : ''}`} />
            </div>
            <span className="text-[11px] font-bold drop-shadow">
              {(likesCount / 1000).toFixed(1)}K
            </span>
          </button>

          <button 
            type="button"
            className="flex flex-col items-center gap-1 group active:scale-90 transition-transform cursor-pointer"
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
            onClick={handleShare}
            className="flex flex-col items-center gap-1 group active:scale-90 transition-transform cursor-pointer"
            title="Share Reel (Copy Link)"
          >
            <div className={`p-2 rounded-full backdrop-blur-md transition-all ${
              copiedShare ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/50' : 'bg-black/40 text-white group-hover:bg-black/60'
            }`}>
              {copiedShare ? <Check className="w-6 h-6" /> : <Send className="w-6 h-6" />}
            </div>
            <span className="text-[11px] font-bold drop-shadow">
              {copiedShare ? 'Copied' : (reel.shares || 4120)}
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

        {/* Interactive Scene Sequence Navigator */}
        <div className="space-y-2 py-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-pink-400" />
              Interactive Reel Sequence
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              Slide {currentSceneIndex + 1} of {scenes.length}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {scenes.map((sc, idx) => {
              const isCurrent = idx === currentSceneIndex;
              const title = idx === 0 ? '01 Hook' : idx === 1 ? '02 Dossier' : '03 Telemetry';
              const subtitle = idx === 0 ? 'Cinema' : idx === 1 ? 'Archive Box' : 'HUD Scan';
              return (
                <button
                  key={`seq-btn-${idx}`}
                  type="button"
                  onClick={() => jumpToScene(idx)}
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isCurrent 
                      ? 'bg-pink-500/20 border-pink-500/50 shadow-md ring-1 ring-pink-500/30' 
                      : 'bg-slate-800/40 hover:bg-slate-800/80 border-white/5 hover:border-white/20'
                  }`}
                >
                  <span className={`text-[11px] font-bold ${isCurrent ? 'text-pink-300' : 'text-slate-300'}`}>
                    {title}
                  </span>
                  <span className="text-[9px] text-slate-400 truncate">
                    {subtitle}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Keyboard Legend */}
        <div className="px-3 py-1.5 rounded-xl bg-slate-800/40 border border-white/5 text-[10px] text-slate-400 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1">
          <span><kbd className="px-1 py-0.5 rounded bg-black/40 font-mono text-slate-300">Space</kbd> Play</span>
          <span><kbd className="px-1 py-0.5 rounded bg-black/40 font-mono text-slate-300">←/→</kbd> Slides</span>
          <span><kbd className="px-1 py-0.5 rounded bg-black/40 font-mono text-slate-300">Double-Tap</kbd> ❤️</span>
          <span><kbd className="px-1 py-0.5 rounded bg-black/40 font-mono text-slate-300">M</kbd> Mute</span>
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
