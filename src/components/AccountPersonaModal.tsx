import React, { useState } from 'react';
import { 
  Dna, Sparkles, RefreshCw, CheckCircle2, X, Palette, MessageSquare, 
  Target, Volume2, Film, Layers, ChevronDown, ChevronUp, Save, Edit3, ArrowRight
} from 'lucide-react';
import { ManagedAccount, AccountPersona, ContentPillar } from '../types';

interface AccountPersonaModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: ManagedAccount | null;
  onUpdatePersona: (persona: AccountPersona) => Promise<void>;
  onLearnPersona: (options?: { customDescription?: string; sampleCaptions?: string[] }) => Promise<void>;
}

export const AccountPersonaModal: React.FC<AccountPersonaModalProps> = ({
  isOpen,
  onClose,
  account,
  onUpdatePersona,
  onLearnPersona
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'pillars' | 'scan'>('overview');
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [customNotes, setCustomNotes] = useState('');
  const [sampleText, setSampleText] = useState('');
  const [expandedPillar, setExpandedPillar] = useState<string | null>(null);

  // Editable fields
  const persona = account?.persona;
  const [isEditing, setIsEditing] = useState(false);
  const [editBrand, setEditBrand] = useState(persona?.brand || account?.name || 'TEXVIC.Ai');
  const [editHandle, setEditHandle] = useState(persona?.handle || account?.username || '@texvic_ai');
  const [editNiche, setEditNiche] = useState(persona?.niche || '');
  const [editAudience, setEditAudience] = useState(persona?.audience || '');
  const [editCta, setEditCta] = useState(persona?.defaultCta || '');
  const [editVoice, setEditVoice] = useState((persona?.toneOfVoice || []).join(', '));

  React.useEffect(() => {
    if (persona) {
      setEditBrand(persona.brand || account?.name || 'TEXVIC.Ai');
      setEditHandle(persona.handle || account?.username || '@texvic_ai');
      setEditNiche(persona.niche || '');
      setEditAudience(persona.audience || '');
      setEditCta(persona.defaultCta || '');
      setEditVoice((persona.toneOfVoice || []).join(', '));
    }
  }, [persona, account]);

  if (!isOpen || !account) return null;

  const handleStartScan = async () => {
    setIsScanning(true);
    try {
      const sampleCaptions = sampleText.split('\n---\n').map(s => s.trim()).filter(Boolean);
      await onLearnPersona({
        customDescription: customNotes || undefined,
        sampleCaptions: sampleCaptions.length > 0 ? sampleCaptions : undefined
      });
      setActiveTab('overview');
    } finally {
      setIsScanning(false);
    }
  };

  const handleSaveEdits = async () => {
    if (!persona) return;
    setIsSaving(true);
    try {
      const updated: AccountPersona = {
        ...persona,
        brand: editBrand.trim() || persona.brand || 'TEXVIC.Ai',
        handle: editHandle.trim() || persona.handle || '@texvic_ai',
        niche: editNiche,
        audience: editAudience,
        defaultCta: editCta,
        toneOfVoice: editVoice.split(',').map(s => s.trim()).filter(Boolean)
      };
      await onUpdatePersona(updated);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-[#0c1019] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-800/80 flex items-center justify-between bg-gradient-to-r from-purple-950/20 via-slate-900/60 to-cyan-950/20">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-cyan-500 via-purple-500 to-pink-500 p-[2px] shadow-lg shadow-purple-500/20 flex items-center justify-center">
              <div className="w-full h-full rounded-[10px] bg-[#0b0f19] flex items-center justify-center">
                <Dna className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white tracking-tight">Content DNA & Style Studio</h2>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  {account.username || '@creator'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Reverse-engineered creative persona, brand voice, and content pillars for automated generation.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('scan')}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white shadow-lg shadow-purple-500/20 flex items-center gap-1.5 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Scan / Re-Learn Style
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-3 border-b border-slate-800/60 bg-[#0a0d15] flex gap-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'overview'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            DNA Overview
          </button>
          <button
            onClick={() => setActiveTab('pillars')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'pillars'
                ? 'border-purple-400 text-purple-300 bg-purple-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Content Pillars ({persona?.contentPillars?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('scan')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'scan'
                ? 'border-pink-400 text-pink-300 bg-pink-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            AI Style Extractor
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Top Niche & Audience Card */}
              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 relative">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-cyan-400" />
                    Core Niche & Positioning
                  </span>
                  {!isEditing ? (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-2.5 py-1 rounded text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 transition-colors"
                    >
                      <Edit3 className="w-3 h-3" />
                      Tune Persona
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSaveEdits}
                        disabled={isSaving}
                        className="px-3 py-1 rounded text-[11px] font-bold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1 transition-colors"
                      >
                        <Save className="w-3 h-3" />
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button
                        onClick={() => setIsEditing(false)}
                        className="px-2 py-1 rounded text-[11px] text-slate-400 hover:text-slate-200"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {!isEditing ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-3 border-b border-slate-800/80">
                      <div>
                        <span className="text-xs text-slate-400">Brand Display Name:</span>
                        <h4 className="text-base font-bold text-white mt-0.5">{persona?.brand || account?.name || 'TEXVIC.Ai'}</h4>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400">Instagram Handle:</span>
                        <h4 className="text-base font-bold text-cyan-400 mt-0.5">{persona?.handle || account?.username || '@texvic_ai'}</h4>
                      </div>
                    </div>

                    <div>
                      <span className="text-xs text-slate-400">Target Niche:</span>
                      <h3 className="text-xl font-bold text-white mt-0.5">{persona?.niche || 'Not learned yet'}</h3>
                    </div>

                    <div>
                      <span className="text-xs text-slate-400">Target Audience Profile:</span>
                      <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                        {persona?.audience || 'Click "Scan / Re-Learn Style" to analyze past posts and extract audience profile.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">Brand Name</label>
                        <input
                          type="text"
                          value={editBrand}
                          onChange={e => setEditBrand(e.target.value)}
                          placeholder="e.g. TEXVIC.Ai"
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1">Instagram Handle</label>
                        <input
                          type="text"
                          value={editHandle}
                          onChange={e => setEditHandle(e.target.value)}
                          placeholder="e.g. @texvic_ai"
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-cyan-300 text-sm focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">Target Niche Title</label>
                      <input
                        type="text"
                        value={editNiche}
                        onChange={e => setEditNiche(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">Target Audience Profile</label>
                      <textarea
                        rows={3}
                        value={editAudience}
                        onChange={e => setEditAudience(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Grid: Tone of Voice & Visual Direction */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tone of Voice */}
                <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-3">
                  <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5" />
                    Tone of Voice
                  </span>
                  {!isEditing ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(persona?.toneOfVoice || ['Authoritative', 'Engaging', 'Direct', 'High-Utility']).map((tone, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20"
                        >
                          {tone}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Comma-separated adjectives</label>
                      <input
                        type="text"
                        value={editVoice}
                        onChange={e => setEditVoice(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
                      />
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-800/60">
                    <span className="text-[11px] text-slate-400 block mb-1">Default Call To Action:</span>
                    {!isEditing ? (
                      <p className="text-xs text-slate-300 font-mono bg-slate-950/60 p-2 rounded border border-slate-800">
                        {persona?.defaultCta || `Follow ${account.username} for daily insights`}
                      </p>
                    ) : (
                      <input
                        type="text"
                        value={editCta}
                        onChange={e => setEditCta(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
                      />
                    )}
                  </div>
                </div>

                {/* Visual Direction & Accent Palette */}
                <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-3">
                  <span className="text-[11px] font-bold text-pink-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5" />
                    Visual Aesthetics & Palette
                  </span>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {persona?.visualDirection || 'Cinematic 8K photography, studio atmospheric lighting, clean kinetic typography.'}
                  </p>

                  <div className="pt-2 border-t border-slate-800/60">
                    <span className="text-[11px] text-slate-400 block mb-2">Signature Color Palette:</span>
                    <div className="flex items-center gap-2">
                      {(persona?.accentColors || ['#38bdf8', '#818cf8', '#f43f5e']).map((hex, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-950 border border-slate-800">
                          <span className="w-3.5 h-3.5 rounded-full border border-white/20" style={{ backgroundColor: hex }} />
                          <span className="text-[10px] font-mono text-slate-300">{hex}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Status bar */}
              <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-800/40 flex items-center justify-between text-xs text-cyan-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                  <span>
                    Content DNA Active: All autonomous reels, carousels, and comments will generate in <strong>@{account.username}</strong>'s voice.
                  </span>
                </div>
                {persona?.lastLearnedAt && (
                  <span className="text-[10px] text-slate-400">
                    Learned: {new Date(persona.lastLearnedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          )}

          {activeTab === 'pillars' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  These 4-6 content pillars represent the recurring themes TEXVIC will rotate through when creating Reels & Carousels for this account.
                </p>
                <span className="text-xs font-bold text-purple-400">
                  {persona?.contentPillars?.length || 0} Learned Pillars
                </span>
              </div>

              <div className="space-y-3">
                {(persona?.contentPillars || []).map((pillar, idx) => {
                  const isExpanded = expandedPillar === pillar.id;
                  return (
                    <div
                      key={pillar.id || idx}
                      className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden transition-all"
                    >
                      <button
                        onClick={() => setExpandedPillar(isExpanded ? null : pillar.id)}
                        className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            {pillar.badge || `PILLAR 0${idx + 1}`}
                          </span>
                          <div>
                            <h4 className="text-sm font-bold text-white">{pillar.niche}</h4>
                            <p className="text-xs text-slate-400 truncate max-w-xl">{pillar.description}</p>
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="p-4 pt-0 border-t border-slate-800/60 space-y-4 bg-slate-950/40">
                          <div>
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                              Core Discussion Angles
                            </span>
                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-300">
                              {(pillar.pillars || []).map((pt, i) => (
                                <li key={i} className="flex items-start gap-1.5">
                                  <span className="text-cyan-400 font-bold">•</span>
                                  {pt}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div>
                            <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider block mb-1.5">
                              Proven 3-Second Viral Hooks
                            </span>
                            <div className="space-y-1.5">
                              {(pillar.sampleHooks || []).map((hook, i) => (
                                <div key={i} className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 italic">
                                  "{hook}"
                                </div>
                              ))}
                            </div>
                          </div>

                          {pillar.visualAesthetic && (
                            <div>
                              <span className="text-[11px] font-bold text-pink-400 uppercase tracking-wider block mb-1">
                                Visual Art Direction
                              </span>
                              <p className="text-xs text-slate-400">{pillar.visualAesthetic}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'scan' && (
            <div className="space-y-6">
              <div className="p-5 rounded-xl bg-gradient-to-r from-purple-950/30 via-slate-900 to-cyan-950/30 border border-purple-500/20 space-y-3">
                <div className="flex items-center gap-2 text-purple-300">
                  <Sparkles className="w-5 h-5 text-pink-400 animate-pulse" />
                  <h3 className="font-bold text-white text-base">Reverse-Engineer Content Style with AI</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  If this account has published posts on Instagram, TEXVIC will automatically ingest recent captions, hooks, and engagement metrics via Meta Graph API.
                </p>
                <p className="text-xs text-slate-400">
                  If this is a fresh account or you want to steer the direction, you can provide custom guidelines or paste sample captions below.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Niche Guidelines & Account Goals (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Minimalist cafe & specialty coffee roastery, dialing-in espresso, zero fluff, clean Scandinavian aesthetics"
                    value={customNotes}
                    onChange={e => setCustomNotes(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-400 placeholder:text-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Sample Posts or Reference Captions (Optional)
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Paste 1-3 captions from posts you like, separated by '---'. TEXVIC will decode their structure, vocabulary, and hooks."
                    value={sampleText}
                    onChange={e => setSampleText(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-cyan-400 placeholder:text-slate-500"
                  />
                </div>

                <button
                  onClick={handleStartScan}
                  disabled={isScanning}
                  className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-purple-600 via-pink-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white shadow-xl shadow-purple-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {isScanning ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      Analyzing Account Posts & Decoding DNA...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-cyan-200" />
                      Extract & Learn Content DNA Now
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
