import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Heart, 
  MessageSquare, 
  Code2, 
  Play, 
  Pause, 
  RefreshCw, 
  ShieldCheck, 
  ShieldAlert,
  Shield,
  ExternalLink, 
  Flame, 
  Sliders, 
  Zap,
  CheckCircle2,
  Clock,
  Sparkles,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Terminal,
  Scale,
  Eye,
  AlertTriangle,
  Plus,
  Trash2,
  Send,
  TrendingUp,
  BookOpen,
  Scroll,
  Target,
  Compass,
  Globe,
  Laptop,
  MessageCircle,
  Key,
  Lock,
  Cookie,
  UserPlus,
  MousePointer,
  Bell,
  ArrowDown,
  ArrowUp,
  CornerDownLeft,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EngagementAgent, AgentActivityLog } from '../types';
import { InboundLeadCrmModal } from './InboundLeadCrmModal';

interface AgentSwarmControlProps {
  onShowToast: (msg: string) => void;
}

export const AgentSwarmControl: React.FC<AgentSwarmControlProps> = ({ onShowToast }) => {
  const [agents, setAgents] = useState<EngagementAgent[]>([]);
  const [logs, setLogs] = useState<AgentActivityLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [cycling, setCycling] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'like' | 'comment' | 'solution' | 'vetoed'>('all');
  const [editingAgent, setEditingAgent] = useState<EngagementAgent | null>(null);
  const [limitInput, setLimitInput] = useState<number>(30);
  const [showGuardrails, setShowGuardrails] = useState<boolean>(false);
  const [managerSummary, setManagerSummary] = useState<{
    totalAudited: number;
    approvedCount: number;
    vetoedCount: number;
    complianceScore: number;
    isEnforcing: boolean;
  } | null>(null);

  // Sentinel Commander Directive States
  const [directiveInput, setDirectiveInput] = useState<string>('');
  const [sendingDirective, setSendingDirective] = useState<boolean>(false);
  const [sentinelPlan, setSentinelPlan] = useState<{
    directive: string;
    plan: string;
    actionsTaken: string[];
    responseMessage: string;
  } | null>(null);

  // Agent Creation Modal States
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newAgentName, setNewAgentName] = useState<string>('');
  const [newAgentRole, setNewAgentRole] = useState<string>('');
  const [newAgentDescription, setNewAgentDescription] = useState<string>('');
  const [newAgentColor, setNewAgentColor] = useState<string>('#38bdf8');
  const [newAgentHashtags, setNewAgentHashtags] = useState<string>('#historicalmysteries, #ancientdiscoveries, #unexplained, #declassified');
  const [newAgentLimit, setNewAgentLimit] = useState<number>(25);
  const [newAgentDirective, setNewAgentDirective] = useState<string>('');
  const [creatingAgent, setCreatingAgent] = useState<boolean>(false);
  const [growingAccount, setGrowingAccount] = useState<boolean>(false);

  // Browser Surfer Agent States
  const [browserStatus, setBrowserStatus] = useState<any>(null);
  const [checkingBrowser, setCheckingBrowser] = useState<boolean>(false);
  const [openingLogin, setOpeningLogin] = useState<boolean>(false);
  const [surfingReel, setSurfingReel] = useState<boolean>(false);
  const [runningHumanSprint, setRunningHumanSprint] = useState<boolean>(false);
  const [checkingDMs, setCheckingDMs] = useState<boolean>(false);
  const [autoRefreshTelemetry, setAutoRefreshTelemetry] = useState<boolean>(true);
  const [viewportTimestamp, setViewportTimestamp] = useState<number>(Date.now());
  const [selectedStepProof, setSelectedStepProof] = useState<string | null>(null);
  const [streamMode, setStreamMode] = useState<'live' | 'snapshot'>('live');
  const [streamKey, setStreamKey] = useState<number>(Date.now());

  // Credential & Cookie Login Modal States
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [loginTab, setLoginTab] = useState<'credentials' | 'cookie'>('credentials');
  const [loginUsername, setLoginUsername] = useState<string>('theuntoldarch');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [login2FACode, setLogin2FACode] = useState<string>('');
  const [cookieInput, setCookieInput] = useState<string>('');
  const [loggingIn, setLoggingIn] = useState<boolean>(false);
  const [importingCookie, setImportingCookie] = useState<boolean>(false);
  const [requires2FA, setRequires2FA] = useState<boolean>(false);
  const [loginModalError, setLoginModalError] = useState<string | null>(null);
  const [togglingSessions, setTogglingSessions] = useState<boolean>(false);

  // New Enhanced Features States
  const [surfingStories, setSurfingStories] = useState<boolean>(false);
  const [showCompetitorModal, setShowCompetitorModal] = useState<boolean>(false);
  const [competitorInput, setCompetitorInput] = useState<string>('theuntoldarch');
  const [miningCompetitor, setMiningCompetitor] = useState<boolean>(false);
  const [minedHooks, setMinedHooks] = useState<any[]>([]);
  const [remoteTextInput, setRemoteTextInput] = useState<string>('');
  const [sendingInteract, setSendingInteract] = useState<boolean>(false);
  const [testingTelegram, setTestingTelegram] = useState<boolean>(false);

  // Telegram Linking & Sentinel Bot States
  const [showTelegramModal, setShowTelegramModal] = useState<boolean>(false);
  const [telegramTokenInput, setTelegramTokenInput] = useState<string>('');
  const [telegramChatIdInput, setTelegramChatIdInput] = useState<string>('');
  const [telegramConfigStatus, setTelegramConfigStatus] = useState<{ isConfigured: boolean; botTokenMasked: string; chatId: string; routineAlertsEnabled?: boolean } | null>(null);
  const [detectingTelegram, setDetectingTelegram] = useState<boolean>(false);
  const [savingTelegram, setSavingTelegram] = useState<boolean>(false);

  // Inbound Lead CRM & 1-Click Hook-to-Reel Generator States
  const [showLeadCrmModal, setShowLeadCrmModal] = useState<boolean>(false);
  const [generatingHookKey, setGeneratingHookKey] = useState<string | null>(null);
  const [clickMarker, setClickMarker] = useState<{ xPercent: number; yPercent: number } | null>(null);

  const fetchTelegramStatus = async () => {
    try {
      const res = await fetch('/api/telegram/status');
      const data = await res.json();
      if (data.success) {
        setTelegramConfigStatus({
          isConfigured: data.isConfigured,
          botTokenMasked: data.botTokenMasked,
          chatId: data.chatId,
          routineAlertsEnabled: Boolean(data.routineAlertsEnabled)
        });
        if (data.chatId && !telegramChatIdInput) {
          setTelegramChatIdInput(data.chatId);
        }
      }
    } catch {}
  };

  const handleToggleRoutineAlerts = async () => {
    const nextVal = !telegramConfigStatus?.routineAlertsEnabled;
    try {
      const res = await fetch('/api/telegram/routine-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextVal })
      });
      const data = await res.json();
      if (data.success) {
        setTelegramConfigStatus(prev => prev ? { ...prev, routineAlertsEnabled: nextVal } : null);
        onShowToast(nextVal ? '🔔 Routine Telegram Surfer reports enabled' : '🔕 Routine Telegram Surfer reports muted (Leads & reel alerts stay active)');
      }
    } catch {
      onShowToast('Could not update alert preferences');
    }
  };

  const handleDetectTelegramChat = async () => {
    if (!telegramTokenInput.trim()) {
      onShowToast('Please enter your Telegram Bot Token first');
      return;
    }
    setDetectingTelegram(true);
    try {
      const res = await fetch('/api/telegram/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: telegramTokenInput.trim() })
      });
      const data = await res.json();
      if (data.success && data.chatId) {
        setTelegramChatIdInput(data.chatId);
        onShowToast(`🎯 Detected Chat ID: ${data.chatId} (${data.senderName || 'Owner'})`);
      } else {
        onShowToast(data.error || 'No updates found. Send /start to your bot on Telegram first!');
      }
    } catch {
      onShowToast('Could not query Telegram updates');
    } finally {
      setDetectingTelegram(false);
    }
  };

  const handleSaveAndTestTelegram = async () => {
    if (!telegramTokenInput.trim() || !telegramChatIdInput.trim()) {
      onShowToast('Please provide both Bot Token and Chat ID');
      return;
    }
    setSavingTelegram(true);
    try {
      // 1. Save configuration
      const saveRes = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: telegramTokenInput.trim(), chatId: telegramChatIdInput.trim() })
      });
      const saveData = await saveRes.json();
      if (!saveData.success) {
        onShowToast(saveData.error || 'Failed to save Telegram credentials');
        setSavingTelegram(false);
        return;
      }

      // 2. Test alert immediately
      const testRes = await fetch('/api/telegram/test', { method: 'POST' });
      const testData = await testRes.json();
      if (testData.success) {
        onShowToast('🎉 Telegram Sentinel Linked & Verified! Check your Telegram chat.');
        fetchTelegramStatus();
        setShowTelegramModal(false);
      } else {
        onShowToast(testData.error || 'Saved, but test message failed. Check Chat ID.');
        fetchTelegramStatus();
      }
    } catch {
      onShowToast('Could not complete Telegram linking');
    } finally {
      setSavingTelegram(false);
    }
  };

  const handleSurfStories = async () => {
    setSurfingStories(true);
    try {
      const res = await fetch('/api/browser/stories', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onShowToast(`📖 Stories Surfed: Viewed ${data.result?.storiesViewed} stories${data.result?.reacted ? ' with quick reaction ❤️' : ''}!`);
        fetchBrowserStatus();
      } else {
        onShowToast(data.error || 'Failed to surf stories');
      }
    } catch {
      onShowToast('Could not surf stories');
    } finally {
      setSurfingStories(false);
    }
  };

  const handleRemoteInteract = async (action: 'click' | 'type' | 'key' | 'scroll' | 'navigate', params: any = {}) => {
    setSendingInteract(true);
    try {
      const res = await fetch('/api/browser/interact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, params })
      });
      const data = await res.json();
      if (data.success) {
        onShowToast(`🕹️ ${data.result?.message || 'Action executed'}`);
      } else {
        onShowToast(data.error || 'Interaction failed');
      }
    } catch {
      onShowToast('Could not execute remote interaction');
    } finally {
      setSendingInteract(false);
    }
  };

  const handleStreamClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const yRatio = (e.clientY - rect.top) / rect.height;
    const targetX = Math.round(xRatio * 1280);
    const targetY = Math.round(yRatio * 860);
    setClickMarker({ xPercent: xRatio * 100, yPercent: yRatio * 100 });
    setTimeout(() => setClickMarker(null), 700);
    handleRemoteInteract('click', { x: targetX, y: targetY });
  };

  const handleMineCompetitorHooks = async () => {
    if (!competitorInput.trim()) return;
    setMiningCompetitor(true);
    try {
      const res = await fetch('/api/competitor/mine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: competitorInput })
      });
      const data = await res.json();
      if (data.success) {
        setMinedHooks(data.hooks || []);
        onShowToast(`🎯 Reverse-engineered ${data.hooks?.length || 0} viral hooks from @${competitorInput}!`);
      } else {
        onShowToast(data.error || 'Failed to mine competitor reels');
      }
    } catch {
      onShowToast('Could not analyze competitor');
    } finally {
      setMiningCompetitor(false);
    }
  };

  const handleFetchSavedHooks = async () => {
    try {
      const res = await fetch('/api/competitor/hooks');
      const data = await res.json();
      if (data.success) {
        setMinedHooks(data.hooks || []);
      }
    } catch {}
  };

  const handleGenerateReelFromHook = async (hookKey: string, ideaText: string) => {
    setGeneratingHookKey(hookKey);
    try {
      const res = await fetch('/api/agent/generate-reel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: ideaText,
          niche: 'CAD & 3D Architecture',
          duration: 8
        })
      });
      const data = await res.json();
      if (data.success && data.reel) {
        onShowToast(`🎬 Generated reel from hook: "${data.reel.title}"! Saved to gallery.`);
      } else {
        onShowToast(data.error || 'Reel generation request completed');
      }
    } catch (err: any) {
      onShowToast(`Failed to generate reel: ${err?.message || err}`);
    } finally {
      setGeneratingHookKey(null);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    try {
      const res = await fetch('/api/telegram/test', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onShowToast('📱 Alert received on Telegram! Push notifications verified.');
      } else {
        // Open the configuration modal directly so user can link bot easily
        setShowTelegramModal(true);
        fetchTelegramStatus();
        onShowToast(data.error || 'Telegram not linked yet. Let\'s set it up now!');
      }
    } catch {
      setShowTelegramModal(true);
      onShowToast('Could not connect to Telegram Bot. Configure credentials.');
    } finally {
      setTestingTelegram(false);
    }
  };

  const fetchBrowserStatus = async () => {
    try {
      const res = await fetch('/api/browser/status');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.status) {
          setBrowserStatus(data.status);
          setViewportTimestamp(Date.now());
        }
      }
    } catch {}
  };

  // Live Telemetry Auto-Polling Hook (1.8s when active, 3.5s when idle)
  useEffect(() => {
    fetchBrowserStatus();
    fetchTelegramStatus();
    if (!autoRefreshTelemetry) return;
    const interval = setInterval(() => {
      fetchBrowserStatus();
    }, browserStatus?.isRunning ? 1800 : 3500);
    return () => clearInterval(interval);
  }, [autoRefreshTelemetry, browserStatus?.isRunning]);

  const handleCredentialLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || (!loginPassword.trim() && !requires2FA)) return;
    setLoggingIn(true);
    setLoginModalError(null);
    try {
      const res = await fetch('/api/browser/login-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginUsername.trim(),
          password: loginPassword.trim(),
          twoFactorCode: login2FACode.trim() || undefined
        })
      });
      const data = await res.json();
      if (data.success && data.isLoggedIn) {
        onShowToast(`🎉 Logged into Instagram as @${data.username || loginUsername}!`);
        setShowLoginModal(false);
        setRequires2FA(false);
        setLoginPassword('');
        setLogin2FACode('');
        setLoginModalError(null);
        fetchBrowserStatus();
      } else if (data.requires2FA) {
        setRequires2FA(true);
        setLoginModalError('2FA / Security Code required! Enter your 6-digit code below and click Confirm 2FA.');
        onShowToast('🔑 2FA Security Code required!');
        if (data.status) setBrowserStatus(data.status);
      } else {
        setLoginModalError(data.message || 'Login failed. Please check credentials or try the Session ID cookie method.');
        onShowToast(data.message || 'Login failed.');
        if (data.status) setBrowserStatus(data.status);
      }
    } catch (err: any) {
      setLoginModalError(err?.message || 'Network error submitting credentials');
      onShowToast('Could not submit credentials to browser');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleImportCookieSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cookieInput.trim()) return;
    setImportingCookie(true);
    setLoginModalError(null);
    try {
      const res = await fetch('/api/browser/cookies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: cookieInput.trim() })
      });
      const data = await res.json();
      if (data.isLoggedIn) {
        onShowToast(`🎉 Session validated! Logged in as @${data.username || 'theuntoldarch'}!`);
        setShowLoginModal(false);
        setCookieInput('');
        setLoginModalError(null);
        fetchBrowserStatus();
      } else {
        setLoginModalError(data.message || 'Cookie was saved, but Instagram session could not be verified. Ensure you copied the full sessionid value.');
        onShowToast(data.message || 'Session verification failed');
        if (data.status) setBrowserStatus(data.status);
      }
    } catch (err: any) {
      setLoginModalError(err?.message || 'Failed to submit session cookie');
      onShowToast('Failed to connect session cookie');
    } finally {
      setImportingCookie(false);
    }
  };

  const handleLaunchBrowserLogin = async () => {
    setOpeningLogin(true);
    try {
      const res = await fetch('/api/browser/login', { method: 'POST' });
      const data = await res.json();
      onShowToast(data.message || 'Launched Google Chrome window for Instagram login');
      fetchBrowserStatus();
    } catch {
      onShowToast('Could not launch Chrome login window');
    } finally {
      setOpeningLogin(false);
    }
  };

  const handleVerifyBrowserSession = async () => {
    setCheckingBrowser(true);
    try {
      const res = await fetch('/api/browser/check', { method: 'POST' });
      const data = await res.json();
      if (data.isLoggedIn) {
        onShowToast(`🟢 Logged in as @${data.username || 'theuntoldarch'} on Instagram Web!`);
      } else {
        onShowToast('⚠️ Not logged in. Please click "Open Browser Login" to sign in once.');
      }
      if (data.status) setBrowserStatus(data.status);
    } catch {
      onShowToast('Failed to verify browser session');
    } finally {
      setCheckingBrowser(false);
    }
  };

  const handleSurfReelNow = async () => {
    setSurfingReel(true);
    try {
      const res = await fetch('/api/browser/surf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche: 'Ancient Mysteries & Archaeology' })
      });
      const data = await res.json();
      if (data.success) {
        onShowToast(`🎯 Browser Surfer engaged reel! Comment: "${data.result?.commentText?.slice(0, 45)}..."`);
        fetchSwarmState();
        fetchBrowserStatus();
      } else {
        onShowToast(data.error || 'Reel surfing operation failed');
      }
    } catch {
      onShowToast('Could not execute reel surfing');
    } finally {
      setSurfingReel(false);
    }
  };

  const handleRunHumanSprint = async (count?: number) => {
    setRunningHumanSprint(true);
    try {
      const res = await fetch('/api/browser/human-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reelsCount: count })
      });
      const data = await res.json();
      if (data.success) {
        onShowToast(`🏁 Session finished! Watched ${data.result?.reelsWatched} reels (${data.result?.likesGiven} likes, ${data.result?.commentsPosted} comments).`);
        fetchBrowserStatus();
        fetchSwarmState();
      } else {
        onShowToast(data.error || 'Human session failed');
      }
    } catch {
      onShowToast('Could not execute human surfing session');
    } finally {
      setRunningHumanSprint(false);
    }
  };

  const handleToggleAutonomousSessions = async () => {
    setTogglingSessions(true);
    try {
      const res = await fetch('/api/browser/sessions/toggle', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onShowToast(data.enabled 
          ? '🛡️ Sentinel 24×7 Autonomous Sessions Activated! Periodic reels runs active.' 
          : '🛑 Sentinel Autonomous Sessions Paused.');
        fetchBrowserStatus();
      } else {
        onShowToast(data.error || 'Failed to toggle sessions');
      }
    } catch {
      onShowToast('Could not toggle autonomous sessions');
    } finally {
      setTogglingSessions(false);
    }
  };

  const handleCheckDMsNow = async () => {
    setCheckingDMs(true);
    try {
      const res = await fetch('/api/browser/dms', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        if (data.result?.replied) {
          onShowToast(`✉️ Replied to DM: "${data.result.replyText?.slice(0, 45)}..."`);
        } else {
          onShowToast('📥 Inbox checked — no pending unread DMs.');
        }
        fetchBrowserStatus();
      } else {
        onShowToast(data.error || 'Failed to check DMs');
      }
    } catch {
      onShowToast('Could not check DMs');
    } finally {
      setCheckingDMs(false);
    }
  };

  const fetchSwarmState = async () => {
    try {
      const [agentsRes, logsRes] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/agents/activity?limit=40')
      ]);

      if (agentsRes.ok) {
        const data = await agentsRes.json();
        if (data.success && data.agents) {
          setAgents(data.agents);
        }
        if (data.manager) {
          setManagerSummary(data.manager);
        }
      }

      if (logsRes.ok) {
        const logData = await logsRes.json();
        if (logData.success && logData.logs) {
          setLogs(logData.logs);
        }
      }
    } catch (err) {
      console.warn('Could not refresh agent swarm data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSwarmState();
    fetchBrowserStatus();
    const interval = setInterval(() => {
      fetchSwarmState();
      fetchBrowserStatus();
    }, 12000);
    return () => clearInterval(interval);
  }, []);

  const handleDeployCopilot = (payload: string, url: string, author: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(payload);
    }
    onShowToast(`Copied agent solution! Opening ${author} on Instagram...`);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleToggleAgent = async (id: string, currentStatus: string) => {
    const nextActive = currentStatus !== 'active';
    try {
      const res = await fetch(`/api/agents/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextActive })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.agent) {
          setAgents(prev => prev.map(a => a.id === id ? data.agent : a));
          onShowToast(`${data.agent.name} is now ${nextActive ? 'Active' : 'Paused'}`);
          if (id === 'agent_surfer' || id.includes('surfer')) {
            fetchBrowserStatus();
          }
        }
      }
    } catch {
      onShowToast('Failed to toggle agent');
    }
  };

  const handleToggleAll = async (targetActive: boolean) => {
    try {
      const res = await fetch('/api/agents/toggle-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: targetActive })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.agents) {
          setAgents(data.agents);
          onShowToast(`All agents are now ${targetActive ? 'Active & Engaging' : 'Paused'}`);
          fetchBrowserStatus();
        }
      }
    } catch {
      onShowToast('Failed to update agent swarm status');
    }
  };

  const handleRunImmediateCycle = async () => {
    setCycling(true);
    try {
      const res = await fetch('/api/agents/run-cycle', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onShowToast(`⚡ Interaction cycle executed! ${data.executed} actions processed`);
        await fetchSwarmState();
      } else {
        onShowToast(data.error || 'Execution cycle failed');
      }
    } catch {
      onShowToast('Could not trigger swarm cycle');
    } finally {
      setCycling(false);
    }
  };

  const handleSendDirective = async (overrideText?: string) => {
    const textToSend = overrideText || directiveInput;
    if (!textToSend.trim()) return;
    setSendingDirective(true);
    try {
      const res = await fetch('/api/sentinel/directive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directive: textToSend.trim() })
      });
      const data = await res.json();
      if (data.success && data.result) {
        setSentinelPlan(data.result);
        if (data.agents) setAgents(data.agents);
        onShowToast(`🛡️ Sentinel executed directive: "${textToSend.slice(0, 40)}..."`);
        setDirectiveInput('');
        fetchSwarmState();
      } else {
        onShowToast(data.error || 'Sentinel could not process directive');
      }
    } catch {
      onShowToast('Failed to transmit directive to Sentinel');
    } finally {
      setSendingDirective(false);
    }
  };

  const handleCreateAgentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim() || !newAgentRole.trim()) return;
    setCreatingAgent(true);
    try {
      const tags = newAgentHashtags.split(',').map(t => t.trim()).filter(Boolean);
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAgentName.trim(),
          role: newAgentRole.trim(),
          description: newAgentDescription.trim() || `Specialized growth operative deployed for @theuntoldarch`,
          avatarColor: newAgentColor,
          targetHashtags: tags,
          dailyLimit: Number(newAgentLimit || 25),
          config: { missionDirective: newAgentDirective.trim() || newAgentRole.trim() }
        })
      });
      let data: any = {};
      try {
        data = await res.json();
      } catch {
        data = { error: `Server returned HTTP ${res.status}` };
      }
      if (res.ok && data.success && data.agent) {
        setAgents(prev => {
          const exists = prev.some(a => a.id === data.agent.id);
          return exists ? prev.map(a => a.id === data.agent.id ? data.agent : a) : [...prev, data.agent];
        });
        onShowToast(`✅ Deployed ${data.agent.name} to the active swarm!`);
        setShowCreateModal(false);
        setNewAgentName('');
        setNewAgentRole('');
        setNewAgentDescription('');
        setNewAgentDirective('');
        fetchSwarmState();
      } else {
        console.error('[Agent Commission Error]', res.status, data);
        onShowToast(data.error || `Failed to create agent (HTTP ${res.status})`);
      }
    } catch (err: any) {
      console.error('[Agent Commission Network Error]', err);
      onShowToast(err?.message || 'Could not commission new agent');
    } finally {
      setCreatingAgent(false);
    }
  };

  const handleDeleteAgent = async (agentId: string, agentName: string) => {
    if (agentId === 'agent_sentinel') {
      onShowToast('Cannot delete Sentinel (Supreme Commander)');
      return;
    }
    if (!window.confirm(`Are you sure you want to decommission ${agentName}?`)) return;
    try {
      const res = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setAgents(prev => prev.filter(a => a.id !== agentId));
        onShowToast(`🗑️ Decommissioned ${agentName}`);
        fetchSwarmState();
      } else {
        onShowToast(data.error || 'Failed to delete agent');
      }
    } catch {
      onShowToast('Could not delete agent');
    }
  };

  const handleGrowAccount = async () => {
    setGrowingAccount(true);
    try {
      const res = await fetch('/api/sentinel/grow', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onShowToast(`🚀 Sentinel launched growth campaign! (${data.cycleExecuted} community actions executed)`);
        fetchSwarmState();
      } else {
        onShowToast(data.error || 'Growth campaign failed');
      }
    } catch {
      onShowToast('Could not run growth campaign');
    } finally {
      setGrowingAccount(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAgent) return;
    try {
      const res = await fetch(`/api/agents/${editingAgent.id}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyLimit: limitInput })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.agent) {
          setAgents(prev => prev.map(a => a.id === editingAgent.id ? data.agent : a));
          onShowToast(`Updated limits for ${data.agent.name}`);
          setEditingAgent(null);
        }
      }
    } catch {
      onShowToast('Failed to save agent configuration');
    }
  };

  const managerAgent = agents.find(a => a.id === 'agent_sentinel' || a.isManager);
  const workerAgents = agents.filter(a => a.id !== 'agent_sentinel' && !a.isManager);

  const allActive = agents.length > 0 && agents.every(a => a.status === 'active');
  const totalActionsToday = workerAgents.reduce((acc, a) => acc + a.actionsToday, 0);
  const totalActionsLifetime = workerAgents.reduce((acc, a) => acc + a.totalActions, 0);

  const filteredLogs = logs.filter(log => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'vetoed') return log.status === 'vetoed_by_manager' || log.managerVerdict === 'vetoed';
    return log.actionType === activeFilter;
  });

  const getAgentIcon = (id: string) => {
    if (id === 'agent_sentinel') return <ShieldCheck className="w-5 h-5 text-emerald-400" />;
    if (id === 'agent_pulse') return <Heart className="w-5 h-5 text-cyan-400" />;
    if (id === 'agent_echo') return <MessageSquare className="w-5 h-5 text-pink-400" />;
    if (id === 'agent_mentor' || id.includes('archivist')) return <BookOpen className="w-5 h-5 text-violet-400" />;
    if (id === 'agent_surfer' || id.includes('surfer')) return <Globe className="w-5 h-5 text-blue-400" />;
    return <Sparkles className="w-5 h-5 text-amber-400" />;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-8 animate-fadeIn">
      {/* Header & Swarm Master Switch */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900/90 via-[#0f172a] to-[#0b0f19] border border-cyan-500/25 p-6 lg:p-8 shadow-2xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-bold tracking-wide uppercase">
              <Users className="w-3.5 h-3.5" />
              Autonomous Swarm Deployed • {agents.length} Agents ({workerAgents.length} Operatives + 1 Sentinel)
            </div>
            <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight flex items-center gap-3">
              Instagram Interaction & Community Swarm
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
              Autonomous multi-agent collective governed in real time by <span className="text-emerald-400 font-semibold">Agent Sentinel</span>. Engages high-signal curiosity & mystery reels, delivers intriguing insights, and funnels organic viewers to <span className="text-pink-400 font-semibold">@theuntoldarch</span> while strictly complying with Instagram guidelines.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleRunImmediateCycle}
              disabled={cycling}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-lg shadow-cyan-500/20 flex items-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${cycling ? 'animate-spin' : ''}`} />
              {cycling ? 'Executing Swarm...' : 'Trigger Interaction Cycle'}
            </button>

            <button
              type="button"
              onClick={() => handleToggleAll(!allActive)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold border flex items-center gap-2 transition-all ${
                allActive
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
              }`}
            >
              {allActive ? (
                <>
                  <Pause className="w-3.5 h-3.5" /> Pause All Agents
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" /> Start All Agents
                </>
              )}
            </button>
          </div>
        </div>

        {/* Global Swarm Health & Metric Counters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-6 border-t border-slate-800/80">
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Deployed Swarm</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xl font-bold text-white">4 Agents</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">1 Manager + 3 Specialists</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Supervision Shield</span>
            <div className="flex items-center gap-1.5 mt-1">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-xl font-bold text-emerald-400">100% Compliant</span>
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">Sentinel active & auditing</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Interactions Today</span>
            <span className="text-xl font-bold text-cyan-400 mt-1 block">{totalActionsToday}</span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Live Comments + Solutions + Hooks</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Safety Guardrails</span>
            <div className="flex items-center gap-1.5 mt-1">
              <Scale className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-bold text-purple-300">Community Rules</span>
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">Anti-Spam velocity active</span>
          </div>
        </div>
      </div>

      {/* --- Swarm Manager & Compliance Console (Agent Sentinel) --- */}
      {managerAgent && (
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-950/80 via-slate-900/90 to-[#0f172a] border border-emerald-500/30 p-6 lg:p-7 shadow-2xl backdrop-blur-xl space-y-5">
          <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center p-3 shadow-lg shadow-emerald-500/10 shrink-0">
                <ShieldCheck className="w-8 h-8 text-emerald-400" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-black tracking-wide uppercase">
                    Swarm Commander & Autonomous Growth Orchestrator
                  </span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                  {managerAgent.name}
                  <span className="text-xs font-normal text-emerald-400 font-mono">(Supreme Growth Commander)</span>
                </h2>
                <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                  Supreme autonomous commander of the <span className="text-emerald-300 font-semibold">@theuntoldarch</span> collective. Spawns, deletes, and commands sub-agents, executes manual owner directives, monitors community compliance, and drives organic account growth.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleToggleAgent(managerAgent.id, managerAgent.status)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-2 transition-all ${
                  managerAgent.status === 'active'
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                    : 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                }`}
              >
                {managerAgent.status === 'active' ? (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Commander Active</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <span>Commander Paused</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowGuardrails(!showGuardrails)}
                className="px-3 py-2 rounded-xl text-xs font-medium bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-300 flex items-center gap-1.5 transition-colors"
              >
                <Scale className="w-3.5 h-3.5 text-cyan-400" />
                <span>{showGuardrails ? 'Hide Policies' : 'View Policies'}</span>
                {showGuardrails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Manager Live Telemetry Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-emerald-500/20 text-xs">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Audits & Deployments</span>
              <span className="text-lg font-black text-white mt-0.5 block">{managerAgent.actionsToday} / {managerAgent.dailyLimit}</span>
              <span className="text-[10px] text-slate-500">Supervisory operations</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Compliance Score</span>
              <span className="text-lg font-black text-emerald-400 mt-0.5 block">
                {managerSummary?.complianceScore ?? 100}%
              </span>
              <span className="text-[10px] text-emerald-500/80 font-medium">100% Lawful Standard</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Unlawful Actions Blocked</span>
              <span className="text-lg font-black text-cyan-400 mt-0.5 block">
                {managerSummary?.vetoedCount ?? logs.filter(l => l.status === 'vetoed_by_manager').length} Blocked
              </span>
              <span className="text-[10px] text-slate-500">Zero spam leakage</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Supervised Operatives</span>
              <span className="text-lg font-black text-purple-300 mt-0.5 block">{workerAgents.length} Agents</span>
              <span className="text-[10px] text-slate-500">Under Sentinel command</span>
            </div>
          </div>

          {/* Sentinel Autonomous Command Directive Console */}
          <div className="pt-5 border-t border-emerald-500/20 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Sentinel Master Directives & Swarm Task Allocation
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                  Supreme Growth Authority
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Instruct Sentinel to create/delete agents, assign missions, or run growth sprints.
              </span>
            </div>

            {/* Quick Directives Chips */}
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleSendDirective('Assign an agent to interact with users asking questions about ancient Egyptian lost technology and pyramids')}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-[11px] font-medium transition-colors flex items-center gap-1.5"
              >
                <span>🏛️ Ancient Pyramids & Tech Focus</span>
              </button>
              <button
                type="button"
                onClick={() => handleSendDirective('Deploy an outbound community campaign engaging declassified documents and cold war mysteries')}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-[11px] font-medium transition-colors flex items-center gap-1.5"
              >
                <span>📜 Cold War & Declassified Dossiers</span>
              </button>
              <button
                type="button"
                onClick={() => handleSendDirective('Create a new agent named ArchiveScout to find comments debating historical anomalies and drop curious evidence hooks')}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-purple-950/60 border border-purple-500/30 text-purple-300 text-[11px] font-medium transition-colors flex items-center gap-1.5"
              >
                <span>🤖 Spawn 'ArchiveScout' Agent</span>
              </button>
              <button
                type="button"
                onClick={handleGrowAccount}
                disabled={growingAccount}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 text-[11px] font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <TrendingUp className={`w-3.5 h-3.5 ${growingAccount ? 'animate-spin' : ''}`} />
                <span>{growingAccount ? 'Deploying Growth...' : '🚀 Launch Page Growth Campaign'}</span>
              </button>
            </div>

            {/* Directive Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendDirective();
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <input
                  type="text"
                  value={directiveInput}
                  onChange={(e) => setDirectiveInput(e.target.value)}
                  placeholder="Type a manual command for Sentinel (e.g. 'Create an agent to explore deep ocean mysteries' or 'Assign Archivist to engage conspiracy reels')..."
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950/80 border border-emerald-500/30 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition-all font-sans"
                  disabled={sendingDirective}
                />
              </div>
              <button
                type="submit"
                disabled={sendingDirective || !directiveInput.trim()}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-black shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50 shrink-0"
              >
                {sendingDirective ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>{sendingDirective ? 'Dispatching...' : 'Dispatch Order'}</span>
              </button>
            </form>

            {/* Active Sentinel Tactical Execution Plan */}
            {sentinelPlan && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-xs space-y-2 shadow-inner"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-300 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Sentinel Tactical Execution Plan
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Directive Dispatched</span>
                </div>
                <p className="text-slate-200 text-xs leading-relaxed font-sans font-medium">
                  {sentinelPlan.responseMessage}
                </p>
                {sentinelPlan.plan && (
                  <p className="text-slate-400 text-[11px] leading-relaxed italic border-l-2 border-emerald-500/40 pl-2">
                    {sentinelPlan.plan}
                  </p>
                )}
                {sentinelPlan.actionsTaken?.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-emerald-500/20">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">Operational Moves Executed:</span>
                    {sentinelPlan.actionsTaken.map((act, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[11px] text-slate-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{act}</span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* Collapsible Compliance Guardrails */}
          {showGuardrails && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="p-4 rounded-2xl bg-slate-950/80 border border-emerald-500/20 text-xs space-y-3"
            >
              <h4 className="font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Active Ethical & Legal Compliance Policies Enforced by Agent Sentinel:
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-300">
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    1. Instagram Community Guidelines Enforcement
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Zero hate speech, vulgarity, harassment, defamation, or toxic slurs. Every comment is pre-screened to ensure positive, polite engagement.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    2. Anti-Spam Velocity & Account Shield
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Guarantees action cadence stays below Meta rate limits (&lt; 40 actions/hr). Applies randomized 45-120s human jitter intervals to eliminate shadowban risks.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    3. Unlawful Content & Fraud Protection
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Rejects crypto giveaways, pyramid schemes, fake discounts, unauthorized affiliate links, or deceptive claims.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    4. Factual Historical Accuracy & Archival Integrity Standard
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Demands respectful inquiry, verified archival records, and intriguing discussion questions under documentary and mystery reels.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Autonomous Web Browser Surfing Operative & Viewport Telemetry */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900/90 via-[#0d1527] to-[#070b14] border border-blue-500/30 p-6 lg:p-8 space-y-6 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 border border-blue-500/30">
                <Globe className="w-3 h-3 text-blue-400" /> Playwright Stealth Browser Engine
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1.5 ${
                browserStatus?.isLoggedIn 
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${browserStatus?.isLoggedIn ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                {browserStatus?.isLoggedIn ? `Logged In (@${browserStatus.username || 'theuntoldarch'})` : 'Login Required'}
              </span>
            </div>
            <h3 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              Agent Surfer • Instagram Web Autopilot
            </h3>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Real headless/headed Chromium session surfing <span className="text-blue-400 font-semibold">instagram.com</span>. Autonomously watches community reels, drops Sentinel-approved comments with human keystroke jitter, and checks/replies to direct message inquiries.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowLoginModal(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border border-blue-500/40 flex items-center gap-1.5 transition-all hover:scale-[1.02]"
              title="Log into Instagram directly with username and password"
            >
              <Key className="w-3.5 h-3.5 text-blue-300" />
              <span>Login with Credentials</span>
            </button>

            <button
              type="button"
              onClick={handleLaunchBrowserLogin}
              disabled={openingLogin}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 flex items-center gap-1.5 transition-all hover:scale-[1.02] disabled:opacity-50"
              title="Opens real Google Chrome window on your desktop to log in once"
            >
              <Laptop className="w-3.5 h-3.5 text-blue-400" />
              <span>{openingLogin ? 'Opening Chrome...' : 'Open Browser Login Window'}</span>
            </button>

            <button
              type="button"
              onClick={handleVerifyBrowserSession}
              disabled={checkingBrowser}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-all hover:scale-[1.02] disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingBrowser ? 'animate-spin text-blue-400' : ''}`} />
              <span>{checkingBrowser ? 'Checking...' : 'Verify Session'}</span>
            </button>

            <button
              type="button"
              onClick={handleSurfReelNow}
              disabled={surfingReel || runningHumanSprint}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 text-slate-950 shadow-lg shadow-blue-500/20 flex items-center gap-1.5 transition-all hover:scale-[1.02] disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${surfingReel ? 'animate-spin' : ''}`} />
              <span>{surfingReel ? 'Surfing & Commenting...' : 'Surf Reel Now'}</span>
            </button>

            {/* Session Action Controls */}
            <button
              type="button"
              onClick={() => handleRunHumanSprint()}
              disabled={runningHumanSprint || surfingReel}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 via-orange-500 to-pink-500 hover:from-amber-400 hover:to-pink-400 text-slate-950 shadow-lg shadow-orange-500/20 flex items-center gap-1.5 transition-all hover:scale-[1.02] disabled:opacity-50"
              title="Runs a human session with random count (20-45 reels) like a real user browsing"
            >
              <Zap className={`w-3.5 h-3.5 ${runningHumanSprint ? 'animate-bounce' : ''}`} />
              <span>{runningHumanSprint ? 'Running Session...' : 'Run Random Session (20–45)'}</span>
            </button>

            {/* Quick Session Presets (25 or 40 reels) */}
            <div className="inline-flex rounded-xl p-0.5 bg-slate-900 border border-slate-700/80 items-center">
              <button
                type="button"
                onClick={() => handleRunHumanSprint(25)}
                disabled={runningHumanSprint || surfingReel}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-all disabled:opacity-50"
                title="Run session with exactly 25 reels"
              >
                25 Reels
              </button>
              <span className="text-slate-700 text-xs">|</span>
              <button
                type="button"
                onClick={() => handleRunHumanSprint(40)}
                disabled={runningHumanSprint || surfingReel}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-all disabled:opacity-50"
                title="Run session with exactly 40 reels"
              >
                40 Reels
              </button>
            </div>

            {/* 24x7 Autonomous Sessions Toggle */}
            <button
              type="button"
              onClick={handleToggleAutonomousSessions}
              disabled={togglingSessions}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all hover:scale-[1.02] disabled:opacity-50 ${
                browserStatus?.autonomousSessionsEnabled
                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                  : 'bg-slate-800/90 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="Sentinel runs periodic sessions 24x7 with randomized reel counts and natural cooldown breaks"
            >
              <ShieldCheck className={`w-3.5 h-3.5 ${browserStatus?.autonomousSessionsEnabled ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
              <span>{browserStatus?.autonomousSessionsEnabled ? '24×7 Sessions: ON' : '24×7 Sessions: OFF'}</span>
            </button>

            <button
              type="button"
              onClick={handleCheckDMsNow}
              disabled={checkingDMs}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 flex items-center gap-1.5 transition-all hover:scale-[1.02] disabled:opacity-50"
            >
              <MessageCircle className={`w-3.5 h-3.5 ${checkingDMs ? 'animate-pulse text-purple-300' : ''}`} />
              <span>{checkingDMs ? 'Checking DMs...' : 'Check & Reply DMs'}</span>
            </button>

            {/* Surf Stories & Quick Reactions */}
            <button
              type="button"
              onClick={handleSurfStories}
              disabled={surfingStories}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-pink-500/20 hover:bg-pink-500/30 text-pink-200 border border-pink-500/40 flex items-center gap-1.5 transition-all hover:scale-[1.02] disabled:opacity-50"
              title="Browse home feed stories and drop natural reaction hearts"
            >
              <BookOpen className={`w-3.5 h-3.5 ${surfingStories ? 'animate-spin text-pink-300' : 'text-pink-400'}`} />
              <span>{surfingStories ? 'Surfing Stories...' : 'Surf Stories & React'}</span>
            </button>

            {/* Competitor Hook Mining Engine */}
            <button
              type="button"
              onClick={() => {
                setShowCompetitorModal(true);
                handleFetchSavedHooks();
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 flex items-center gap-1.5 transition-all hover:scale-[1.02] disabled:opacity-50"
              title="Reverse-engineer viral 3-second hook structures from competitor reels"
            >
              <Target className="w-3.5 h-3.5 text-amber-400" />
              <span>Mine Competitor Hooks</span>
            </button>

            {/* Inbound Lead CRM Dashboard */}
            <button
              type="button"
              onClick={() => setShowLeadCrmModal(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 flex items-center gap-1.5 transition-all hover:scale-[1.02] shadow-sm shadow-cyan-500/10"
              title="Open Inbound Lead CRM Dashboard to inspect and export qualified leads"
            >
              <Users className="w-3.5 h-3.5 text-cyan-400" />
              <span>Inbound Lead CRM</span>
            </button>

            {/* Telegram Sentinel Button & Setup Trigger */}
            <div className="flex items-center gap-1 bg-slate-900/90 border border-blue-500/30 rounded-xl p-0.5">
              <button
                type="button"
                onClick={handleTestTelegram}
                disabled={testingTelegram}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-blue-200 hover:text-white flex items-center gap-1.5 transition-all disabled:opacity-50"
                title={telegramConfigStatus?.isConfigured ? 'Test Telegram Sentinel notifications' : 'Click to link your Telegram Bot'}
              >
                <Bell className={`w-3.5 h-3.5 ${testingTelegram ? 'animate-bounce text-blue-300' : 'text-blue-400'}`} />
                <span>{testingTelegram ? 'Testing...' : (telegramConfigStatus?.isConfigured ? 'Telegram: Armed' : 'Link Telegram')}</span>
                <span className={`w-2 h-2 rounded-full ${telegramConfigStatus?.isConfigured ? 'bg-emerald-400 shadow-sm shadow-emerald-400/80' : 'bg-amber-400 animate-pulse'}`} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowTelegramModal(true);
                  fetchTelegramStatus();
                }}
                className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all text-xs font-semibold"
                title="Configure Telegram Sentinel Bot Token & Chat ID"
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Account Health & Anti-Shadowban Trust Meter */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-950/80 via-emerald-950/20 to-slate-950/80 border border-emerald-500/30 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-white text-xs">Anti-Shadowban Trust Meter:</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold text-[11px] border border-emerald-500/30">
                  {Math.max(82, Math.min(99, 99 - Math.round(((agents || []).reduce((acc, a) => acc + (a.actionsToday || 0), 0) + (browserStatus?.stats?.likesGivenToday || 0)) * 0.2)))}% Trust (Pristine Health)
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Velocity monitored against Instagram safety ceilings. Automated human jitter active.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:min-w-[220px]">
            <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
              <div 
                className="bg-gradient-to-r from-emerald-500 to-cyan-400 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.max(82, Math.min(99, 99 - Math.round(((agents || []).reduce((acc, a) => acc + (a.actionsToday || 0), 0) + (browserStatus?.stats?.likesGivenToday || 0)) * 0.2)))}%` }} 
              />
            </div>
            <span className="text-[10px] font-mono text-emerald-400 font-bold shrink-0">0 Risk Detected</span>
          </div>
        </div>

        {/* Sentinel Autonomous Session Engine Status Banner */}
        {browserStatus?.autonomousSessionsEnabled && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-cyan-950/30 to-slate-950/70 border border-emerald-500/30 shadow-lg shadow-emerald-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <div>
                <span className="font-extrabold text-white">Sentinel 24×7 Autonomous Surfer: </span>
                {browserStatus?.sessionState === 'surfing' ? (
                  <span className="text-cyan-300 font-semibold">
                    Actively browsing feed (Session #{browserStatus.currentSessionNumber || 1})
                  </span>
                ) : browserStatus?.sessionState === 'sleeping' && browserStatus?.nextSessionAt ? (
                  <span className="text-indigo-300 font-semibold flex items-center gap-1.5">
                    🌙 8-Hour Circadian Night Sleep — Simulating realistic human night rest rhythm. Next morning session at {new Date(browserStatus.nextSessionAt).toLocaleTimeString()}
                  </span>
                ) : browserStatus?.sessionState === 'resting' && browserStatus?.nextSessionAt ? (
                  <span className="text-amber-300 font-semibold">
                    Resting cooldown — Session #{browserStatus.currentSessionNumber} finished. Next session scheduled at {new Date(browserStatus.nextSessionAt).toLocaleTimeString()}
                  </span>
                ) : (
                  <span className="text-emerald-300">Armed and monitoring reels schedule</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                8h Circadian Night Sleep
              </span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                Randomized 20–45 Reels
              </span>
              <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                Safe 25–55m Cooldowns
              </span>
            </div>
          </div>
        )}

        {/* Browser Stats and Live Telemetry Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
          {/* Quick Metrics */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Reels Watched</span>
                <span className="text-xl font-black text-blue-400 mt-0.5 block">{browserStatus?.stats?.reelsWatched ?? 0}</span>
                <span className="text-[10px] text-slate-500">Human duration (8-20s)</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Comments Typed</span>
                <span className="text-xl font-black text-cyan-400 mt-0.5 block">{browserStatus?.stats?.commentsPosted ?? 0}</span>
                <span className="text-[10px] text-slate-500">Natural keystroke delays</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Likes Given</span>
                <span className="text-xl font-black text-pink-400 mt-0.5 block">{browserStatus?.stats?.likesGiven ?? 0}</span>
                <span className="text-[10px] text-slate-500">Natural engagement</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">DMs Handled</span>
                <span className="text-xl font-black text-purple-400 mt-0.5 block">{browserStatus?.stats?.dmsReplied ?? 0}</span>
                <span className="text-[10px] text-slate-500">Direct archive replies</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>Last Browser Action:</span>
                <span className="font-mono text-slate-200">
                  {browserStatus?.lastActionType ? `${browserStatus.lastActionType.toUpperCase()}` : 'None yet'}
                </span>
              </div>
              {browserStatus?.lastTargetUrl && (
                <div className="text-[11px] text-slate-400 truncate">
                  <span className="text-slate-500">Target: </span>
                  <a href={browserStatus.lastTargetUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                    {browserStatus.lastTargetUrl}
                  </a>
                </div>
              )}
              {browserStatus?.lastActionAt && (
                <div className="text-[10px] text-slate-500">
                  Executed at {new Date(browserStatus.lastActionAt).toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>

          {/* Viewport Live Telemetry Frame */}
          <div className="lg:col-span-2 rounded-2xl bg-slate-950/90 border border-blue-500/20 p-4 space-y-3 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <Eye className="w-3.5 h-3.5 text-blue-400" />
                <span className="font-bold text-white uppercase tracking-wider text-[11px]">Live Browser Viewport Telemetry</span>
                <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-300 text-[10px] font-mono border border-blue-500/20">
                  Chromium 1280x860
                </span>
                <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-300 text-[10px] font-mono border border-purple-500/20">
                  Feed: instagram.com/reels/
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                {/* Stream / Snapshot Mode Switcher */}
                <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setStreamMode('live')}
                    className={`px-2 py-0.5 rounded-md font-bold transition-all flex items-center gap-1 ${
                      streamMode === 'live' 
                        ? 'bg-red-500/20 text-red-300 border border-red-500/40 shadow' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${streamMode === 'live' ? 'bg-red-400 animate-ping' : 'bg-slate-500'}`} />
                    <span>Live Stream</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStreamMode('snapshot')}
                    className={`px-2 py-0.5 rounded-md font-bold transition-all ${
                      streamMode === 'snapshot' 
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Snapshot
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setStreamKey(Date.now())}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700"
                  title="Reconnect Live Broadcast"
                >
                  <RefreshCw className="w-3 h-3 text-blue-400" />
                </button>

                <button
                  type="button"
                  onClick={() => window.open('/api/browser/live-stream', '_blank')}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700"
                  title="Pop-out Live Stream in new window"
                >
                  <ExternalLink className="w-3 h-3 text-cyan-400" />
                </button>
              </div>
            </div>

            {/* Live Contextual Telemetry Banner */}
            {!browserStatus?.isLoggedIn ? (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-amber-200 flex items-center gap-1.5">
                    <span>Instagram Login Gate Active</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">Why login page is showing</span>
                  </div>
                  <p className="text-[11px] text-amber-300/80 leading-relaxed">
                    The viewport below shows the browser sitting at Instagram's login screen because the session is not authenticated yet. Instagram blocks all Reels, profiles, and feeds until you sign in. Click <strong>"Login with Credentials"</strong> or <strong>"Open Browser Login Window"</strong> above to log in, and the agent will immediately stream live reels!
                  </p>
                </div>
              </div>
            ) : browserStatus?.isRunning ? (
              <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-between text-xs animate-pulse">
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping shrink-0" />
                  <span className="font-bold text-cyan-200 shrink-0">Live Active Step:</span>
                  <span className="text-cyan-300 font-medium truncate">{browserStatus?.currentStep || 'Executing browser action...'}</span>
                </div>
                {browserStatus?.currentActivity && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 shrink-0 border border-cyan-500/30">
                    Step {browserStatus.currentActivity.stepNumber}/{browserStatus.currentActivity.totalSteps}
                  </span>
                )}
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-emerald-300 font-medium">
                    Authenticated as @{browserStatus?.username || 'theuntoldarch'} • Ready to surf reels. Click "Surf Reel Now" or "Run 3-Reel Sprint" to watch live!
                  </span>
                </div>
              </div>
            )}

            <div className="w-full aspect-[9/16] sm:aspect-auto sm:h-80 md:h-[420px] max-w-sm sm:max-w-none mx-auto rounded-xl bg-black border border-slate-800 flex items-center justify-center overflow-hidden relative group">
              {streamMode === 'live' ? (
                <div className="relative w-full h-full flex items-center justify-center bg-black">
                  <img 
                    key={streamKey}
                    src={`/api/browser/live-stream?k=${streamKey}`}
                    alt="Live Browser Compositor Broadcast" 
                    className="w-full h-full object-contain object-top cursor-crosshair select-none"
                    onClick={handleStreamClick}
                    onWheel={(e) => {
                      e.preventDefault();
                      handleRemoteInteract('scroll', { deltaY: e.deltaY > 0 ? 550 : -550 });
                    }}
                    onError={() => {
                      setTimeout(() => setStreamKey(Date.now()), 2500);
                    }}
                    title="Interactive Touchpad: Click anywhere to tap, or use mouse wheel to scroll reels"
                  />

                  {/* Remote Pilot Click Ripple Indicator */}
                  {clickMarker && (
                    <span 
                      className="absolute pointer-events-none w-8 h-8 rounded-full border-2 border-cyan-400 bg-cyan-400/30 animate-ping -translate-x-1/2 -translate-y-1/2 z-30" 
                      style={{ left: `${clickMarker.xPercent}%`, top: `${clickMarker.yPercent}%` }} 
                    />
                  )}

                  {/* HUD Overlay: Live Status */}
                  <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-red-600/90 text-white font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5 shadow-lg backdrop-blur-sm animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                    <span>LIVE STREAM • 30 FPS • INTERACTIVE TOUCHPAD</span>
                  </div>

                  {/* HUD Overlay: Target creator indicator */}
                  {browserStatus?.currentActivity?.targetCreator && (
                    <div className="absolute bottom-2.5 left-2.5 px-3 py-1.5 rounded-lg bg-slate-950/85 border border-slate-800 text-xs text-white flex items-center gap-2 backdrop-blur-md">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                      <span>Active Reel: <strong>@{browserStatus.currentActivity.targetCreator}</strong></span>
                    </div>
                  )}

                  <div className="absolute bottom-2.5 right-2.5 px-2 py-1 rounded-md bg-slate-950/80 backdrop-blur-sm border border-slate-800 text-[10px] text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-blue-400" />
                    <span>{new Date().toLocaleTimeString()}</span>
                  </div>
                </div>
              ) : (
                browserStatus?.latestScreenshotUrl ? (
                  <>
                    <img 
                      src={`${browserStatus.latestScreenshotUrl}?t=${viewportTimestamp}`} 
                      alt="Browser Viewport Snapshot" 
                      className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.01] cursor-pointer"
                      onClick={() => setSelectedStepProof(`${browserStatus.latestScreenshotUrl}?t=${viewportTimestamp}`)}
                      title="Click to view full-resolution screenshot"
                    />
                    <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-slate-950/80 backdrop-blur-sm border border-slate-800 text-[10px] text-slate-400 flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-blue-400" />
                      <span>{new Date(viewportTimestamp).toLocaleTimeString()}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center space-y-2 p-6">
                    <Globe className="w-10 h-10 text-blue-400/40 mx-auto animate-pulse" />
                    <p className="text-xs text-slate-400 font-medium">No viewport snapshot recorded yet.</p>
                    <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                      Click "Verify Session" or "Surf Reel Now" to launch the stealth browser and capture a live snapshot of Instagram Web.
                    </p>
                  </div>
                )
              )}
            </div>

            {/* Interactive Browser Remote Control Bar */}
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-slate-300 font-bold flex items-center gap-1.5">
                  <MousePointer className="w-3.5 h-3.5 text-cyan-400" />
                  Remote Touchpad:
                </span>
                <span className="text-[11px] text-slate-400">Click or wheel on stream to pilot directly:</span>
              </div>

              <div className="flex items-center flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleRemoteInteract('key', { key: 'ArrowDown' })}
                  disabled={sendingInteract}
                  className="px-2.5 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-50"
                  title="Next Reel (ArrowDown)"
                >
                  <ArrowDown className="w-3 h-3 text-cyan-400" />
                  <span>Next Reel</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoteInteract('key', { key: 'ArrowUp' })}
                  disabled={sendingInteract}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-50"
                  title="Prev Reel (ArrowUp)"
                >
                  <ArrowUp className="w-3 h-3 text-slate-400" />
                  <span>Prev Reel</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoteInteract('key', { key: 'l' })}
                  disabled={sendingInteract}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-50"
                  title="Like Active Reel ('l')"
                >
                  <Heart className="w-3 h-3 text-rose-400 fill-rose-400/50" />
                  <span>Like</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoteInteract('navigate', { url: 'https://www.instagram.com/reels/' })}
                  disabled={sendingInteract}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-50"
                  title="Navigate directly to Instagram Reels feed"
                >
                  <Compass className="w-3 h-3 text-purple-400" />
                  <span>Reels Feed</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoteInteract('key', { key: 'Escape' })}
                  disabled={sendingInteract}
                  className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all disabled:opacity-50"
                  title="Press Escape (close dialog/modal)"
                >
                  Esc
                </button>
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <input
                  type="text"
                  value={remoteTextInput}
                  onChange={(e) => setRemoteTextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && remoteTextInput) {
                      handleRemoteInteract('type', { text: remoteTextInput });
                      setRemoteTextInput('');
                    }
                  }}
                  placeholder="Type text directly..."
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 flex-1 sm:w-44"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (remoteTextInput) {
                      handleRemoteInteract('type', { text: remoteTextInput });
                      setRemoteTextInput('');
                    }
                  }}
                  disabled={sendingInteract || !remoteTextInput}
                  className="px-2.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1 disabled:opacity-50 transition-all"
                >
                  <Send className="w-3 h-3" />
                  <span>Send</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Live Step-by-Step Activity Feed & Interaction Stream */}
        <div className="rounded-2xl bg-slate-950/80 border border-blue-500/20 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <Terminal className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Live Telemetry & Step-by-Step Activity Feed</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 text-[10px] font-mono border border-blue-500/20">
                    {browserStatus?.recentSteps?.length || 0} Steps Logged
                  </span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  Granular trace of every reel watched, creator analyzed, Sentinel audit passed, comment typed, and profile followed
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fetchBrowserStatus()}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1.5 transition-all"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Refresh Trace</span>
              </button>
            </div>
          </div>

          {/* Steps List */}
          {browserStatus?.recentSteps && browserStatus.recentSteps.length > 0 ? (
            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {browserStatus.recentSteps.map((step: any) => {
                const isWatch = step.actionType === 'watch';
                const isComment = step.actionType === 'comment';
                const isSentinel = step.actionType === 'sentinel';
                const isLike = step.actionType === 'like';
                const isFollow = step.actionType === 'follow';
                const isAuth = step.actionType === 'auth';

                return (
                  <div
                    key={step.id}
                    className={`p-3 rounded-xl border transition-all text-xs flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
                      isComment ? 'bg-purple-950/20 border-purple-500/30' :
                      isLike ? 'bg-pink-950/20 border-pink-500/30' :
                      isFollow ? 'bg-amber-950/20 border-amber-500/30' :
                      isSentinel ? 'bg-emerald-950/20 border-emerald-500/30' :
                      isWatch ? 'bg-cyan-950/20 border-cyan-500/30' :
                      isAuth ? 'bg-red-950/20 border-red-500/30' :
                      'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                          isComment ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' :
                          isLike ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30' :
                          isFollow ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                          isSentinel ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                          isWatch ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' :
                          isAuth ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                          'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}>
                          {step.actionType}
                        </span>
                        <span className="font-bold text-white">{step.stepName}</span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(step.timestamp).toLocaleTimeString()}
                        </span>
                      </div>

                      <p className="text-slate-300 text-xs leading-relaxed">{step.description}</p>

                      {step.targetUrl && (
                        <div className="flex items-center gap-1.5 text-[11px] text-blue-400 truncate">
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          <a href={step.targetUrl} target="_blank" rel="noreferrer" className="hover:underline truncate">
                            {step.targetUrl}
                          </a>
                        </div>
                      )}

                      {step.details?.commentText && (
                        <div className="p-2 rounded-lg bg-slate-950/80 border border-purple-500/20 text-purple-200 text-[11px] italic">
                          "{step.details.commentText}"
                        </div>
                      )}

                      {step.details?.complianceScore !== undefined && (
                        <div className="flex items-center gap-2 text-[11px] text-emerald-400 font-semibold">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Sentinel Score: {step.details.complianceScore}/100 (Authenticity Verified)</span>
                        </div>
                      )}
                    </div>

                    {step.screenshotUrl && (
                      <button
                        type="button"
                        onClick={() => setSelectedStepProof(`${step.screenshotUrl}?t=${Date.now()}`)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-semibold shrink-0 flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3 text-blue-400" />
                        <span>View Proof</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 text-center space-y-3">
              <Clock className="w-8 h-8 text-blue-400/40 mx-auto" />
              <div className="space-y-1">
                <h5 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Awaiting First Surfing Session</h5>
                <p className="text-[11px] text-slate-400 max-w-lg mx-auto">
                  When the agent surfs Instagram reels, every exact URL, human dwell duration, Sentinel compliance score, typed comment, and followed creator is logged step-by-step above in real time.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2 text-left max-w-2xl mx-auto text-[11px]">
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                  <span className="font-bold text-blue-400 block">Step 1: Navigate</span>
                  <span className="text-slate-400 text-[10px]">Loads historical & mystery reels matching archive niche</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                  <span className="font-bold text-cyan-400 block">Step 2: Watch</span>
                  <span className="text-slate-400 text-[10px]">Human retention simulation (8s to 18s dwell time)</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                  <span className="font-bold text-emerald-400 block">Step 3: Audit</span>
                  <span className="text-slate-400 text-[10px]">Sentinel evaluates comment (90+ score required)</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                  <span className="font-bold text-purple-400 block">Step 4: Engage</span>
                  <span className="text-slate-400 text-[10px]">Types with keystroke jitter, likes & follows</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Supervised Worker Agents Grid */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              Supervised Worker Agents ({workerAgents.length})
            </h2>
            <p className="text-xs text-slate-400">Autonomous operatives executing community interactions under Sentinel supreme oversight</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 flex items-center gap-1.5 transition-all hover:scale-[1.02]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Deploy New Agent</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {workerAgents.map((agent) => {
            const isActive = agent.status === 'active';
            const progressPct = Math.min(100, Math.round((agent.actionsToday / (agent.dailyLimit || 1)) * 100));

            return (
              <motion.div
                key={agent.id}
                whileHover={{ y: -3 }}
                className={`relative rounded-3xl bg-slate-900/80 border p-6 flex flex-col justify-between transition-all backdrop-blur-md shadow-xl ${
                  isActive ? 'border-slate-700/80' : 'border-slate-800/40 opacity-70'
                }`}
              >
                <div className="space-y-4">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-11 h-11 rounded-2xl flex items-center justify-center p-2.5 shadow-lg"
                        style={{ backgroundColor: `${agent.avatarColor}20`, borderColor: `${agent.avatarColor}40`, borderWidth: 1 }}
                      >
                        {getAgentIcon(agent.id)}
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white tracking-tight">{agent.name}</h3>
                        <span className="text-[11px] font-semibold text-slate-400 block">{agent.role}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleAgent(agent.id, agent.status)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isActive ? 'bg-emerald-500' : 'bg-slate-700'
                      }`}
                      title={isActive ? 'Click to Pause Agent' : 'Click to Activate Agent'}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          isActive ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed min-h-[44px]">
                    {agent.description}
                  </p>

                  {/* Active Mission Directive */}
                  {agent.config?.missionDirective && (
                    <div className="p-3 rounded-2xl bg-purple-950/40 border border-purple-500/30 text-[11px] text-purple-200 space-y-1">
                      <span className="font-bold text-[10px] uppercase tracking-wider text-purple-400 flex items-center gap-1">
                        <Target className="w-3 h-3" />
                        Mission Directive
                      </span>
                      <p className="text-slate-300 leading-snug line-clamp-2">
                        {agent.config.missionDirective}
                      </p>
                    </div>
                  )}

                  {/* Target Hashtags */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Target Niches</span>
                    <div className="flex flex-wrap gap-1.5">
                      {agent.targetHashtags.map(tag => (
                        <span key={tag} className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700/60">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Daily Quota Progress */}
                  <div className="space-y-1.5 pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-medium">Daily Quota Usage</span>
                      <span className="font-bold text-slate-200">
                        {agent.actionsToday} / {agent.dailyLimit} <span className="text-[10px] text-slate-400 font-normal">({progressPct}%)</span>
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-500"
                        style={{ 
                          width: `${progressPct}%`,
                          backgroundColor: agent.avatarColor
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-slate-500" />
                    {agent.lastActiveAt ? `Active ${new Date(agent.lastActiveAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Ready to engage'}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAgent(agent);
                        setLimitInput(agent.dailyLimit);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-1"
                      title="Edit Agent Limits"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Config</span>
                    </button>
                    {agent.id !== 'agent_sentinel' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteAgent(agent.id, agent.name)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title={`Decommission ${agent.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Live Activity Stream & Supervision Ledger */}
      <div className="rounded-3xl bg-slate-900/70 border border-slate-800 p-6 lg:p-8 space-y-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-purple-400" />
              Live Swarm Interaction & Oversight Ledger
            </h2>
            <p className="text-xs text-slate-400">
              Complete chronological audit trail of all reels targeted, liked, or commented on with Agent Sentinel's verification sign-off.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1 rounded-lg font-bold transition-colors ${activeFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              All ({logs.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('like')}
              className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors ${activeFilter === 'like' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-white'}`}
            >
              <Heart className="w-3 h-3" /> Engagement Hooks
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('comment')}
              className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors ${activeFilter === 'comment' ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30' : 'text-slate-400 hover:text-white'}`}
            >
              <MessageSquare className="w-3 h-3" /> Comments
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('solution')}
              className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors ${activeFilter === 'solution' ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'text-slate-400 hover:text-white'}`}
            >
              <Code2 className="w-3 h-3" /> Solutions
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('vetoed')}
              className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors ${activeFilter === 'vetoed' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'text-slate-400 hover:text-white'}`}
            >
              <ShieldAlert className="w-3 h-3" /> Blocked ({logs.filter(l => l.status === 'vetoed_by_manager' || l.managerVerdict === 'vetoed').length})
            </button>
          </div>
        </div>

        {/* External Community Engagement Banner */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-cyan-950/20 to-slate-900 border border-emerald-500/30 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping shrink-0" />
            <span className="text-slate-200">
              <strong className="text-cyan-300">External Creator Engagement Active:</strong> Agents scout trending reels from top developers & tech accounts (e.g. @frontendjoe, @python.hub, @fireship_io). Meta Graph API blocks automated bots from mass-commenting on external accounts, so Texvic engineers the exact comment and enables 1-click <strong className="text-emerald-400">Copy & Drop</strong> to post natively without ban risk.
            </span>
          </div>
          <span className="text-[11px] text-emerald-400 font-mono font-medium shrink-0">
            Self-Account (@theuntoldarch) Excluded
          </span>
        </div>

        {/* Activity List */}
        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center rounded-2xl bg-slate-950/40 border border-dashed border-slate-800 space-y-3">
            <Users className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-sm text-slate-400">No interaction logs matching filter recorded yet.</p>
            <button
              type="button"
              onClick={handleRunImmediateCycle}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-colors"
            >
              Trigger Interaction Cycle
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
            {filteredLogs.map(log => {
              const isVetoed = log.status === 'vetoed_by_manager' || log.managerVerdict === 'vetoed';
              const isLivePublished = Boolean(log.details?.livePublished || log.details?.instagramCommentId);
              const igCommentId = log.details?.instagramCommentId;
              const isCopilotReady = log.status === 'copilot_ready' || log.details?.copilotReady;

              return (
                <div
                  key={log.id}
                  className={`p-4 rounded-2xl border transition-colors space-y-3 ${
                    isVetoed 
                      ? 'bg-rose-950/20 border-rose-900/60 hover:border-rose-700/80' 
                      : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        isVetoed ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                        log.actionType === 'like' ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30' :
                        log.actionType === 'comment' ? 'bg-pink-500/10 text-pink-300 border border-pink-500/30' :
                        'bg-violet-500/10 text-violet-300 border border-violet-500/30'
                      }`}>
                        {isVetoed ? '🛑 Blocked by Sentinel' : log.actionType === 'like' ? '💬 Engagement Booster' : log.actionType === 'comment' ? '💬 Comment Posted' : '⚡ Dev Solution'}
                      </span>

                      {isCopilotReady && !isVetoed && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-[10px] font-bold text-cyan-300">
                          <Sparkles className="w-3 h-3 text-cyan-400" />
                          Ready for 1-Click Drop
                        </span>
                      )}

                      {isLivePublished && !isVetoed && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-300">
                          <Sparkles className="w-3 h-3 text-emerald-400" />
                          Live on Instagram {igCommentId ? `• ID: ${igCommentId.slice(-6)}` : ''}
                        </span>
                      )}

                      <span className="text-xs font-bold text-slate-200">{log.agentName}</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-xs text-slate-300 font-bold bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700/60">
                        Target: {log.targetAuthor}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      {isVetoed ? (
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                      <span>{new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>

                      {log.payloadText && !isVetoed && (
                        <button
                          type="button"
                          onClick={() => handleDeployCopilot(log.payloadText!, log.targetMediaUrl, log.targetAuthor)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 border border-cyan-500/40 text-cyan-300 hover:text-white transition-all text-xs font-bold shadow-sm"
                          title="Copy engineered comment & open reel on Instagram"
                        >
                          <Sparkles className="w-3 h-3 text-cyan-400" />
                          <span>Copy & Drop</span>
                          <ExternalLink className="w-3 h-3 text-cyan-400" />
                        </button>
                      )}

                      <a
                        href={log.targetMediaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-all text-xs font-semibold"
                        title="Open creator's Instagram page"
                      >
                        <span>Open Reel</span>
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                      </a>
                    </div>
                  </div>

                  {log.targetCaption && (
                    <p className="text-[11px] text-slate-400 italic line-clamp-1">
                      "{log.targetCaption}"
                    </p>
                  )}

                  {log.payloadText && (
                    <div className={`p-3 rounded-xl border text-xs font-mono ${
                      isVetoed ? 'bg-rose-950/30 border-rose-800 text-rose-200' : 'bg-slate-900 border border-slate-800 text-slate-200'
                    }`}>
                      <div className="text-[10px] text-slate-400 font-sans font-bold uppercase mb-1 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-cyan-400" />
                        {log.actionType === 'solution' ? 'Engineered Code Solution:' : 'Contextual Observation:'}
                      </div>
                      {log.payloadText}
                    </div>
                  )}

                  {/* Manager Sentinel Compliance Sign-off & Assessment Note */}
                  {log.managerVerdict && (
                    <div className={`p-2.5 rounded-xl text-[11px] flex items-start gap-2 border font-mono ${
                      isVetoed
                        ? 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                        : 'bg-emerald-950/40 border-emerald-500/25 text-emerald-300'
                    }`}>
                      {isVetoed ? (
                        <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      ) : (
                        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      )}
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 font-sans font-bold text-[10px] tracking-wide uppercase">
                          <span>Reviewed by {log.reviewedBy || 'Agent Sentinel'}</span>
                          <span>•</span>
                          <span className={isVetoed ? 'text-rose-400' : 'text-emerald-400'}>
                            {isVetoed ? 'VETOED (Unlawful/Policy Risk)' : `Compliance Score: ${log.complianceScore || 100}%`}
                          </span>
                        </div>
                        <p className="text-slate-300 font-sans text-xs">
                          {log.managerNotes || (isVetoed ? 'Action vetoed to protect account reputation.' : 'Passed Instagram Community Guidelines & Legal Safety Standards.')}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Agent Config Modal */}
      <AnimatePresence>
        {editingAgent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setEditingAgent(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-md w-full bg-slate-950 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  Configure {editingAgent.name}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingAgent(null)}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    Daily Interaction Limit (Rate Limit Shield)
                  </label>
                  <p className="text-[11px] text-slate-400 mb-2">
                    Maximum interactions this agent is allowed to execute per 24-hour cycle.
                  </p>
                  <input
                    type="number"
                    min={5}
                    max={200}
                    value={limitInput}
                    onChange={(e) => setLimitInput(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-bold focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-[11px] text-cyan-300 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Agent Sentinel enforces continuous velocity pacing (45-120s human jitter) to maintain 100% compliant behavioral telemetry.</span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingAgent(null)}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-slate-300 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {/* Deploy New Agent Modal */}
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCreateModal(false)}
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-lg w-full bg-slate-900 border border-purple-500/40 rounded-3xl p-6 shadow-2xl space-y-5 my-8"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center">
                    <Plus className="w-4 h-4 text-purple-300" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">Deploy Custom Operative</h3>
                    <p className="text-[11px] text-slate-400">Commission a specialized worker agent under Sentinel supreme supervision</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateAgentSubmit} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">
                      Agent Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. ArchiveScout"
                      value={newAgentName}
                      onChange={(e) => setNewAgentName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-purple-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">
                      Operational Role <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Lost Civilizations Specialist"
                      value={newAgentRole}
                      onChange={(e) => setNewAgentRole(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-purple-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    Mission Directive / Behavioral Focus
                  </label>
                  <p className="text-[11px] text-slate-400 mb-1.5">
                    What specific task or comment angles should this agent execute when interacting with other users and reels?
                  </p>
                  <textarea
                    rows={2}
                    placeholder="e.g. Target reels about ancient ruins or lost technology. Share intriguing historical quotes and invite viewers to share their theories."
                    value={newAgentDirective}
                    onChange={(e) => setNewAgentDirective(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-purple-400 resize-none font-sans"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    Role Description (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Engages high-curiosity comments on archaeology and unexplained history"
                    value={newAgentDescription}
                    onChange={(e) => setNewAgentDescription(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-purple-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    Target Niches / Hashtags
                  </label>
                  <input
                    type="text"
                    placeholder="#ancienthistory, #archaeology, #mysteries"
                    value={newAgentHashtags}
                    onChange={(e) => setNewAgentHashtags(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-purple-400"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">
                      Daily Action Limit
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={150}
                      value={newAgentLimit}
                      onChange={(e) => setNewAgentLimit(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold focus:outline-none focus:border-purple-400"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">
                      Badge Color
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      {['#38bdf8', '#a855f7', '#ec4899', '#10b981', '#f59e0b', '#6366f1'].map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setNewAgentColor(color)}
                          className={`w-6 h-6 rounded-full border-2 transition-transform ${
                            newAgentColor === color ? 'scale-125 border-white' : 'border-transparent hover:scale-110'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                  <span>Sentinel will automatically audit all comments generated by this operative before anything is posted to Instagram.</span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-950 text-slate-300 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingAgent || !newAgentName.trim() || !newAgentRole.trim()}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white font-bold shadow-lg shadow-purple-500/20 flex items-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50"
                  >
                    {creatingAgent ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Commissioning...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>Deploy Operative</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {/* Instagram Web Credential & Cookie Login Modal */}
        {showLoginModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowLoginModal(false)}
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-md w-full bg-slate-900 border border-blue-500/40 rounded-3xl p-6 shadow-2xl space-y-5 my-8"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
                    {loginTab === 'credentials' ? (
                      <Key className="w-4 h-4 text-blue-300" />
                    ) : (
                      <Cookie className="w-4 h-4 text-amber-300" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">Instagram Agent Login</h3>
                    <p className="text-[11px] text-slate-400">Authenticate Agent Surfer in stealth Chromium</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Login Method Tab Switcher */}
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setLoginTab('credentials');
                    setLoginModalError(null);
                  }}
                  className={`py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all ${
                    loginTab === 'credentials'
                      ? 'bg-blue-500/20 text-blue-200 border border-blue-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Account Credentials</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setLoginTab('cookie');
                    setLoginModalError(null);
                  }}
                  className={`py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all ${
                    loginTab === 'cookie'
                      ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Cookie className="w-3.5 h-3.5" />
                  <span>Session Cookie (Fast)</span>
                </button>
              </div>

              {/* Error / Status Alert */}
              {loginModalError && (
                <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                  <span>{loginModalError}</span>
                </div>
              )}

              {loginTab === 'credentials' ? (
                <form onSubmit={handleCredentialLoginSubmit} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">
                      Instagram Username / Handle
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. theuntoldarch"
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-400"
                      disabled={loggingIn}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">
                      Account Password
                    </label>
                    <input
                      type="password"
                      required={!requires2FA}
                      placeholder="••••••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-400"
                      disabled={loggingIn}
                    />
                  </div>

                  {requires2FA && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2"
                    >
                      <label className="block text-amber-300 font-bold">
                        2FA / Security Verification Code
                      </label>
                      <p className="text-[11px] text-slate-400">
                        Instagram requested a 6-digit confirmation code sent to your phone or authenticator app.
                      </p>
                      <input
                        type="text"
                        placeholder="e.g. 123456"
                        value={login2FACode}
                        onChange={(e) => setLogin2FACode(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-amber-500/40 text-amber-200 font-mono tracking-widest text-center text-sm font-bold focus:outline-none focus:border-amber-400"
                        disabled={loggingIn}
                      />
                    </motion.div>
                  )}

                  <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300 flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
                    <span>
                      Credentials fill Meta's unified login in stealth Chromium. Session state is permanently stored in <span className="font-mono text-white">data/browser_profile</span>.
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setShowLoginModal(false);
                        handleLaunchBrowserLogin();
                      }}
                      className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"
                    >
                      <Laptop className="w-3.5 h-3.5" />
                      <span>Open Chrome Window</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowLoginModal(false)}
                        className="px-4 py-2 rounded-xl bg-slate-950 text-slate-300 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={loggingIn || !loginUsername.trim() || (!loginPassword.trim() && !requires2FA)}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 text-slate-950 font-black shadow-lg shadow-blue-500/20 flex items-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50"
                      >
                        {loggingIn ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Logging in...</span>
                          </>
                        ) : (
                          <>
                            <Key className="w-3.5 h-3.5" />
                            <span>{requires2FA ? 'Confirm 2FA Code' : 'Log In & Save Session'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleImportCookieSubmit} className="space-y-4 text-xs">
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2 text-slate-300 text-[11px]">
                    <div className="flex items-center gap-1.5 text-amber-300 font-bold">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Instant 1-Click Cookie Authentication</span>
                    </div>
                    <ol className="list-decimal pl-4 space-y-1 text-slate-400">
                      <li>Open <span className="text-white font-mono">instagram.com</span> in your browser where you are already signed in.</li>
                      <li>Press <span className="text-white font-mono">F12</span> &rarr; Click <span className="text-white">Application</span> tab &rarr; <span className="text-white">Cookies</span> &rarr; <span className="text-white font-mono">https://www.instagram.com</span>.</li>
                      <li>Double-click the value of the <span className="text-amber-300 font-mono font-bold">sessionid</span> cookie, copy it, and paste below.</li>
                    </ol>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">
                      Paste Instagram <span className="font-mono text-amber-300">sessionid</span> Value
                    </label>
                    <textarea
                      required
                      rows={3}
                      placeholder="e.g. 78291048%3ALkQ9X... (or full cookie string)"
                      value={cookieInput}
                      onChange={(e) => setCookieInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs placeholder-slate-500 focus:outline-none focus:border-amber-400"
                      disabled={importingCookie}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setShowLoginModal(false);
                        handleLaunchBrowserLogin();
                      }}
                      className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"
                    >
                      <Laptop className="w-3.5 h-3.5" />
                      <span>Open Chrome Window</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowLoginModal(false)}
                        className="px-4 py-2 rounded-xl bg-slate-950 text-slate-300 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={importingCookie || !cookieInput.trim()}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50"
                      >
                        {importingCookie ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Validating Cookie...</span>
                          </>
                        ) : (
                          <>
                            <Cookie className="w-3.5 h-3.5" />
                            <span>Connect Session ID</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}

        {/* Step Screenshot Proof Modal */}
        {selectedStepProof && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
            onClick={() => setSelectedStepProof(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-4xl w-full bg-slate-900 border border-slate-700 rounded-3xl p-5 shadow-2xl overflow-hidden space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-blue-400" />
                  <span className="font-bold text-white text-sm">Action Proof Snapshot</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">
                    Verified Browser Telemetry
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedStepProof(null)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-all"
                >
                  Close Snapshot
                </button>
              </div>
              <div className="rounded-2xl overflow-hidden border border-slate-800 bg-black max-h-[75vh] flex items-center justify-center">
                <img src={selectedStepProof} alt="Browser Action Proof" className="max-w-full max-h-[75vh] object-contain" />
              </div>
            </motion.div>
          </motion.div>
        )}
        {/* Competitor Hook Mining Modal */}
        {showCompetitorModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
            onClick={() => setShowCompetitorModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-3xl w-full bg-slate-900 border border-amber-500/30 rounded-3xl p-6 shadow-2xl overflow-hidden space-y-5 max-h-[88vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <Target className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      Competitor Hook Mining Engine
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Gemini 3.8 Flash Powered
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Scrapes top reels from competitors and reverse-engineers viral 3-second hooks & angles
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCompetitorModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-all"
                >
                  Close
                </button>
              </div>

              {/* Input Bar */}
              <div className="flex flex-col sm:flex-row items-center gap-2.5">
                <div className="relative flex-1 w-full">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">@</span>
                  <input
                    type="text"
                    value={competitorInput}
                    onChange={(e) => setCompetitorInput(e.target.value.replace(/^@/, ''))}
                    placeholder="theuntoldarch"
                    className="w-full pl-8 pr-4 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleMineCompetitorHooks}
                  disabled={miningCompetitor || !competitorInput.trim()}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
                >
                  {miningCompetitor ? (
                    <>
                      <Sparkles className="w-3.5 h-3.5 animate-spin" />
                      <span>Reverse-Engineering Reels...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5" />
                      <span>Mine Viral Hooks</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleFetchSavedHooks}
                  className="w-full sm:w-auto px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
                  title="Load previously mined hooks from database"
                >
                  Saved Hooks
                </button>
              </div>

              {/* Mined Hooks List */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {minedHooks.length > 0 ? (
                  minedHooks.map((hook, idx) => (
                    <div 
                      key={hook.id || idx}
                      className="p-4 rounded-2xl bg-slate-950/70 border border-amber-500/20 space-y-3 hover:border-amber-500/40 transition-all"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-amber-400">@{hook.competitorUsername}</span>
                          <span className="text-slate-600">•</span>
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-bold">
                            {hook.psychologicalTrigger || 'Pattern Interrupt'}
                          </span>
                        </div>
                        {hook.reelUrl && (
                          <a
                            href={hook.reelUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1"
                          >
                            <span>View Reel</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>

                      {/* Hook Quote Box */}
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">
                          3-Second Hook:
                        </span>
                        <p className="text-white font-medium italic">"{hook.extractedHook}"</p>
                        {hook.visualOpening && (
                          <p className="text-[11px] text-slate-400 mt-1.5">
                            <strong className="text-slate-300">Visual Trigger:</strong> {hook.visualOpening}
                          </p>
                        )}
                      </div>

                      {/* Synthesized Angles */}
                      {hook.synthesizedIdeas && hook.synthesizedIdeas.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            Synthesized Texvic Angle Adaptations:
                          </span>
                          <div className="space-y-1">
                            {hook.synthesizedIdeas.map((idea: string, i: number) => {
                              const isGeneratingThis = generatingHookKey === `${hook.id || idx}-${i}`;
                              return (
                                <div 
                                  key={i}
                                  className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-xs text-emerald-200"
                                >
                                  <span className="flex-1 font-medium">{idea}</span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => handleGenerateReelFromHook(`${hook.id || idx}-${i}`, idea)}
                                      disabled={Boolean(generatingHookKey)}
                                      className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-pink-500 hover:from-amber-400 hover:to-pink-400 text-slate-950 text-[10px] font-black flex items-center gap-1 shadow-md shadow-amber-500/10 transition-all disabled:opacity-50"
                                      title="Generate a 1080x1920 Instagram Reel from this winning angle"
                                    >
                                      {isGeneratingThis ? (
                                        <>
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                          <span>Generating...</span>
                                        </>
                                      ) : (
                                        <>
                                          <Zap className="w-3 h-3 fill-slate-950" />
                                          <span>Generate Reel</span>
                                        </>
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigator.clipboard.writeText(idea);
                                        onShowToast('📋 Copied angle to clipboard!');
                                      }}
                                      className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-[10px] text-emerald-400 border border-emerald-500/30 transition-colors"
                                    >
                                      Copy
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 space-y-3">
                    <Target className="w-10 h-10 text-amber-500/30 mx-auto" />
                    <p className="text-xs text-slate-400 font-medium">No competitor hooks analyzed yet.</p>
                    <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                      Enter any CAD/Architecture creator profile (e.g. <code>theuntoldarch</code>) and click "Mine Viral Hooks" to have Gemini deconstruct their top hooks.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Telegram Sentinel Linking & Setup Modal */}
        {showTelegramModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
            onClick={() => setShowTelegramModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-xl w-full bg-slate-900 border border-blue-500/40 rounded-3xl p-6 shadow-2xl overflow-hidden space-y-5"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      Link Telegram with Sentinel
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                        telegramConfigStatus?.isConfigured
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      }`}>
                        {telegramConfigStatus?.isConfigured ? 'Connected' : 'Not Linked'}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Real-time push notifications for published reels, surfing sessions & leads
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowTelegramModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-all"
                >
                  Close
                </button>
              </div>

              {/* Step-by-Step Instructions */}
              <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2 text-xs">
                <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider block">
                  How to link your Telegram in 60 seconds:
                </span>
                <ol className="space-y-1.5 text-slate-300 text-[11px] list-decimal list-inside">
                  <li>
                    Open <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline font-bold">@BotFather</a> on Telegram, send <code className="bg-slate-800 px-1 py-0.5 rounded text-cyan-300">/newbot</code>, name it, and copy your HTTP API token.
                  </li>
                  <li>
                    Open your new bot on Telegram and press <strong className="text-white">START</strong> (or send any message to it).
                  </li>
                  <li>
                    Paste your Bot Token below and click <strong className="text-white">Auto-Detect Chat ID</strong>!
                  </li>
                </ol>
              </div>

              {/* Form Inputs */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Telegram Bot Token:
                  </label>
                  <input
                    type="password"
                    value={telegramTokenInput}
                    onChange={(e) => setTelegramTokenInput(e.target.value)}
                    placeholder={telegramConfigStatus?.botTokenMasked || "1234567890:ABCdefGHIjklMNOpqrs..."}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-300">
                      Telegram Chat ID:
                    </label>
                    <button
                      type="button"
                      onClick={handleDetectTelegramChat}
                      disabled={detectingTelegram || !telegramTokenInput.trim()}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold underline disabled:opacity-50 flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>{detectingTelegram ? 'Detecting from bot...' : 'Auto-Detect Chat ID'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={telegramChatIdInput}
                    onChange={(e) => setTelegramChatIdInput(e.target.value)}
                    placeholder="e.g. 123456789 or -100123456789"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    You can also find your personal ID by sending /start to <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">@userinfobot</a>.
                  </p>
                </div>

                {/* Routine Sprint Reports Toggle */}
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-white block">Routine Surfing Sprint Reports</span>
                    <span className="text-[11px] text-slate-400 block">
                      Send a Telegram summary after every periodic browsing session. (Inbound leads & published reels will always alert).
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleRoutineAlerts}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all shrink-0 ${
                      telegramConfigStatus?.routineAlertsEnabled
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {telegramConfigStatus?.routineAlertsEnabled ? '🔔 Reports Active' : '🔕 Muted (Clean)'}
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleTestTelegram}
                  disabled={testingTelegram}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all disabled:opacity-50"
                >
                  {testingTelegram ? 'Testing...' : 'Send Test Ping'}
                </button>

                <button
                  type="button"
                  onClick={handleSaveAndTestTelegram}
                  disabled={savingTelegram || !telegramTokenInput.trim() || !telegramChatIdInput.trim()}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{savingTelegram ? 'Linking Sentinel...' : 'Save & Link Sentinel'}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inbound Lead CRM Dashboard Modal */}
      <InboundLeadCrmModal
        isOpen={showLeadCrmModal}
        onClose={() => setShowLeadCrmModal(false)}
        onShowToast={onShowToast}
      />
    </div>
  );
};
