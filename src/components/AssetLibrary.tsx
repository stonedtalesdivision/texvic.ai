import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  Archive, Film, Image as ImageIcon, Music2, Search, RefreshCw,
  Tag, Clock3, BarChart3, HardDrive, ChevronDown, Trash2,
  Play, Pause, Eye, X, Sparkles, ShieldCheck, CheckCircle2,
  AlertTriangle, Volume2, ArrowUpDown, UploadCloud, Plus,
  FileVideo, FileAudio, FileUp, Loader2, File
} from 'lucide-react';

type AssetType = 'video' | 'image' | 'audio';

interface MediaAsset {
  id: string;
  type: AssetType;
  filename: string;
  file_path: string;
  url: string;
  previewUrl: string;
  sizeBytes: number;
  category: string;
  tags: string[];
  duration: number | null;
  width: number | null;
  height: number | null;
  source: string;
  prompt: string | null;
  mood: string | null;
  camera: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  last_used_at: string | null;
  usage_count: number;
}

interface StorageStats {
  totalAssetCount: number;
  totalAssetBytes: number;
  videoBytes: number;
  imageBytes: number;
  audioBytes: number;
  totalReelsBytes: number;
  reelsFileCount: number;
  publishedReelsCount: number;
  totalStorageBytes: number;
}

interface AssetLibraryProps {
  onRefresh?: () => void;
}

