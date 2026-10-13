import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  Sparkles, 
  Globe, 
  Zap, 
  CheckCircle2, 
  Clock, 
  Play, 
  Instagram, 
  ArrowUpRight, 
  ShieldCheck, 
  RefreshCw, 
  Sliders, 
  TrendingUp, 
  Radio, 
  Flame, 
  Key, 
  Eye,
  Layers,
  Users,
  Heart,
  MessageSquare,
  Code2,
  Bookmark,
  Share2,
  Repeat
} from 'lucide-react';
import { Autonomous24x7Config, AutonomousExecutionLog, ReelItem } from '../types';

interface AutonomousEngine24x7Props {
  config: Autonomous24x7Config;
  onToggle: (enabled: boolean) => Promise<void>;
  onUpdateConfig: (params: { intervalMinutes?: number; targetNiche?: string; instagramPublishing?: any; formatPreference?: 'reels_only' | 'carousels_only' | 'balanced' }) => Promise<void>;
  onTriggerCycle: () => Promise<any>;
  onPreviewReel: (reel: ReelItem) => void;
  reels: ReelItem[];
  onNavigateToSwarm?: () => void;
}

export const AutonomousEngine24x7: React.FC<AutonomousEngine24x7Props> = ({
  config,
  onToggle,
  onUpdateConfig,
  onTriggerCycle,
  onPreviewReel,
  reels,
  onNavigateToSwarm
}) => {
  const [isRunningCycle, setIsRunningCycle] = useState(false);
  const [cycleStep, setCycleStep] = useState<number>(0);
  const [cycleStepLabel, setCycleStepLabel] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [accountId, setAccountId] = useState(config?.instagramPublishing?.instagramAccountId || '');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [tunnelStatus, setTunnelStatus] = useState<{
    activeUrl: string | null;
    isHealthy: boolean;
    isRunning: boolean;
    error: string | null;
    restartCount: number;
  } | null>(null);
  const [isRestartingTunnel, setIsRestartingTunnel] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchTunnelStatus = async () => {
      try {
        const res = await fetch('/api/tunnel/status');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setTunnelStatus(data);
        }
      } catch {}
    };

    fetchTunnelStatus();
    const interval = setInterval(fetchTunnelStatus, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleRestartTunnel = async () => {
    setIsRestartingTunnel(true);
    try {
      const res = await fetch('/api/tunnel/restart', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setTunnelStatus(data);
        setSuccessToast('Cloudflare tunnel refreshed and verified!');
        setTimeout(() => setSuccessToast(null), 3500);
      }
    } catch {
    } finally {
      setIsRestartingTunnel(false);
    }
  };

  // Countdown timer for next autonomous run
  useEffect(() => {
    const updateCountdown = () => {
      if (!config?.enabled || !config?.nextRun) {
        setTimeLeft('Paused');
        return;
      }
      const diff = new Date(config.nextRun).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('Running now...');
        return;
      }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(
        `${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`
      );
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [config?.enabled, config?.nextRun]);

  const handleManualCycle = async () => {
    setIsRunningCycle(true);
    setCycleStep(1);
    setCycleStepLabel('Researching live web for viral topics...');

    const stepTimer1 = setTimeout(() => {
      setCycleStep(2);
      setCycleStepLabel('Formulating 3-second pattern interrupt hook & angle...');
    }, 1800);

    const stepTimer2 = setTimeout(() => {
      setCycleStep(3);
      setCycleStepLabel('Generating 3-scene template & beat-matching audio...');
    }, 3800);

    const stepTimer3 = setTimeout(() => {
      setCycleStep(4);
      setCycleStepLabel('Preparing Gemini content package...');
    }, 5800);

    try {
      const res = await onTriggerCycle();
      setCycleStep(5);
      setCycleStepLabel('Gemini content package created successfully.');
      setSuccessToast(`Autonomous cycle finished! New Reel content is ready.`);
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      console.error('Autonomous cycle error:', err);
      setCycleStep(0);
      setCycleStepLabel(err?.message || 'Autonomous publication failed.');
      setSuccessToast(err?.message || 'Autonomous publication failed.');
      setTimeout(() => setSuccessToast(null), 5000);
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);
      setTimeout(() => {
        setIsRunningCycle(false);
        setCycleStep(0);
        setCycleStepLabel('');
      }, 1500);
    }
  };

  const handleSaveApiSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      await onUpdateConfig({
        instagramPublishing: {
          enabled: true,
          method: 'graph_api',
          instagramAccountId: accountId
        }
      });
      setSuccessToast('Instagram publishing configuration saved!');
      setTimeout(() => setSuccessToast(null), 3000);
      setShowApiSettings(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const intervalPresets = [
    { label: 'Every 15 Min (Fast Demo)', value: 15 },
    { label: 'Every 1 Hour (Aggressive)', value: 60 },
    { label: 'Every 3 Hours (Recommended)', value: 180 },
    { label: 'Every 6 Hours (Balanced)', value: 360 },
    { label: 'Every 12 Hours (Daily)', value: 720 }
  ];

  const nichePresets = [
    "Untold World Heists & History's Wildest Moments",
    'Forbidden Places & Hidden Geopolitics',
    'Mind-Blowing Earth Mysteries & Scientific Phenomena',
    'Secret Systems & Global Power Moves',
    'Lost Artifacts & Unsolved Enigmas'
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {successToast && (
        <div className="fixed top-20 right-6 z-50 p-4 rounded-2xl bg-emerald-950/95 border border-emerald-500/40 text-emerald-200 text-xs font-semibold shadow-2xl flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Hero 24x7 Engine Status Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider">
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config?.enabled ? 'bg-emerald-400' : 'bg-slate-500'} opacity-75`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${config?.enabled ? 'bg-emerald-500' : 'bg-slate-500'}`} />
              </span>
              {config?.enabled ? 'Autonomous 24x7 Daemon Active' : 'Daemon Paused'}
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
              Autonomous Reel & Growth Pipeline
              <Zap className="w-6 h-6 text-amber-400 fill-amber-400" />
            </h1>

            <p className="text-sm text-slate-300 leading-relaxed">
              Runs in the cloud 24/7 without manual interference: continuously researches viral topics from the web, builds 3-second pattern interrupt hooks, generates dynamic scenes with beat-matched audio, and posts directly to Instagram.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-slate-300">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/70 border border-purple-800 text-purple-200">
                <Play className="w-3.5 h-3.5 text-purple-400 fill-purple-400" />
                <span>Format:</span>
                <span className="font-bold text-white bg-purple-600/60 px-2 py-0.5 rounded-md text-[11px]">
                  REELS ONLY
                </span>
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span>Next Automated Reel in:</span>
                <span className="font-mono font-bold text-sky-300">{timeLeft}</span>
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                <span>Web Intelligence:</span>
                <span className="font-semibold text-emerald-300">Active</span>
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <Instagram className="w-3.5 h-3.5 text-pink-400" />
                <span>Destination:</span>
                <span className="font-semibold text-pink-300">Direct Instagram Feed</span>
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/70 border border-slate-800" title={tunnelStatus?.activeUrl || 'Connecting...'}>
                <Globe className={`w-3.5 h-3.5 ${tunnelStatus?.isHealthy ? 'text-cyan-400' : 'text-amber-400'}`} />
                <span>Cloudflare Tunnel:</span>
                <span className={`font-semibold ${tunnelStatus?.isHealthy ? 'text-cyan-300' : 'text-amber-300'}`}>
                  {tunnelStatus?.isHealthy ? 'Online & Self-Healing' : 'Connecting...'}
                </span>
                <button
                  type="button"
                  onClick={handleRestartTunnel}
                  disabled={isRestartingTunnel}
                  className="ml-1 p-0.5 hover:text-white text-slate-400 transition-colors"
                  title="Refresh / Reconnect Cloudflare Tunnel"
                >
                  <RefreshCw className={`w-3 h-3 ${isRestartingTunnel ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Action buttons & toggle */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
            <button
              type="button"
              onClick={handleManualCycle}
              disabled={isRunningCycle}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 text-white font-bold text-sm shadow-xl shadow-pink-500/20 flex items-center justify-center gap-2 transition-all transform active:scale-95 disabled:opacity-60"
            >
              {isRunningCycle ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Executing Pipeline...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Run Autonomous Cycle Now</span>
                </>
              )}
            </button>

            <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-950/80 border border-slate-800">
              <span className="text-xs font-semibold text-slate-300">
                {config?.enabled ? '24/7 Engine ON' : '24/7 Engine OFF'}
              </span>
              <button
                type="button"
                onClick={() => onToggle(!config?.enabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  config?.enabled ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    config?.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Live execution progress bar during active cycle */}
        {isRunningCycle && (
          <div className="mt-6 pt-5 border-t border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-pink-400 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                {cycleStepLabel}
              </span>
              <span className="font-mono text-slate-400">Step {cycleStep} of 4</span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div className={`h-1.5 rounded-full transition-all duration-300 ${cycleStep >= 1 ? 'bg-pink-500' : 'bg-slate-800'}`} />
              <div className={`h-1.5 rounded-full transition-all duration-300 ${cycleStep >= 2 ? 'bg-purple-500' : 'bg-slate-800'}`} />
              <div className={`h-1.5 rounded-full transition-all duration-300 ${cycleStep >= 3 ? 'bg-indigo-500' : 'bg-slate-800'}`} />
              <div className={`h-1.5 rounded-full transition-all duration-300 ${cycleStep >= 4 ? 'bg-emerald-500' : 'bg-slate-800'}`} />
            </div>

            <div className="grid grid-cols-4 text-[10px] text-slate-400 font-medium pt-0.5 text-center">
              <span className={cycleStep >= 1 ? 'text-pink-400 font-bold' : ''}>1. Web Research</span>
              <span className={cycleStep >= 2 ? 'text-purple-400 font-bold' : ''}>2. Hook Ideation</span>
              <span className={cycleStep >= 3 ? 'text-indigo-400 font-bold' : ''}>3. Template & Beat</span>
              <span className={cycleStep >= 4 ? 'text-emerald-400 font-bold' : ''}>4. Direct Instagram Post</span>
            </div>
          </div>
        )}
      </div>

      {/* Configuration & Controls Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Autonomous Cadence & Frequency */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5">
          <div className="flex items-center gap-2 text-white font-bold text-base">
            <Sliders className="w-5 h-5 text-sky-400" />
            <span>Posting Frequency & Cadence</span>
          </div>

          <p className="text-xs text-slate-400">
            How often the 24x7 background engine creates and directly publishes a new Reel to Instagram.
          </p>

          <div className="space-y-2">
            {intervalPresets.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => onUpdateConfig({ intervalMinutes: preset.value })}
                className={`w-full text-left px-4 py-3 rounded-2xl text-xs font-semibold flex items-center justify-between border transition-all ${
                  config?.intervalMinutes === preset.value
                    ? 'bg-sky-500/10 border-sky-500/40 text-sky-200 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                <span>{preset.label}</span>
                {config?.intervalMinutes === preset.value && (
                  <CheckCircle2 className="w-4 h-4 text-sky-400" />
                )}
              </button>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-white">
              <span className="flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5 text-pink-400 fill-pink-400" />
                Publication Format
              </span>
              <span className="px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 text-[10px] font-semibold">
                Reels Focused
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-indigo-500/10 border border-pink-500/30 space-y-1">
              <div className="flex items-center justify-between text-xs font-bold text-pink-200">
                <span>🎬 REELS ONLY (1080x1920)</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Carousels disabled. All cycles produce moving video Reels with Pixabay footage, voiceover, and audio ducking.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Engine automatically spreads posts across algorithm engagement peak windows.</span>
          </div>
        </div>

        {/* Middle Column: Research Niche & Angle */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5">
          <div className="flex items-center gap-2 text-white font-bold text-base">
            <Globe className="w-5 h-5 text-purple-400" />
            <span>Web Research & Topic Grounding</span>
          </div>

          <p className="text-xs text-slate-400">
            The autonomous crawler gathers trending debates, viral news, and algorithm patterns in this domain:
          </p>

          <div className="space-y-2">
            {nichePresets.map((niche) => (
              <button
                key={niche}
                type="button"
                onClick={() => onUpdateConfig({ targetNiche: niche })}
                className={`w-full text-left px-4 py-2.5 rounded-2xl text-xs font-semibold flex items-center justify-between border transition-all ${
                  config?.targetNiche === niche
                    ? 'bg-purple-500/10 border-purple-500/40 text-purple-200'
                    : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                <span>{niche}</span>
                {config?.targetNiche === niche && (
                  <CheckCircle2 className="w-4 h-4 text-purple-400" />
                )}
              </button>
            ))}
          </div>

          <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 space-y-1">
            <span className="font-bold text-white flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-amber-400" /> Current Focus
            </span>
            <p className="text-slate-400">{config?.targetNiche || "Untold World Heists & History's Wildest Moments"}</p>
          </div>
        </div>

        {/* Right Column: Direct Instagram Destination */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <Instagram className="w-5 h-5 text-pink-400" />
              <span>Direct Instagram Output</span>
            </div>
            <button
              type="button"
              onClick={() => setShowApiSettings(!showApiSettings)}
              className="text-[11px] text-pink-400 hover:underline flex items-center gap-1"
            >
              <Key className="w-3 h-3" />
              {showApiSettings ? 'Close API' : 'Instagram Connection'}
            </button>
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-br from-pink-500/10 to-purple-500/10 border border-pink-500/20 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-white">
              <span>Auto-Publishing Engine</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px]">
                Active 24x7
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              New reels skip gallery drafts and post directly to the Instagram explore stream, immediately generating views and impressions.
            </p>
          </div>

          {showApiSettings ? (
            <form onSubmit={handleSaveApiSettings} className="space-y-3 pt-1">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Meta Instagram Account ID
                </label>
                <input
                  type="text"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  placeholder="e.g. 17841405309211844"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-pink-500"
                />
              </div>

              <p className="text-[11px] text-slate-400">Credentials are stored server-side after OAuth. Access tokens are never shown in the browser.</p>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowApiSettings(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSettings}
                  className="px-4 py-1.5 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-bold text-xs"
                >
                  {isSavingSettings ? 'Saving...' : 'Save Meta API'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-slate-400">Publishing Mode</span>
                <span className="font-semibold text-slate-200">Instant Explore Pipeline</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-slate-400">Total Published Reels</span>
                <span className="font-bold text-pink-400">{config?.logs?.length || 0}</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-slate-400">Lead Funnel Hook</span>
                <span className="font-semibold text-emerald-400">Comment "STORY" / "DOC" / "FILE"</span>
              </div>

              {/* Cloudflare Self-Healing Tunnel Monitor */}
              <div className="p-3 rounded-2xl bg-gradient-to-br from-cyan-950/40 via-slate-950 to-slate-950 border border-cyan-500/30 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-cyan-200 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-cyan-400" />
                    Cloudflare Self-Healing Tunnel
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${tunnelStatus?.isHealthy ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
                    {tunnelStatus?.isHealthy ? '● Online & Protected' : '● Reconnecting...'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-300 bg-slate-900/90 px-2.5 py-1.5 rounded-xl border border-slate-800">
                  <span className="truncate max-w-[210px]" title={tunnelStatus?.activeUrl || ''}>
                    {tunnelStatus?.activeUrl ? tunnelStatus.activeUrl.replace(/^https?:\/\//, '') : 'Detecting tunnel...'}
                  </span>
                  <button
                    type="button"
                    onClick={handleRestartTunnel}
                    disabled={isRestartingTunnel}
                    className="shrink-0 px-2 py-0.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 font-sans text-[10px] font-bold flex items-center gap-1 transition-colors"
                    title="Force refresh Cloudflare Tunnel"
                  >
                    <RefreshCw className={`w-2.5 h-2.5 ${isRestartingTunnel ? 'animate-spin' : ''}`} />
                    {isRestartingTunnel ? 'Restarting...' : 'Restart'}
                  </button>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                  <span>Watchdog: 45s health probe</span>
                  <span>Restarts: {tunnelStatus?.restartCount || 0}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Viral Viewership & Follower Growth Engine */}
      <div className="bg-slate-900/90 border border-purple-500/30 rounded-3xl p-6 shadow-xl backdrop-blur-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Viral Viewership & Follower Growth Engine
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Active</span>
              </h2>
              <p className="text-xs text-slate-400">
                Instagram algorithmic multipliers configured to maximize Average Percentage Viewed (APV), Saves, and DM follower conversions.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Repeat className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-bold text-white">Loop Retention</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">&gt;100% APV</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Scene 3 narration audio seamlessly connects into Scene 1 opening hook, trapping viewers in an infinite watch loop.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white">Comment-to-DM</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Auto Funnel</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Auto-detects "STORY", "DOC", "FILE", "MAP" comments to deliver declassified dossiers via DM + invite direct follows.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-pink-400" />
                <span className="text-xs font-bold text-white">Saves Multiplier</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300">4x Algorithm</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Dwell pills &amp; bottom overlay reminders compel viewers to bookmark high-value cheat sheets, spiking Explore reach.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-white">Shares &amp; First Seed</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">5x Algorithm</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Auto-posts creator discussion prompt within 60s of publishing to trigger early algorithm distribution signals.
            </p>
          </div>
        </div>
      </div>

      {/* Autonomous Interaction Swarm Quick Control Panel */}
      <div className="bg-slate-900/90 border border-cyan-500/30 rounded-3xl p-6 shadow-xl backdrop-blur-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Autonomous Interaction Swarm (3 Deployed Agents)
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </h2>
              <p className="text-xs text-slate-400">
                Engages reels, likes target tech content, posts contextual comments, and delivers developer solutions.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onNavigateToSwarm && (
              <button
                type="button"
                onClick={onNavigateToSwarm}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5 transition-colors"
              >
                <span>Open Swarm Control Panel</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Heart className="w-4 h-4 text-cyan-400" />
              <div>
                <span className="text-xs font-bold text-white block">Agent Pulse</span>
                <span className="text-[10px] text-slate-400">Reels Like Hunter</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">Active</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <MessageSquare className="w-4 h-4 text-pink-400" />
              <div>
                <span className="text-xs font-bold text-white block">Agent Echo</span>
                <span className="text-[10px] text-slate-400">Viral Reel Commenter</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-500/20 text-pink-300 border border-pink-500/30">Active</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Code2 className="w-4 h-4 text-violet-400" />
              <div>
                <span className="text-xs font-bold text-white block">Agent Mentor</span>
                <span className="text-[10px] text-slate-400">Dev Code Solutions</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">Active</span>
          </div>
        </div>
      </div>

      {/* Live Autonomous Telemetry Feed */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Radio className="w-5 h-5 text-emerald-400" />
              Live 24x7 Autonomous Publishing Telemetry
            </h2>
            <p className="text-xs text-slate-400">
              Real-time chronological log of web research, viral hook ideation, and direct Instagram post dispatches.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-slate-800 text-[11px] font-semibold text-slate-300">
              {config?.logs?.length || 0} Cycles Completed
            </span>
          </div>
        </div>

        {(!config?.logs || config.logs.length === 0) ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 mx-auto flex items-center justify-center text-slate-400">
              <Bot className="w-6 h-6 text-slate-500" />
            </div>
            <h3 className="text-sm font-semibold text-slate-300">
              No autonomous cycles executed yet
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Click &quot;Run Autonomous Cycle Now&quot; above or let the 24x7 timer trigger your first automated reel publication.
            </p>
            <button
              type="button"
              onClick={handleManualCycle}
              className="mt-2 px-4 py-2 rounded-xl text-xs font-bold bg-pink-500 hover:bg-pink-600 text-white transition-colors"
            >
              Trigger First 24x7 Run
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {config.logs.map((log) => {
              const matchedReel = reels.find(r => r.id === log.reelId || r.title === log.reelTitle);
              return (
                <div
                  key={log.id}
                  className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800/90 hover:border-slate-700/80 transition-all space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Directly Published to Instagram
                      </span>
                      <span className="font-mono text-[11px] text-pink-400 font-semibold">
                        #{log.instagramPostId}
                      </span>
                    </div>

                    <span className="text-[11px] text-slate-400">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} • {new Date(log.timestamp).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Web Research Sources */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-400 flex items-center gap-1">
                      <Globe className="w-3.5 h-3.5 text-sky-400" />
                      Web Researched:
                    </span>
                    <span className="font-bold text-white">{log.topicResearched}</span>
                    <div className="flex items-center gap-1">
                      {log.webSources?.map((src, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-md bg-slate-800/80 text-[10px] text-slate-300">
                          {src}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Hook Ideation */}
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs space-y-1">
                    <div className="text-[11px] font-bold text-pink-300 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      3-Second Viral Hook Ideated:
                    </div>
                    <p className="text-slate-200 italic font-medium">
                      &quot;{log.ideaHook}&quot;
                    </p>
                  </div>

                  {/* Reel details and impact */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-4 text-xs text-slate-300">
                      <div className="flex items-center gap-1 text-emerald-400 font-bold">
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>+{log.reachGained.toLocaleString()} Reach</span>
                      </div>
                      <div className="flex items-center gap-1 text-sky-400 font-bold">
                        <Play className="w-3.5 h-3.5" />
                        <span>+{log.viewsGained.toLocaleString()} Plays</span>
                      </div>
                    </div>

                    {matchedReel && (
                      <button
                        type="button"
                        onClick={() => onPreviewReel(matchedReel)}
                        className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors self-start sm:self-auto"
                      >
                        <Eye className="w-3.5 h-3.5 text-pink-400" />
                        Watch Published Reel
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
