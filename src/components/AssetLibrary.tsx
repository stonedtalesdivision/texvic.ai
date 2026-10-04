import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive, Film, Image as ImageIcon, Music2, Search, RefreshCw,
  Tag, Clock3, BarChart3, HardDrive, ChevronDown
} from 'lucide-react';

type AssetType = 'video' | 'image' | 'audio';

interface MediaAsset {
  id: string;
  type: AssetType;
  filename: string;
  file_path: string;
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

interface AssetLibraryProps {
  onRefresh?: () => void;
}

const typeMeta: Record<AssetType, { label: string; icon: React.ElementType; classes: string }> = {
  video: { label: 'Video', icon: Film, classes: 'text-pink-300 bg-pink-500/10 border-pink-500/20' },
  image: { label: 'Image', icon: ImageIcon, classes: 'text-sky-300 bg-sky-500/10 border-sky-500/20' },
  audio: { label: 'Audio', icon: Music2, classes: 'text-amber-300 bg-amber-500/10 border-amber-500/20' },
};

export const AssetLibrary: React.FC<AssetLibraryProps> = ({ onRefresh }) => {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [filterType, setFilterType] = useState<'all' | AssetType>('all');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    loadAssets();
  }, []);

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(assets.map(asset => asset.category).filter(Boolean))).sort()],
    [assets]
  );

  const filteredAssets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets.filter(asset => {
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
  }, [assets, filterType, category, query]);

  const counts = useMemo(() => ({
    all: assets.length,
    video: assets.filter(a => a.type === 'video').length,
    image: assets.filter(a => a.type === 'image').length,
    audio: assets.filter(a => a.type === 'audio').length,
  }), [assets]);

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-6">
      <section className="bg-gradient-to-r from-violet-500/10 via-fuchsia-500/10 to-slate-900 border border-violet-500/20 rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-violet-500/15 text-violet-300 border border-violet-500/25 inline-flex items-center gap-1.5 mb-2">
              <Archive className="w-3.5 h-3.5" />
              Media Asset Library
            </span>
            <h1 className="text-2xl font-black text-white tracking-tight">Reusable Assets</h1>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              Centralized inventory for the autonomous content engine: videos, images and audio with metadata, tags and usage history.
            </p>
          </div>
          <button
            type="button"
            onClick={loadAssets}
            disabled={loading}
            className="self-start lg:self-center px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Library
          </button>
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          ['all', 'All Assets', counts.all, Archive],
          ['video', 'Videos', counts.video, Film],
          ['image', 'Images', counts.image, ImageIcon],
          ['audio', 'Audio', counts.audio, Music2],
        ] as const).map(([key, label, count, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilterType(key as 'all' | AssetType)}
            className={`text-left p-4 rounded-xl border transition-all ${filterType === key ? 'bg-violet-500/10 border-violet-500/40' : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'}`}
          >
            <div className="flex items-center justify-between">
              <Icon className="w-4 h-4 text-violet-300" />
              <span className="text-lg font-black text-white">{count}</span>
            </div>
            <p className="text-xs font-semibold text-slate-400 mt-2">{label}</p>
          </button>
        ))}
      </div>

      <section className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search filename, tags, category, mood..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white placeholder:text-slate-600 outline-none focus:border-violet-500/50"
            />
          </label>
          <label className="relative">
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="appearance-none w-full lg:w-52 pr-9 pl-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-200 outline-none focus:border-violet-500/50"
            >
              {categories.map(item => (
                <option key={item} value={item}>{item === 'all' ? 'All categories' : item}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          </label>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && filteredAssets.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
          <Archive className="w-8 h-8 mx-auto text-slate-600" />
          <h2 className="mt-3 text-sm font-bold text-slate-300">
            {assets.length ? 'No assets match your filters' : 'No assets registered yet'}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {assets.length ? 'Try another type, category or search term.' : 'The library will populate as media is registered for the content engine.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredAssets.map(asset => {
          const meta = typeMeta[asset.type];
          const Icon = meta.icon;
          return (
            <article key={asset.id} className="bg-slate-900/80 border border-slate-800 hover:border-violet-500/30 rounded-2xl p-4 transition-all">
              <div className="flex items-start justify-between gap-3">
                <span className={`px-2 py-1 rounded-lg border text-[10px] font-bold inline-flex items-center gap-1.5 ${meta.classes}`}>
                  <Icon className="w-3 h-3" />
                  {meta.label}
                </span>
                <span className="text-[10px] font-mono text-slate-500">{asset.id}</span>
              </div>

              <h3 className="mt-3 text-sm font-bold text-white truncate" title={asset.filename}>{asset.filename}</h3>
              <p className="text-xs text-slate-500 mt-1 truncate">{asset.category} · {asset.source}</p>

              <div className="grid grid-cols-2 gap-2 mt-4">
                <div className="rounded-lg bg-slate-950/70 border border-slate-800 p-2.5">
                  <span className="text-[10px] text-slate-500 flex items-center gap-1"><HardDrive className="w-3 h-3" /> Dimensions</span>
                  <strong className="block text-xs text-slate-200 mt-1">
                    {asset.width && asset.height ? `${asset.width}×${asset.height}` : '—'}
                  </strong>
                </div>
                <div className="rounded-lg bg-slate-950/70 border border-slate-800 p-2.5">
                  <span className="text-[10px] text-slate-500 flex items-center gap-1"><BarChart3 className="w-3 h-3" /> Usage</span>
                  <strong className="block text-xs text-slate-200 mt-1">{asset.usage_count} uses</strong>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-3">
                {asset.tags.slice(0, 6).map(tag => (
                  <span key={tag} className="px-1.5 py-0.5 rounded-md bg-slate-800 text-[10px] text-slate-400 inline-flex items-center gap-1">
                    <Tag className="w-2.5 h-2.5" />{tag}
                  </span>
                ))}
                {!asset.tags.length && <span className="text-[10px] text-slate-600">No tags</span>}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500">
                <span className="flex items-center gap-1">
                  <Clock3 className="w-3 h-3" />
                  Added {new Date(asset.created_at).toLocaleDateString()}
                </span>
                <span>{asset.last_used_at ? `Last used ${new Date(asset.last_used_at).toLocaleDateString()}` : 'Never used'}</span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};