const typeMeta: Record<AssetType, { label: string; icon: React.ElementType; classes: string; badge: string }> = {
  video: { label: 'Video', icon: Film, classes: 'text-pink-300 bg-pink-500/10 border-pink-500/20', badge: 'bg-pink-500/20 text-pink-300' },
  image: { label: 'Image', icon: ImageIcon, classes: 'text-sky-300 bg-sky-500/10 border-sky-500/20', badge: 'bg-sky-500/20 text-sky-300' },
  audio: { label: 'Audio', icon: Music2, classes: 'text-amber-300 bg-amber-500/10 border-amber-500/20', badge: 'bg-amber-500/20 text-amber-300' },
};

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const AssetLibrary: React.FC<AssetLibraryProps> = ({ onRefresh }) => {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [filterType, setFilterType] = useState<'all' | AssetType>('all');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'largest' | 'most_used'>('newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanMessage, setCleanMessage] = useState<string | null>(null);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<globalThis.File[]>([]);
  const [uploadCategory, setUploadCategory] = useState('custom-background');
  const [uploadTags, setUploadTags] = useState('background, footage');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadAssets = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/assets?limit=500');
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not load the asset library.');
      }
      setAssets(Array.isArray(data.assets) ? data.assets : []);
      onRefresh?.();
    } catch (err: any) {
      setError(err?.message || 'Could not load the asset library.');
    } finally {
      setLoading(false);
    }
  };

  const loadStorageStats = async () => {
    try {
      const res = await fetch('/api/storage/stats');
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setStorageStats(data);
      }
    } catch {}
  };

  const handleDeleteAsset = async (id: string, filename: string, sizeBytes: number) => {
    const sizeStr = formatBytes(sizeBytes);
    const confirmed = window.confirm(
      `Permanently delete "${filename}"?\n\nThis will permanently delete the file from VPS disk storage and free ${sizeStr}.`
    );
    if (!confirmed) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setAssets(prev => prev.filter(a => a.id !== id));
        if (previewAsset?.id === id) {
          setPreviewAsset(null);
        }
        await loadStorageStats();
      } else {
        alert(data.error || 'Failed to delete asset from VPS storage.');
      }
    } catch (e: any) {
      alert(e?.message || 'Failed to delete asset from VPS storage.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleRunStorageCleanup = async () => {
    setCleaning(true);
    setCleanMessage(null);
    try {
      const res = await fetch('/api/storage/clean', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        const freed = formatBytes(data.bytesFreed);
        const msg = `Cleaned ${data.reelsPruned} published reel(s). Freed ${freed} on VPS storage!`;
        setCleanMessage(msg);
        await loadAssets();
        await loadStorageStats();
        setTimeout(() => setCleanMessage(null), 6000);
      } else {
        alert(data.error || 'Failed to run storage cleanup.');
      }
    } catch (err: any) {
      alert(err?.message || 'Storage cleanup failed.');
    } finally {
      setCleaning(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...filesArray]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      setSelectedFiles(prev => [...prev, ...filesArray]);
    }
  };

  const handleRemoveSelectedFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFiles.length) {
      setUploadError('Please select at least one video, audio, or image file to upload.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(15);

    const formData = new FormData();
    selectedFiles.forEach(file => {
      formData.append('files', file);
    });
    formData.append('category', uploadCategory);
    formData.append('tags', uploadTags);

    try {
      setUploadProgress(45);
      const res = await fetch('/api/assets/upload', {
        method: 'POST',
        body: formData,
      });
      setUploadProgress(85);
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload asset to VPS.');
      }

      setUploadProgress(100);
      setCleanMessage(`Successfully uploaded ${data.count} asset(s) to VPS storage!`);
      setSelectedFiles([]);
      setShowUploadModal(false);
      await loadAssets();
      await loadStorageStats();
      setTimeout(() => setCleanMessage(null), 5000);
    } catch (err: any) {
      setUploadError(err?.message || 'Failed to upload asset to VPS.');
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    loadAssets();
    loadStorageStats();
  }, []);

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(assets.map(asset => asset.category).filter(Boolean))).sort()],
    [assets]
  );

  const filteredAssets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let result = assets.filter(asset => {
      if (filterType !== 'all' && asset.type !== filterType) return false;
      if (category !== 'all' && asset.category !== category) return false;
      if (!needle) return true;
      return [
        asset.filename,
        asset.category,
        asset.source,
        asset.prompt || '',
        asset.mood || '',
        asset.camera || '',
        ...asset.tags
      ].join(' ').toLowerCase().includes(needle);
    });

    if (sortBy === 'largest') {
      result.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));
    } else if (sortBy === 'most_used') {
      result.sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
    } else {
      result.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    }

    return result;
  }, [assets, filterType, category, query, sortBy]);

  const counts = useMemo(() => ({
    all: assets.length,
    video: assets.filter(a => a.type === 'video').length,
    image: assets.filter(a => a.type === 'image').length,
    audio: assets.filter(a => a.type === 'audio').length,
  }), [assets]);

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-6">
      {/* Top Banner: Storage Health & Auto-Retention Status */}
      <section className="relative overflow-hidden bg-gradient-to-r from-violet-950/40 via-purple-950/30 to-slate-900 border border-violet-500/20 rounded-2xl p-6 shadow-2xl backdrop-blur-md">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30 inline-flex items-center gap-1.5">
                <Archive className="w-3.5 h-3.5" />
                Media Asset & Storage Manager
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                24h Published Reel Auto-Purge Active
              </span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">VPS Storage & Media Inventory</h1>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Upload video footage and audio from your laptop directly to VPS storage to use as custom backgrounds in reels. Preview media and delete unused assets anytime to keep VPS storage lean.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-center">
            {/* Primary Action: Upload Assets to VPS */}
            <button
              type="button"
              onClick={() => { setShowUploadModal(true); setUploadError(null); }}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-600/30 flex items-center gap-2 transition-all active:scale-95"
            >
              <UploadCloud className="w-4 h-4" />
              Upload Assets to VPS
            </button>

            <button
              type="button"
              onClick={handleRunStorageCleanup}
              disabled={cleaning}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-2 disabled:opacity-50 transition-all active:scale-95"
              title="Immediately purge published reels older than 24 hours to reclaim VPS disk space"
            >
              <Sparkles className={`w-3.5 h-3.5 ${cleaning ? 'animate-spin' : ''}`} />
              {cleaning ? 'Cleaning...' : 'Clean Storage'}
            </button>
            <button
              type="button"
              onClick={() => { loadAssets(); loadStorageStats(); }}
              disabled={loading}
              className="px-3 py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 flex items-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {cleanMessage && (
          <div className="mt-4 px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span className="font-medium">{cleanMessage}</span>
          </div>
        )}

        {/* Live Storage Metrics Summary */}
        {storageStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-800/80">
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3">
              <span className="text-[11px] text-slate-400 block font-medium">Total VPS Storage Used</span>
              <strong className="text-base font-black text-white mt-0.5 block">
                {formatBytes(storageStats.totalStorageBytes)}
              </strong>
              <span className="text-[10px] text-slate-500 mt-1 block">
                {storageStats.totalAssetCount} assets · {storageStats.reelsFileCount} rendered reels
              </span>
            </div>
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3">
              <span className="text-[11px] text-pink-400 block font-medium">Video Footage Size</span>
              <strong className="text-base font-black text-white mt-0.5 block">
                {formatBytes(storageStats.videoBytes)}
              </strong>
              <span className="text-[10px] text-slate-500 mt-1 block">
                {counts.video} video files stored
              </span>
            </div>
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3">
              <span className="text-[11px] text-amber-400 block font-medium">Audio Tracks Size</span>
              <strong className="text-base font-black text-white mt-0.5 block">
                {formatBytes(storageStats.audioBytes)}
              </strong>
              <span className="text-[10px] text-slate-500 mt-1 block">
                {counts.audio} music & voice tracks
              </span>
            </div>
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3">
              <span className="text-[11px] text-emerald-400 block font-medium">Published Reels Queue</span>
              <strong className="text-base font-black text-white mt-0.5 block">
                {storageStats.publishedReelsCount} published
              </strong>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Purges automatically after 24h
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Filter Tabs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          ['all', 'All Assets', counts.all, Archive, storageStats?.totalAssetBytes || 0],
          ['video', 'Videos', counts.video, Film, storageStats?.videoBytes || 0],
          ['image', 'Images', counts.image, ImageIcon, storageStats?.imageBytes || 0],
          ['audio', 'Audio Tracks', counts.audio, Music2, storageStats?.audioBytes || 0],
        ] as const).map(([key, label, count, Icon, sizeBytes]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilterType(key as 'all' | AssetType)}
            className={`text-left p-4 rounded-xl border transition-all ${
              filterType === key
                ? 'bg-violet-500/15 border-violet-500/50 shadow-lg shadow-violet-500/10'
                : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <Icon className={`w-4 h-4 ${filterType === key ? 'text-violet-300' : 'text-slate-400'}`} />
              <span className="text-lg font-black text-white">{count}</span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs font-semibold text-slate-300">{label}</p>
              {sizeBytes > 0 && (
                <span className="text-[10px] font-mono text-slate-400">{formatBytes(sizeBytes)}</span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Search & Filter Controls */}
      <section className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row gap-3">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search assets by filename, tags, category..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white placeholder:text-slate-600 outline-none focus:border-violet-500/50"
          />
        </label>

        <div className="flex gap-2">
          <label className="relative">
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="appearance-none pr-8 pl-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 outline-none focus:border-violet-500/50 font-medium"
            >
              {categories.map(item => (
                <option key={item} value={item}>{item === 'all' ? 'All categories' : item}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          </label>

          <label className="relative">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="appearance-none pr-8 pl-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 outline-none focus:border-violet-500/50 font-medium"
            >
              <option value="newest">Sort: Newest</option>
              <option value="largest">Sort: Largest Size</option>
              <option value="most_used">Sort: Most Used</option>
            </select>
            <ArrowUpDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          </label>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredAssets.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
          <Archive className="w-8 h-8 mx-auto text-slate-600" />
          <h2 className="mt-3 text-sm font-bold text-slate-300">
            {assets.length ? 'No assets match your search filters' : 'No assets found in VPS storage'}
          </h2>
          <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
            {assets.length
              ? 'Try adjusting your search query, type filter, or category selector.'
              : 'Upload video footage or audio tracks from your laptop to get started.'}
          </p>
          <button
            type="button"
            onClick={() => { setShowUploadModal(true); setUploadError(null); }}
            className="mt-4 px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white inline-flex items-center gap-1.5 shadow"
          >
            <UploadCloud className="w-4 h-4" />
            Upload Your First Asset
          </button>
        </div>
      )}

      {/* Media Asset Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAssets.map(asset => {
          const meta = typeMeta[asset.type] || typeMeta.video;
          const Icon = meta.icon;
          const isDeleting = deletingId === asset.id;

          return (
            <article
              key={asset.id}
              className="group bg-slate-900/80 border border-slate-800 hover:border-violet-500/40 rounded-2xl p-4 transition-all flex flex-col justify-between shadow-lg hover:shadow-violet-500/5"
            >
              <div>
                {/* Media Preview Box */}
                <div className="relative w-full h-44 rounded-xl overflow-hidden bg-black/60 border border-slate-800/80 flex items-center justify-center mb-3">
                  {asset.type === 'video' ? (
                    <div className="relative w-full h-full group/video flex items-center justify-center">
                      <video
                        src={asset.url}
                        preload="metadata"
                        muted
                        playsInline
                        loop
                        onMouseEnter={(e) => {
                          const v = e.currentTarget;
                          v.play().catch(() => {});
                        }}
                        onMouseLeave={(e) => {
                          const v = e.currentTarget;
                          v.pause();
                          v.currentTime = 0;
                        }}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/30 group-hover/video:bg-transparent transition-colors flex items-center justify-center pointer-events-none">
                        <div className="p-2.5 rounded-full bg-violet-600/80 text-white shadow-lg backdrop-blur-sm group-hover/video:scale-110 transition-transform">
                          <Play className="w-4 h-4 fill-white" />
                        </div>
                      </div>
                      <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-black/80 text-slate-300">
                        {asset.duration ? `${asset.duration.toFixed(1)}s` : 'Video'}
                      </span>
                    </div>
                  ) : asset.type === 'image' ? (
                    <img
                      src={asset.url}
                      alt={asset.filename}
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-b from-amber-950/20 to-slate-900">
                      <div className="p-3 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 mb-2">
                        <Volume2 className="w-6 h-6" />
                      </div>
                      <audio controls src={asset.url} className="w-full max-w-[220px] h-8 scale-90" />
                    </div>
                  )}

                  {/* Quick Action Overlay */}
                  <button
                    type="button"
                    onClick={() => setPreviewAsset(asset)}
                    className="absolute top-2 left-2 p-1.5 rounded-lg bg-slate-900/80 hover:bg-violet-600 text-slate-300 hover:text-white transition-colors backdrop-blur-sm text-[11px] font-bold flex items-center gap-1 shadow"
                    title="Open Fullscreen Preview"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Preview
                  </button>
                </div>

                {/* Header Information */}
                <div className="flex items-start justify-between gap-2">
                  <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold inline-flex items-center gap-1.5 ${meta.classes}`}>
                    <Icon className="w-3 h-3" />
                    {meta.label}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded">
                    {formatBytes(asset.sizeBytes)}
                  </span>
                </div>

                <h3
                  className="mt-2 text-sm font-bold text-white truncate cursor-pointer hover:text-violet-300 transition-colors"
                  title={asset.filename}
                  onClick={() => setPreviewAsset(asset)}
                >
                  {asset.filename}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{asset.category} · {asset.source}</p>

                {/* Technical Specs */}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="rounded-lg bg-slate-950/60 border border-slate-800/80 p-2">
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                      <HardDrive className="w-3 h-3" /> Specs
                    </span>
                    <strong className="block text-xs text-slate-200 mt-0.5 truncate">
                      {asset.width && asset.height ? `${asset.width}×${asset.height}` : asset.duration ? `${asset.duration.toFixed(1)}s` : 'Standard'}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-slate-950/60 border border-slate-800/80 p-2">
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                      <BarChart3 className="w-3 h-3" /> Usage
                    </span>
                    <strong className="block text-xs text-slate-200 mt-0.5">
                      {asset.usage_count} {asset.usage_count === 1 ? 'reel' : 'reels'}
                    </strong>
                  </div>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1 mt-2.5">
                  {asset.tags.slice(0, 4).map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 rounded-md bg-slate-800/80 text-[10px] text-slate-400 inline-flex items-center gap-1">
                      <Tag className="w-2.5 h-2.5" />{tag}
                    </span>
                  ))}
                  {asset.tags.length > 4 && (
                    <span className="text-[10px] text-slate-600">+{asset.tags.length - 4}</span>
                  )}
                </div>
              </div>

              {/* Bottom Card Controls */}
              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-[10px] text-slate-500 flex items-center gap-1 truncate">
                  <Clock3 className="w-3 h-3 shrink-0" />
                  {new Date(asset.created_at).toLocaleDateString()}
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPreviewAsset(asset)}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors flex items-center gap-1"
                  >
                    <Eye className="w-3 h-3" />
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteAsset(asset.id, asset.filename, asset.sizeBytes)}
                    disabled={isDeleting}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors border border-transparent hover:border-red-500/20 disabled:opacity-50"
                    title={`Delete from VPS storage (frees ${formatBytes(asset.sizeBytes)})`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Upload Modal (Laptop to VPS) */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Upload Assets to VPS</h3>
                  <p className="text-xs text-slate-400">Save custom video footage or audio to use in reel backgrounds</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { if (!isUploading) setShowUploadModal(false); }}
                disabled={isUploading}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleUploadSubmit} className="p-6 space-y-4">
              {/* Drag and Drop Box */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-violet-500 bg-violet-500/10 scale-[1.01]'
                    : 'border-slate-700 hover:border-violet-500/50 bg-slate-950/40 hover:bg-slate-950/70'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  multiple
                  accept="video/*,audio/*,image/*"
                  className="hidden"
                />
                <div className="w-12 h-12 mx-auto rounded-full bg-violet-500/20 text-violet-300 flex items-center justify-center mb-3">
                  <FileUp className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-white">
                  Click to browse or drag & drop files here
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Supports MP4, MOV, WebM videos, MP3, WAV audio, and JPG, PNG images (up to 500MB)
                </p>
              </div>

              {/* Selected Files List */}
              {selectedFiles.length > 0 && (
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>Selected Files ({selectedFiles.length})</span>
                    <button
                      type="button"
                      onClick={() => setSelectedFiles([])}
                      className="text-[11px] text-red-400 hover:underline"
                    >
                      Clear all
                    </button>
                  </div>
                  {selectedFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs"
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        {file.type.startsWith('video') ? (
                          <Film className="w-4 h-4 text-pink-400 shrink-0" />
                        ) : file.type.startsWith('audio') ? (
                          <Music2 className="w-4 h-4 text-amber-400 shrink-0" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-sky-400 shrink-0" />
                        )}
                        <span className="text-slate-200 truncate font-medium">{file.name}</span>
                        <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                          ({formatBytes(file.size)})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSelectedFile(idx)}
                        className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Category Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Category & Use Case
                </label>
                <select
                  value={uploadCategory}
                  onChange={e => setUploadCategory(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white outline-none focus:border-violet-500/50"
                >
                  <option value="custom-background">⭐ Reel Background (Prioritized for Video/Audio Backgrounds)</option>
                  <option value="b-roll">B-Roll Footage</option>
                  <option value="ambient-audio">Ambient Soundtrack / Music</option>
                  <option value="general">General Asset</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Assets tagged as "Reel Background" will automatically be used as real moving backgrounds when generating reels.
                </p>
              </div>

              {/* Tags Field */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Search Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={uploadTags}
                  onChange={e => setUploadTags(e.target.value)}
                  placeholder="e.g. drone, mystery, neon, dark, cinematic"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-600 outline-none focus:border-violet-500/50"
                />
              </div>

              {/* Upload Progress Bar */}
              {isUploading && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
                      Uploading to VPS storage...
                    </span>
                    <span className="font-mono">{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-600 to-fuchsia-600 transition-all duration-300 rounded-full"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {uploadError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Modal Actions */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  disabled={isUploading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading || selectedFiles.length === 0}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-600/30 flex items-center gap-2 disabled:opacity-50 transition-all active:scale-95"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-4 h-4" />
                      Upload {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''} to VPS
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fullscreen Media Preview Modal */}
      {previewAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2 truncate">
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${typeMeta[previewAsset.type]?.classes || ''}`}>
                  {previewAsset.type.toUpperCase()}
                </span>
                <h3 className="text-sm font-bold text-white truncate">{previewAsset.filename}</h3>
                <span className="text-xs font-mono text-slate-400">({formatBytes(previewAsset.sizeBytes)})</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewAsset(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Media Content */}
            <div className="p-4 bg-black/90 flex items-center justify-center flex-1 overflow-hidden min-h-[320px]">
              {previewAsset.type === 'video' ? (
                <video
                  src={previewAsset.url}
                  controls
                  autoPlay
                  loop
                  className="max-h-[60vh] max-w-full rounded-xl object-contain shadow-2xl"
                />
              ) : previewAsset.type === 'image' ? (
                <img
                  src={previewAsset.url}
                  alt={previewAsset.filename}
                  className="max-h-[60vh] max-w-full rounded-xl object-contain shadow-2xl"
                />
              ) : (
                <div className="w-full max-w-md p-6 bg-slate-900 rounded-2xl border border-slate-800 text-center">
                  <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center mb-4">
                    <Music2 className="w-8 h-8" />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-2">{previewAsset.filename}</h4>
                  <audio controls autoPlay src={previewAsset.url} className="w-full" />
                </div>
              )}
            </div>

            {/* Modal Footer / Details & Direct VPS Deletion */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-400">
                <span>Category: <strong className="text-white">{previewAsset.category}</strong></span>
                <span>Dimensions: <strong className="text-white">{previewAsset.width && previewAsset.height ? `${previewAsset.width}×${previewAsset.height}` : '—'}</strong></span>
                <span>Used: <strong className="text-white">{previewAsset.usage_count} times</strong></span>
                <span className="font-mono text-[11px] text-slate-500 truncate max-w-xs" title={previewAsset.file_path}>
                  {previewAsset.file_path}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDeleteAsset(previewAsset.id, previewAsset.filename, previewAsset.sizeBytes)}
                  disabled={deletingId === previewAsset.id}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-red-500/15 text-red-300 hover:bg-red-500/25 border border-red-500/30 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete from VPS Storage
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewAsset(null)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
