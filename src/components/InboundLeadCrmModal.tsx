import React, { useState, useEffect } from 'react';
import { 
  Users, Mail, Download, Search, CheckCircle2, MessageSquare, 
  ExternalLink, Sparkles, Filter, X, ArrowUpRight, Copy, Check, Clock,
  Zap, Plus, Trash2, Play, RefreshCw, Link as LinkIcon
} from 'lucide-react';

export interface DmMessage {
  direction: 'inbound' | 'outbound';
  text: string;
  timestamp: string;
}

export interface DmConversation {
  id: string;
  userId: string;
  username: string;
  threadId: string | null;
  lastMessageText: string;
  lastDirection: 'inbound' | 'outbound';
  status: 'open' | 'qualified' | 'converted' | 'closed';
  leadScore: number;
  leadEmail: string | null;
  messages: DmMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface LeadMagnetTrigger {
  id: string;
  keyword: string;
  resource_name: string;
  resource_url: string;
  message_template: string;
  public_reply_template: string;
  is_active: number;
  trigger_count: number;
  created_at: string;
}

interface InboundLeadCrmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (msg: string) => void;
}

export const InboundLeadCrmModal: React.FC<InboundLeadCrmModalProps> = ({
  isOpen,
  onClose,
  onShowToast
}) => {
  const [activeTab, setActiveTab] = useState<'leads' | 'triggers'>('leads');
  const [leads, setLeads] = useState<DmConversation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [stageFilter, setStageFilter] = useState<'all' | 'qualified' | 'email_captured' | 'converted'>('all');
  const [selectedLead, setSelectedLead] = useState<DmConversation | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Trigger management states
  const [triggers, setTriggers] = useState<LeadMagnetTrigger[]>([]);
  const [loadingTriggers, setLoadingTriggers] = useState<boolean>(false);
  const [showAddTrigger, setShowAddTrigger] = useState<boolean>(false);
  const [newKeyword, setNewKeyword] = useState<string>('');
  const [newResourceName, setNewResourceName] = useState<string>('');
  const [newResourceUrl, setNewResourceUrl] = useState<string>('https://texvic.ai/blueprints');
  const [newMessageTemplate, setNewMessageTemplate] = useState<string>('');
  const [newPublicReply, setNewPublicReply] = useState<string>('');
  const [savingTrigger, setSavingTrigger] = useState<boolean>(false);

  // Simulation testbench states
  const [simComment, setSimComment] = useState<string>('Please send the CAD blueprint pack!');
  const [simUsername, setSimUsername] = useState<string>('studio_architect');
  const [simulating, setSimulating] = useState<boolean>(false);
  const [simResult, setSimResult] = useState<any | null>(null);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leads/dms');
      const data = await res.json();
      if (data.success && Array.isArray(data.leads)) {
        setLeads(data.leads);
      }
    } catch (err) {
      console.warn('Failed to load leads:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTriggers = async () => {
    setLoadingTriggers(true);
    try {
      const res = await fetch('/api/triggers/keywords');
      const data = await res.json();
      if (data.success && Array.isArray(data.triggers)) {
        setTriggers(data.triggers);
      }
    } catch (err) {
      console.warn('Failed to load triggers:', err);
    } finally {
      setLoadingTriggers(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLeads();
      fetchTriggers();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filtered leads
  const filteredLeads = leads.filter(l => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      (l.username || '').toLowerCase().includes(query) ||
      (l.leadEmail || '').toLowerCase().includes(query) ||
      (l.lastMessageText || '').toLowerCase().includes(query);

    if (!matchesSearch) return false;

    if (stageFilter === 'qualified') return (l.leadScore || 0) >= 50 || l.status === 'qualified';
    if (stageFilter === 'email_captured') return Boolean(l.leadEmail);
    if (stageFilter === 'converted') return l.status === 'converted';
    return true;
  });

  const qualifiedCount = leads.filter(l => (l.leadScore || 0) >= 50 || l.status === 'qualified').length;
  const emailsCapturedCount = leads.filter(l => Boolean(l.leadEmail)).length;
  const convertedCount = leads.filter(l => l.status === 'converted').length;

  const handleUpdateStatus = async (leadId: string, newStatus: string) => {
    try {
      const res = await fetch('/api/leads/dms/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: leadId, status: newStatus })
      });
      if (res.ok) {
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus as any } : l));
        if (selectedLead?.id === leadId) {
          setSelectedLead(prev => prev ? { ...prev, status: newStatus as any } : null);
        }
        onShowToast(`Lead stage updated to ${newStatus.toUpperCase()}`);
      }
    } catch {
      onShowToast('Failed to update lead status');
    }
  };

  const handleExportCsv = () => {
    if (!leads.length) {
      onShowToast('No leads available to export');
      return;
    }

    const headers = ['ID', 'Username', 'Status', 'Lead Score', 'Email', 'Last Direction', 'Last Message', 'Updated At'];
    const rows = leads.map(l => [
      `"${l.id}"`,
      `"${l.username}"`,
      `"${l.status}"`,
      l.leadScore || 0,
      `"${l.leadEmail || ''}"`,
      `"${l.lastDirection}"`,
      `"${(l.lastMessageText || '').replace(/"/g, '""')}"`,
      `"${l.updatedAt}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `texvic_leads_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    onShowToast(`📥 Exported ${leads.length} leads to CSV!`);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    onShowToast('📋 Copied to clipboard!');
  };

  const handleSaveTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim()) {
      onShowToast('Keyword is required');
      return;
    }
    setSavingTrigger(true);
    try {
      const res = await fetch('/api/triggers/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: newKeyword.trim().toUpperCase(),
          resource_name: newResourceName.trim() || `${newKeyword.toUpperCase()} Resource Pack`,
          resource_url: newResourceUrl.trim() || 'https://texvic.ai/blueprints',
          message_template: newMessageTemplate.trim() || `Hey there! Here is the access link to ${newResourceName || newKeyword}: ${newResourceUrl}\n\nWhat are you working on right now?`,
          public_reply_template: newPublicReply.trim() || `⚡ Sent! Check your Instagram Direct Messages for the ${newResourceName || newKeyword} download link!`
        })
      });
      const data = await res.json();
      if (data.success) {
        onShowToast(`⚡ Lead magnet trigger "${newKeyword.toUpperCase()}" saved!`);
        setShowAddTrigger(false);
        setNewKeyword('');
        setNewResourceName('');
        setNewMessageTemplate('');
        setNewPublicReply('');
        fetchTriggers();
      } else {
        onShowToast(data.error || 'Failed to save trigger');
      }
    } catch {
      onShowToast('Could not save keyword trigger');
    } finally {
      setSavingTrigger(false);
    }
  };

  const handleDeleteTrigger = async (id: string, keyword: string) => {
    try {
      const res = await fetch(`/api/triggers/keywords/${id}`, { method: 'DELETE' });
      if (res.ok) {
        onShowToast(`🗑️ Removed trigger "${keyword}"`);
        fetchTriggers();
      }
    } catch {
      onShowToast('Failed to delete trigger');
    }
  };

  const handleSimulateTrigger = async () => {
    if (!simComment.trim()) return;
    setSimulating(true);
    setSimResult(null);
    try {
      const res = await fetch('/api/triggers/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: simComment,
          username: simUsername || 'alex_designer'
        })
      });
      const data = await res.json();
      setSimResult(data);
      if (data.success && data.matched) {
        onShowToast(`🎯 Trigger "${data.trigger.keyword}" matched! DM delivered & Lead recorded.`);
        fetchLeads();
        fetchTriggers();
      } else {
        onShowToast(data.message || 'No keyword match');
      }
    } catch {
      onShowToast('Simulation failed');
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md">
      <div 
        className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl bg-[#090d16] border border-cyan-500/30 shadow-[0_25px_80px_rgba(0,0,0,0.85)] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/60 backdrop-blur-xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 via-emerald-500 to-pink-500 p-[2px] shadow-lg shadow-cyan-500/20">
              <div className="w-full h-full rounded-[14px] bg-slate-950 flex items-center justify-center">
                <Users className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <span>Inbound Lead CRM & Auto-DM Engine</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {activeTab === 'leads' ? `${leads.length} Tracked Leads` : `${triggers.length} Active Triggers`}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Turn comment keywords into instant qualifying Direct Messages and captured client leads
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab Switcher */}
            <div className="flex items-center rounded-xl bg-slate-900 border border-slate-800 p-1 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('leads')}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                  activeTab === 'leads' 
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-cyan-400" />
                <span>Leads ({leads.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('triggers')}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                  activeTab === 'triggers' 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Triggers ({triggers.length})</span>
              </button>
            </div>

            {activeTab === 'leads' && (
              <button
                type="button"
                onClick={handleExportCsv}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition-all"
                title="Download full CRM lead database as CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {activeTab === 'leads' ? (
          <>
            {/* Analytics KPI Ribbon */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-950/70 border-b border-slate-800/80">
              <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">
                  Total Inbound Leads
                </span>
                <div className="text-xl font-black text-white">{leads.length}</div>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-950/20 border border-emerald-500/20">
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 block mb-0.5">
                  High-Intent Qualified
                </span>
                <div className="text-xl font-black text-emerald-300">{qualifiedCount}</div>
              </div>
              <div className="p-3 rounded-2xl bg-cyan-950/20 border border-cyan-500/20">
                <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-400 block mb-0.5">
                  Emails Captured
                </span>
                <div className="text-xl font-black text-cyan-300">{emailsCapturedCount}</div>
              </div>
              <div className="p-3 rounded-2xl bg-purple-950/20 border border-purple-500/20">
                <span className="text-[10px] uppercase font-bold tracking-wider text-purple-400 block mb-0.5">
                  Converted / Closed
                </span>
                <div className="text-xl font-black text-purple-300">{convertedCount}</div>
              </div>
            </div>

            {/* Search & Filter Toolbar */}
            <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by username, email, or message..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center gap-1.5 self-start sm:self-auto overflow-x-auto w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setStageFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${stageFilter === 'all' ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
                >
                  All ({leads.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStageFilter('qualified')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${stageFilter === 'qualified' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
                >
                  Qualified ({qualifiedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStageFilter('email_captured')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${stageFilter === 'email_captured' ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
                >
                  Emails ({emailsCapturedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStageFilter('converted')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${stageFilter === 'converted' ? 'bg-purple-500 text-slate-950' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
                >
                  Converted ({convertedCount})
                </button>
              </div>
            </div>

            {/* Split Panel: Lead List vs Chat Detail */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-[350px]">
              {/* Leads Table */}
              <div className={`${selectedLead ? 'hidden md:block md:w-7/12' : 'w-full'} overflow-y-auto border-r border-slate-800/80`}>
                {loading ? (
                  <div className="flex items-center justify-center py-20 text-slate-400 text-xs">
                    <RefreshCw className="w-4 h-4 animate-spin text-cyan-400 mr-2" />
                    Loading inbound CRM leads...
                  </div>
                ) : filteredLeads.length === 0 ? (
                  <div className="text-center py-20 space-y-3 p-6">
                    <Users className="w-10 h-10 text-slate-600 mx-auto" />
                    <p className="text-sm font-semibold text-slate-300">No leads match your filter</p>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Switch to the <strong>Triggers</strong> tab to configure keywords like "CAD", or click "Simulate" to test the pipeline!
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/60">
                    {filteredLeads.map(lead => {
                      const isSelected = selectedLead?.id === lead.id;
                      return (
                        <div
                          key={lead.id}
                          onClick={() => setSelectedLead(lead)}
                          className={`p-4 hover:bg-slate-900/60 transition-colors cursor-pointer flex items-start justify-between gap-3 ${isSelected ? 'bg-slate-900/80 border-l-2 border-cyan-400' : ''}`}
                        >
                          <div className="space-y-1.5 min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-white truncate">
                                @{lead.username || 'unknown_user'}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                lead.status === 'converted' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' :
                                lead.status === 'qualified' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                                'bg-slate-800 text-slate-300'
                              }`}>
                                {lead.status.toUpperCase()}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                                Score {lead.leadScore}
                              </span>
                            </div>

                            <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                              {lead.lastMessageText || 'No messages recorded'}
                            </p>

                            <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1">
                              {lead.leadEmail ? (
                                <span className="flex items-center gap-1 text-cyan-300 font-mono">
                                  <Mail className="w-3 h-3 text-cyan-400" />
                                  {lead.leadEmail}
                                </span>
                              ) : (
                                <span className="text-slate-600">No email captured</span>
                              )}
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(lead.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2 shrink-0">
                            {lead.leadEmail && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(lead.leadEmail!, `email-${lead.id}`);
                                }}
                                className="p-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/20 text-[10px] flex items-center gap-1 transition-all"
                                title="Copy Email Address"
                              >
                                {copiedId === `email-${lead.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                <span>Copy</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Chat Thread Panel */}
              {selectedLead ? (
                <div className="flex-1 flex flex-col bg-slate-950/60 p-4 overflow-hidden">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-bold text-xs border border-cyan-500/30">
                        @{selectedLead.username.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-white text-xs">@{selectedLead.username}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <span>Stage:</span>
                          <select 
                            value={selectedLead.status} 
                            onChange={(e) => handleUpdateStatus(selectedLead.id, e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-200"
                          >
                            <option value="open">Open</option>
                            <option value="qualified">Qualified</option>
                            <option value="converted">Converted</option>
                            <option value="closed">Closed</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedLead(null)}
                      className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white md:hidden"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Chat Thread */}
                  <div className="flex-1 overflow-y-auto space-y-3 py-3 pr-1 text-xs">
                    {Array.isArray(selectedLead.messages) && selectedLead.messages.length > 0 ? (
                      selectedLead.messages.map((m, idx) => {
                        const isInbound = m.direction === 'inbound';
                        return (
                          <div
                            key={idx}
                            className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'}`}
                          >
                            <div
                              className={`p-3 rounded-2xl max-w-[85%] leading-relaxed ${
                                isInbound
                                  ? 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-sm'
                                  : 'bg-gradient-to-tr from-cyan-600 to-blue-600 text-white font-medium rounded-tr-sm shadow-md'
                              }`}
                            >
                              {m.text}
                            </div>
                            <span className="text-[9px] text-slate-500 mt-0.5 px-1">
                              {m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : ''}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center py-10 text-slate-500">No chat history recorded yet</div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-800">
                    <a
                      href={`https://instagram.com/direct/t/${selectedLead.threadId || ''}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-cyan-300 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Open Thread on Instagram Web</span>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="hidden md:flex flex-1 items-center justify-center p-8 text-center text-slate-500 text-xs">
                  Select a lead from the list to view the autonomous conversation transcript and lead details.
                </div>
              )}
            </div>
          </>
        ) : (
          /* TAB 2: LEAD MAGNET TRIGGERS */
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-[450px]">
            {/* Left Column: Triggers List & Add Form */}
            <div className="w-full md:w-7/12 overflow-y-auto p-4 space-y-4 border-r border-slate-800/80">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>Keyword Auto-Triggers</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    When viewers leave a comment matching any keyword, the bot replies publicly and delivers the resource via DM.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddTrigger(!showAddTrigger)}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showAddTrigger ? 'Cancel' : 'New Trigger'}</span>
                </button>
              </div>

              {/* Add Trigger Inline Form */}
              {showAddTrigger && (
                <form onSubmit={handleSaveTrigger} className="p-4 rounded-2xl bg-slate-900/90 border border-amber-500/30 space-y-3 text-xs">
                  <div className="font-bold text-white text-xs flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Create Comment-to-DM Trigger</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Trigger Keyword</label>
                      <input
                        type="text"
                        placeholder="e.g. CAD, BLUEPRINT, REVIT"
                        value={newKeyword}
                        onChange={e => setNewKeyword(e.target.value)}
                        required
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 uppercase font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Resource Name</label>
                      <input
                        type="text"
                        placeholder="e.g. AutoCAD Pro Blueprint Pack"
                        value={newResourceName}
                        onChange={e => setNewResourceName(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Download / Lead Magnet URL</label>
                    <input
                      type="url"
                      placeholder="https://texvic.ai/blueprints"
                      value={newResourceUrl}
                      onChange={e => setNewResourceUrl(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-cyan-300 placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Direct Message Delivery Template</label>
                    <textarea
                      rows={2}
                      placeholder="Hey there! Here is the direct link: https://texvic.ai/blueprints..."
                      value={newMessageTemplate}
                      onChange={e => setNewMessageTemplate(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 resize-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Public Comment Reply Text</label>
                    <input
                      type="text"
                      placeholder="Sent! Check your Instagram Direct Messages for the download link!"
                      value={newPublicReply}
                      onChange={e => setNewPublicReply(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddTrigger(false)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingTrigger}
                      className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold disabled:opacity-50"
                    >
                      {savingTrigger ? 'Saving...' : 'Save Trigger'}
                    </button>
                  </div>
                </form>
              )}

              {/* Triggers List */}
              <div className="space-y-3">
                {triggers.map(t => (
                  <div key={t.id} className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono font-black text-xs tracking-wider">
                          "{t.keyword}"
                        </span>
                        <span className="font-bold text-white text-xs">{t.resource_name}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                          {t.trigger_count || 0} Triggers
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteTrigger(t.id, t.keyword)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Delete Trigger"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-1.5 text-cyan-300 font-mono text-[11px]">
                        <LinkIcon className="w-3 h-3 text-cyan-400 shrink-0" />
                        <span className="truncate">{t.resource_url}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                        <strong className="text-slate-300">DM:</strong> {t.message_template}
                      </p>
                      <p className="text-[11px] text-emerald-400/90 italic">
                        <strong>Public Reply:</strong> "{t.public_reply_template}"
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Simulation & Testing Bench */}
            <div className="flex-1 bg-slate-950/70 p-5 overflow-y-auto space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Play className="w-4 h-4 text-cyan-400" />
                  <span>🧪 Test Simulation Bench</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Simulate a real follower commenting on your published reels to test keyword auto-reply, DM delivery, and CRM lead capture.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3 text-xs">
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Simulated Username</label>
                  <input
                    type="text"
                    value={simUsername}
                    onChange={e => setSimUsername(e.target.value)}
                    placeholder="e.g. alex_designer"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Simulated Comment Text</label>
                  <input
                    type="text"
                    value={simComment}
                    onChange={e => setSimComment(e.target.value)}
                    placeholder="e.g. Please send the CAD blueprints!"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                  />
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-500">Quick test:</span>
                    {triggers.slice(0, 4).map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSimComment(`Can you send me the ${t.keyword} file?`)}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-amber-300 font-mono"
                      >
                        {t.keyword}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSimulateTrigger}
                  disabled={simulating || !simComment.trim()}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{simulating ? 'Simulating Pipeline...' : 'Run Simulation Test'}</span>
                </button>
              </div>

              {/* Simulation Result Card */}
              {simResult && (
                <div className={`p-4 rounded-2xl border text-xs space-y-2 animate-in fade-in ${
                  simResult.matched 
                    ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-200' 
                    : 'bg-rose-950/20 border-rose-500/40 text-rose-200'
                }`}>
                  <div className="font-bold flex items-center gap-2 text-sm">
                    {simResult.matched ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Trigger Matched: "{simResult.trigger?.keyword}"</span>
                      </>
                    ) : (
                      <>
                        <X className="w-4 h-4 text-rose-400" />
                        <span>No Keyword Trigger Matched</span>
                      </>
                    )}
                  </div>

                  {simResult.matched && (
                    <div className="space-y-2 pt-1 text-[11px]">
                      <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 text-slate-300">
                        <strong className="text-cyan-400">Public Reply:</strong> {simResult.publicReply}
                      </div>
                      <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 text-slate-300">
                        <strong className="text-purple-400">Delivered DM:</strong> {simResult.dmSent}
                      </div>
                      <div className="flex items-center gap-3 text-slate-400 font-mono text-[10px]">
                        <span>CRM Status: <strong className="text-white">{simResult.crmStatus}</strong></span>
                        <span>•</span>
                        <span>Lead Score: <strong className="text-emerald-400">+{simResult.leadScore}</strong></span>
                        <span>•</span>
                        <span>Telegram: <strong className="text-cyan-400">Notified</strong></span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
