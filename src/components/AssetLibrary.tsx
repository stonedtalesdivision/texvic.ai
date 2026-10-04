import React, { useCallback, useEffect, useState } from 'react';
import { Film, Image as ImageIcon, Music2, RefreshCw, Plus, Sparkles, Wand2 } from 'lucide-react';

type Asset = {
  id: string;
  type: 'video' | 'image' | 'audio';
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
  usage_count: number;
  last_used_at: string | null;
};

const typeMeta = {
  video: { label: 'Video', icon: Film, cls: 'text-pink-400' },
  image: { label: 'Image', icon: ImageIcon, cls: 'text-cyan-400' },
  audio: { label: 'Audio', icon: Music2, cls: 'text-amber-400' },
};

export const AssetLibrary: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [type, setType] = useState<'all' | 'video' | 'image' | 'audio'>('all');
  const [loading, setLoading] = useState(true);
  const [sourcePath, setSourcePath] = useState('');
  const [category, setCategory] = useState('ai-tech');
  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const query = type === 'all' ? '' : `?type=${type}`;
      const res = await fetch(`/api/assets${query}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not load assets.');
      setAssets(data.assets || []);
    } catch (err: any) {
      setMessage(err?.message || 'Could not load assets.');
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  const registerAsset = async () => {
    if (!sourcePath.trim()) {
      setMessage('Enter the VPS file path of a video, image, or audio asset.');
      return;
    }
    setRegistering(true);
    setMessage(null);
    try {
      const ext = sourcePath.split('.').pop()?.toLowerCase() || '';
      const assetType = ['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(ext)
        ? 'audio'
        : ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? 'image' : 'video';
      const res = await fetch('/api/assets/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: assetType,
          sourcePath: sourcePath.trim(),
          category: category.trim() || 'ai-tech',
          source: 'vps-library',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Asset registration failed.');
      setSourcePath('');
      setMessage(`Registered ${data.asset.filename} successfully.`);
      await loadAssets();
    } catch (err: any) {
      setMessage(err?.message || 'Asset registration failed.');
    } finally {
      setRegistering(false);
    }
  };

  const videos = assets.filter(asset => asset.type === 'video');
  const totalDuration = videos.reduce((sum, asset) => sum + (asset.duration || 0), 0);

  return (
    <section className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-300 text-xs font-bold uppercase tracking-[0.2em]">
            <Sparkles className="w-4 h-4" /> Reusable Content Engine
          </div>
          <h1 className="text-2xl lg:text-3xl font-black text-white mt-2">Asset Library</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Build a reusable visual library that TEXVIC can remix into multiple Reels instead of generating every frame from scratch.
          </p>
        </div>
        <button type="button" onClick={loadAssets} className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-200 text-xs font-bold flex items-center gap-2 hover:bg-slate-800">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider">Total Assets</p>
          <p className="text-2xl font-black text-white mt-1">{assets.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider">Video Assets</p>
          <p className="text-2xl font-black text-pink-300 mt-1">{videos.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider">Visual Library</p>
          <p className="text-2xl font-black text-cyan-300 mt-1">{Math.round(totalDuration)}s</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider">Remix Ready</p>
          <p className="text-2xl font-black text-emerald-300 mt-1">{videos.length >= 3 ? 'YES' : 'BUILDING'}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 lg:p-5">
        <div className="flex items-center gap-2 mb-4">
          <Plus className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-white">Register a VPS Asset</h2>
        </div>
        <div className="grid lg:grid-cols-[1fr_180px_auto] gap-3">
          <input value={sourcePath} onChange={e => setSourcePath(e.target.value)} placeholder="/root/texvic.ai/data/media/assets-source/tech.mp4" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-cyan-500/60" />
          <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Category" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500/60" />
          <button type="button" disabled={registering} onClick={registerAsset} className="rounded-xl bg-gradient-to-r from-cyan-500/80 to-purple-500/80 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> {registering ? 'Registering…' : 'Add Asset'}
          </button>
        </div>
        {message && <p className="mt-3 text-xs text-slate-400">{message}</p>}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto">
        {(['all', 'video', 'image', 'audio'] as const).map(value => (
          <button key={value} type="button" onClick={() => setType(value)} className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap border ${type === value ? 'bg-slate-800 text-white border-slate-600' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'}`}>
            {value === 'all' ? 'All Assets' : typeMeta[value].label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-12 text-center text-sm text-slate-500">Loading asset library…</div>
      ) : assets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/70 p-12 text-center">
          <Wand2 className="w-8 h-8 mx-auto text-purple-400 mb-3" />
          <h2 className="text-base font-bold text-white">Your reusable library is empty</h2>
          <p className="text-sm text-slate-500 mt-2 max-w-lg mx-auto">
            Put a test MP4 on the VPS, then register its full path above. Once we have three test clips, we can compose the first real remix Reel.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {assets.map(asset => {
            const meta = typeMeta[asset.type];
            const Icon = meta.icon;
            return (
              <article key={asset.id} className="rounded-2xl border border-slate-800 bg-slate-950/80 overflow-hidden hover:border-slate-700 transition-colors">
                <div className="aspect-video bg-slate-900 flex items-center justify-center">
                  <Icon className={`w-9 h-9 ${meta.cls}`} />
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.cls}`}>{meta.label}</span>
                    <span className="text-[10px] text-slate-500">Used {asset.usage_count}×</span>
                  </div>
                  <h3 className="text-sm font-bold text-white truncate mt-1" title={asset.filename}>{asset.filename}</h3>
                  <p className="text-xs text-slate-500 mt-1">{asset.category}</p>
                  {asset.tags.length > 0 && <div className="flex flex-wrap gap-1 mt-3">{asset.tags.slice(0, 4).map(tag => <span key={tag} className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400">#{tag}</span>)}</div>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
