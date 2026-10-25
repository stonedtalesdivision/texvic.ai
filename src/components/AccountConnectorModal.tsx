import React, { useEffect, useState } from 'react';
import { 
  Instagram, 
  Facebook, 
  CheckCircle2, 
  X, 
  Shield, 
  RefreshCw, 
  RotateCcw, 
  Unplug, 
  AlertCircle, 
  Key, 
  Globe, 
  Share2, 
  Layers,
  UserCheck,
  Search,
  ExternalLink,
  Sparkles,
  Check
} from 'lucide-react';
import { AccountAnalytics } from '../types';

interface AccountConnectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProfile: AccountAnalytics['profile'];
  isConnected: boolean;
  initialChannel?: 'instagram' | 'facebook_page' | 'facebook_account';
  onResetToZero?: () => Promise<void>;
  onOAuthConnected?: (profile: AccountAnalytics['profile']) => Promise<void>;
  onRefreshStatus: () => Promise<any>;
  onDisconnect: () => Promise<void>;
  onFacebookStatusChanged?: (connected: boolean) => void;
}

interface FacebookStatus {
  isConnected: boolean;
  isExpired?: boolean;
  pageId?: string;
  name?: string;
  username?: string;
  error?: string;
}

interface FacebookUserStatus {
  isConnected: boolean;
  isExpired?: boolean;
  userId?: string;
  name?: string;
  username?: string;
  error?: string;
}

export const AccountConnectorModal: React.FC<AccountConnectorModalProps> = ({
  isOpen,
  onClose,
  currentProfile,
  isConnected,
  initialChannel = 'instagram',
  onResetToZero,
  onOAuthConnected,
  onRefreshStatus,
  onDisconnect,
  onFacebookStatusChanged
}) => {
  const [activeChannel, setActiveChannel] = useState<'instagram' | 'facebook_page' | 'facebook_account'>(initialChannel);
  const [connectTab, setConnectTab] = useState<'oauth' | 'token'>('oauth');
  
  const [oauthLoading, setOauthLoading] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Instagram direct token fields
  const [directAccountId, setDirectAccountId] = useState('');
  const [directToken, setDirectToken] = useState('');

  // Facebook Page fields
  const [fbPageStatus, setFbPageStatus] = useState<FacebookStatus>({ isConnected: false });
  const [fbPageIdInput, setFbPageIdInput] = useState('');
  const [fbPageTokenInput, setFbPageTokenInput] = useState('');
  const [fbPageLoading, setFbPageLoading] = useState(false);
  const [fbAutoDetectToken, setFbAutoDetectToken] = useState('');
  const [fbAutoDetectLoading, setFbAutoDetectLoading] = useState(false);
  const [fbDiscoveredPages, setFbDiscoveredPages] = useState<any[]>([]);

  // Facebook User Account fields
  const [fbAccountStatus, setFbAccountStatus] = useState<FacebookUserStatus>({ isConnected: false });
  const [fbUserIdInput, setFbUserIdInput] = useState('');
  const [fbUserTokenInput, setFbUserTokenInput] = useState('');
  const [fbAccountLoading, setFbAccountLoading] = useState(false);

  // Fetch Facebook connections status
  const fetchFacebookStatus = async () => {
    try {
      const res = await fetch('/api/auth/facebook/status');
      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        if (data.page) {
          setFbPageStatus(data.page);
          onFacebookStatusChanged?.(Boolean(data.page.isConnected));
          if (data.page.pageId && !fbPageIdInput) {
            setFbPageIdInput(data.page.pageId);
          }
        }
        if (data.account) {
          setFbAccountStatus(data.account);
          if (data.account.userId && !fbUserIdInput) {
            setFbUserIdInput(data.account.userId);
          }
        }
      }
    } catch {
      // Non-critical
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    if (initialChannel) {
      setActiveChannel(initialChannel);
    }

    let cancelled = false;
    setErrorMsg(null);
    setStatusLoading(true);

    Promise.allSettled([
      onRefreshStatus(),
      fetchFacebookStatus()
    ]).then(([igResult]) => {
      if (cancelled) return;
      if (igResult.status === 'fulfilled') {
        const data = igResult.value;
        if (!data?.isConnected && data?.error) {
          setErrorMsg(data.error);
        }
      }
    }).finally(() => {
      if (!cancelled) setStatusLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, onRefreshStatus]);

  if (!isOpen) return null;

  const showNotification = (msg: string) => {
    setSuccess(msg);
    window.setTimeout(() => setSuccess(null), 3500);
  };

  const handleOAuthConnect = async () => {
    setOauthLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/instagram/url');
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.url) {
        throw new Error(data.error || 'Could not start Instagram OAuth.');
      }

      // DO NOT pass noopener or noreferrer - window.opener is REQUIRED for popup postMessage communication
      const popup = window.open(
        data.url,
        'texvic-instagram-oauth',
        'width=620,height=760'
      );

      if (!popup) {
        throw new Error('Popup was blocked by your browser. Allow popups for this site and try again.');
      }

      await new Promise<void>((resolve, reject) => {
        let finished = false;

        const cleanup = () => {
          finished = true;
          window.clearTimeout(timeout);
          window.clearInterval(pollInterval);
          window.removeEventListener('message', onMessage);
        };

        const timeout = window.setTimeout(() => {
          cleanup();
          reject(new Error('Instagram connection timed out.'));
        }, 180000);

        // Periodically check if popup closed (user closed it, or redirect finished)
        const pollInterval = window.setInterval(async () => {
          if (popup.closed) {
            cleanup();
            // Check if authorization succeeded in background
            try {
              const status = await onRefreshStatus();
              if (status?.isConnected && status?.account) {
                await onOAuthConnected?.(status.account);
                resolve();
                return;
              }
            } catch {}
            // If window closed without completing, cancel loading
            resolve();
          }
        }, 1000);

        const onMessage = async (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;

          if (event.data?.type === 'OAUTH_AUTH_FAILED') {
            cleanup();
            reject(new Error(event.data.error || 'Instagram authorization failed.'));
            return;
          }

          if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
            cleanup();
            try {
              const status = await onRefreshStatus();
              if (!status?.isConnected || !status.account) {
                throw new Error(status?.error || 'Instagram authorization completed but the account could not be verified.');
              }

              await onOAuthConnected?.(status.account);
              resolve();
            } catch (error) {
              reject(error);
            }
          }
        };

        window.addEventListener('message', onMessage);
      });

      showNotification('Instagram authorization verified successfully.');
    } catch (error: any) {
      setErrorMsg(error?.message || 'Instagram connection failed.');
    } finally {
      setOauthLoading(false);
    }
  };

  const handleDirectTokenConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directToken.trim()) {
      setErrorMsg('Please enter a valid Meta Access Token.');
      return;
    }

    setTokenLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/instagram/direct-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: directAccountId.trim() || undefined,
          accessToken: directToken.trim()
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to authenticate with direct token.');
      }

      showNotification(`Connected successfully to @${data.account?.username || 'instagram'}!`);
      const status = await onRefreshStatus();
      if (status?.account) {
        await onOAuthConnected?.(status.account);
      }
      setDirectToken('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to connect token.');
    } finally {
      setTokenLoading(false);
    }
  };

  // Auto-Detect Facebook Pages from ANY valid token
  const handleAutoDetectFacebook = async (tokenOverride?: string) => {
    const tokenToUse = (tokenOverride || fbAutoDetectToken || fbPageTokenInput).trim();
    if (!tokenToUse) {
      setErrorMsg('Please paste a Facebook Access Token first.');
      return;
    }

    if (tokenToUse.startsWith('IG')) {
      setErrorMsg("The token entered begins with 'IG...', which is an Instagram User Token. Facebook Pages require a Facebook Access Token (starts with 'EAAB...' or 'EAA...'). Use the Explorer link below to generate one.");
      return;
    }

    setFbAutoDetectLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/facebook/auto-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tokenToUse,
          autoConnect: true
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not auto-detect Facebook Pages.');
      }

      if (data.autoConnected && data.connectedPage) {
        showNotification(`Connected Facebook Page "${data.connectedPage.name}"!`);
        await fetchFacebookStatus();
        onFacebookStatusChanged?.(true);
        setFbAutoDetectToken('');
        setFbDiscoveredPages([]);
      } else if (Array.isArray(data.pages) && data.pages.length > 0) {
        setFbDiscoveredPages(data.pages);
        showNotification(`Discovered ${data.pages.length} pages. Choose one to connect!`);
      } else {
        showNotification('Token verified, but no Facebook Pages found.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to auto-detect Facebook Page.');
    } finally {
      setFbAutoDetectLoading(false);
    }
  };

  // Connect a discovered page from the list
  const handleSelectDiscoveredPage = async (page: any) => {
    setFbPageLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/facebook/connect-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: page.id,
          accessToken: page.accessToken
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to connect selected page.');
      }
      showNotification(`Connected Facebook Page "${page.name}"!`);
      await fetchFacebookStatus();
      onFacebookStatusChanged?.(true);
      setFbDiscoveredPages([]);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to connect selected page.');
    } finally {
      setFbPageLoading(false);
    }
  };

  // Connect Facebook Page
  const handleConnectFacebookPage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fbPageIdInput.trim() || !fbPageTokenInput.trim()) {
      setErrorMsg('Please enter both Facebook Page ID and Page Access Token.');
      return;
    }

    if (fbPageTokenInput.trim().startsWith('IG')) {
      setErrorMsg("The token entered starts with 'IG...', which is an Instagram User Token. Facebook Page publishing requires a Page Access Token (starts with 'EAAB...' or 'EAA...').");
      return;
    }

    setFbPageLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/facebook/connect-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: fbPageIdInput.trim(),
          accessToken: fbPageTokenInput.trim()
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to connect Facebook Page.');
      }

      showNotification(`Connected Facebook Page "${data.page?.name || fbPageIdInput}"!`);
      await fetchFacebookStatus();
      onFacebookStatusChanged?.(true);
      setFbPageTokenInput('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to connect Facebook Page.');
    } finally {
      setFbPageLoading(false);
    }
  };

  // Disconnect Facebook Page
  const handleDisconnectFacebookPage = async () => {
    setFbPageLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/facebook/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'page' })
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        showNotification('Disconnected Facebook Page.');
        setFbPageStatus({ isConnected: false });
        onFacebookStatusChanged?.(false);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to disconnect Facebook Page.');
    } finally {
      setFbPageLoading(false);
    }
  };

  // Connect Facebook User Account
  const handleConnectFacebookAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fbUserTokenInput.trim()) {
      setErrorMsg('Please enter a Facebook User Access Token.');
      return;
    }

    setFbAccountLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/facebook/connect-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: fbUserIdInput.trim() || 'me',
          accessToken: fbUserTokenInput.trim()
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to connect Facebook User Account.');
      }

      showNotification(`Connected Facebook Profile "${data.account?.name || 'User'}"!`);
      await fetchFacebookStatus();
      setFbUserTokenInput('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to connect Facebook User Account.');
    } finally {
      setFbAccountLoading(false);
    }
  };

  // Disconnect Facebook User Account
  const handleDisconnectFacebookAccount = async () => {
    setFbAccountLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/facebook/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'account' })
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        showNotification('Disconnected Facebook Profile.');
        setFbAccountStatus({ isConnected: false });
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to disconnect Facebook Profile.');
    } finally {
      setFbAccountLoading(false);
    }
  };

  const handleRefresh = async () => {
    setStatusLoading(true);
    setErrorMsg(null);
    try {
      await Promise.allSettled([
        onRefreshStatus(),
        fetchFacebookStatus()
      ]);
    } catch (error: any) {
      setErrorMsg(error?.message || 'Could not verify connections.');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    setErrorMsg(null);
    try {
      await onDisconnect();
    } catch (error: any) {
      setErrorMsg(error?.message || 'Could not disconnect Instagram.');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleReset = async () => {
    if (!onResetToZero) return;
    setIsResetting(true);
    setErrorMsg(null);
    try {
      await onResetToZero();
    } catch (error: any) {
      setErrorMsg(error?.message || 'Could not reset the account.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative max-h-[92vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-500 via-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Share2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Simultaneous Multi-Platform Publishing</h2>
            <p className="text-xs text-slate-400">Post Reels concurrently to Instagram, Facebook Page & Facebook Profile</p>
          </div>
        </div>

        {/* Simultaneous Channels Status Summary Bar */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {/* Instagram Pill */}
          <button
            type="button"
            onClick={() => setActiveChannel('instagram')}
            className={`p-2.5 rounded-xl border text-left transition-all ${
              activeChannel === 'instagram' 
                ? 'bg-pink-500/15 border-pink-500/40' 
                : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <Instagram className="w-3.5 h-3.5 text-pink-400" />
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-slate-600'}`} />
            </div>
            <p className="text-[11px] font-bold text-white truncate">Instagram</p>
            <p className={`text-[10px] truncate ${isConnected ? 'text-emerald-400 font-semibold' : 'text-slate-500'}`}>
              {isConnected ? `@${currentProfile.handle}` : 'Disconnected'}
            </p>
          </button>

          {/* Facebook Page Pill */}
          <button
            type="button"
            onClick={() => setActiveChannel('facebook_page')}
            className={`p-2.5 rounded-xl border text-left transition-all ${
              activeChannel === 'facebook_page' 
                ? 'bg-blue-500/15 border-blue-500/40' 
                : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <Facebook className="w-3.5 h-3.5 text-blue-400" />
              <div className={`w-2 h-2 rounded-full ${
                fbPageStatus.isConnected 
                  ? 'bg-emerald-400 shadow-sm shadow-emerald-400' 
                  : fbPageStatus.isExpired 
                    ? 'bg-amber-400 shadow-sm shadow-amber-400 animate-pulse' 
                    : 'bg-slate-600'
              }`} />
            </div>
            <p className="text-[11px] font-bold text-white truncate">FB Page</p>
            <p className={`text-[10px] truncate ${
              fbPageStatus.isConnected 
                ? 'text-emerald-400 font-semibold' 
                : fbPageStatus.isExpired 
                  ? 'text-amber-400 font-semibold' 
                  : 'text-slate-500'
            }`}>
              {fbPageStatus.isConnected ? (fbPageStatus.name || 'Connected') : fbPageStatus.isExpired ? 'Session Expired' : 'Disconnected'}
            </p>
          </button>

          {/* Facebook Account Pill */}
          <button
            type="button"
            onClick={() => setActiveChannel('facebook_account')}
            className={`p-2.5 rounded-xl border text-left transition-all ${
              activeChannel === 'facebook_account' 
                ? 'bg-indigo-500/15 border-indigo-500/40' 
                : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
              <div className={`w-2 h-2 rounded-full ${
                fbAccountStatus.isConnected 
                  ? 'bg-emerald-400 shadow-sm shadow-emerald-400' 
                  : fbAccountStatus.isExpired 
                    ? 'bg-amber-400 shadow-sm shadow-amber-400 animate-pulse' 
                    : 'bg-slate-600'
              }`} />
            </div>
            <p className="text-[11px] font-bold text-white truncate">FB Profile</p>
            <p className={`text-[10px] truncate ${
              fbAccountStatus.isConnected 
                ? 'text-emerald-400 font-semibold' 
                : fbAccountStatus.isExpired 
                  ? 'text-amber-400 font-semibold' 
                  : 'text-slate-500'
            }`}>
              {fbAccountStatus.isConnected ? (fbAccountStatus.name || 'Connected') : fbAccountStatus.isExpired ? 'Session Expired' : 'Disconnected'}
            </p>
          </button>
        </div>

        {/* Global Notifications */}
        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {success}
          </div>
        )}

        {/* TAB 1: INSTAGRAM CONNECTION */}
        {activeChannel === 'instagram' && (
          <div>
            <div className={`p-4 rounded-2xl border mb-4 ${isConnected ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
              <div className="flex items-start gap-3">
                <div className={`mt-1 w-3 h-3 rounded-full shrink-0 ${isConnected ? 'bg-emerald-400 shadow-lg shadow-emerald-400/40' : 'bg-amber-400'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className={`text-sm font-bold ${isConnected ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {isConnected ? 'Instagram Connected' : 'Instagram Not Connected'}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {isConnected
                          ? `Verified as @${currentProfile.handle}`
                          : 'Connect through Meta OAuth or provide a Graph API Access Token.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRefresh}
                      disabled={statusLoading || oauthLoading || tokenLoading}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-950/70 border border-slate-700 text-[10px] font-bold text-slate-200 flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${statusLoading ? 'animate-spin' : ''}`} />
                      Verify
                    </button>
                  </div>

                  {isConnected && (
                    <div className="mt-3 text-[11px] text-slate-300 space-y-1 bg-slate-950/50 p-2.5 rounded-xl border border-emerald-500/20">
                      <div><span className="text-slate-500">Account:</span> <span className="font-semibold text-white">{currentProfile.name}</span></div>
                      <div><span className="text-slate-500">Handle:</span> <span className="font-mono text-emerald-400">@{currentProfile.handle}</span></div>
                      <div><span className="text-slate-500">Followers:</span> {currentProfile.followers.toLocaleString()}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sub-tab: OAuth vs Token */}
            <div className="flex border-b border-slate-800 mb-4">
              <button
                type="button"
                onClick={() => setConnectTab('oauth')}
                className={`flex-1 py-2 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                  connectTab === 'oauth'
                    ? 'border-pink-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                Meta OAuth Login
              </button>
              <button
                type="button"
                onClick={() => setConnectTab('token')}
                className={`flex-1 py-2 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                  connectTab === 'token'
                    ? 'border-indigo-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                Direct Token / Graph API
              </button>
            </div>

            {connectTab === 'oauth' ? (
              <div>
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                  Log in with Facebook / Instagram Business in an authorized OAuth popup. Requires <code className="text-pink-400 font-mono text-[10px]">APP_URL</code> to match Meta OAuth settings.
                </p>
                <button
                  type="button"
                  onClick={handleOAuthConnect}
                  disabled={oauthLoading}
                  className="w-full mb-3 px-4 py-3 rounded-xl text-xs font-bold bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 disabled:opacity-60 text-white flex items-center justify-center gap-2 shadow-lg shadow-pink-500/20"
                >
                  <Instagram className="w-4 h-4" />
                  {oauthLoading ? 'Connecting to Instagram...' : isConnected ? 'Reconnect Instagram with Meta OAuth' : 'Connect Instagram with Meta OAuth'}
                </button>

                <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800 text-[10px] text-slate-400 flex items-center justify-between gap-2">
                  <div className="truncate">
                    <span className="text-slate-500">Redirect URI: </span>
                    <span className="font-mono text-pink-400 select-all">
                      {typeof window !== 'undefined' ? `${window.location.origin}/auth/instagram/callback` : '/auth/instagram/callback'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        navigator.clipboard.writeText(`${window.location.origin}/auth/instagram/callback`);
                        showNotification('Redirect URI copied to clipboard!');
                      }
                    }}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold shrink-0"
                  >
                    Copy
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleDirectTokenConnect} className="space-y-3 mb-3">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Connect directly using an Instagram User Token (<code className="text-pink-400 font-mono text-[10px]">IGAAv...</code>) or Meta Graph API Token (<code className="text-indigo-400 font-mono text-[10px]">EAA...</code>). Token is verified live with Meta and encrypted in SQLite with AES-256-GCM.
                </p>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Instagram Account ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 29026007403754793 (auto-detected if omitted)"
                    value={directAccountId}
                    onChange={(e) => setDirectAccountId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-pink-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Instagram / Meta Access Token (Required)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Paste IGAAv... or EAAB... token here"
                    value={directToken}
                    onChange={(e) => setDirectToken(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-pink-500 font-mono"
                  />
                </div>
                <button
                  type="submit"
                  disabled={tokenLoading || !directToken.trim()}
                  className="w-full px-4 py-2.5 rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white flex items-center justify-center gap-2 shadow-lg shadow-pink-600/20"
                >
                  <Key className="w-4 h-4" />
                  {tokenLoading ? 'Verifying & Saving...' : 'Save & Verify Instagram Token'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* TAB 2: FACEBOOK PAGE CONNECTION */}
        {activeChannel === 'facebook_page' && (
          <div className="space-y-4">
            <div className={`p-4 rounded-2xl border ${
              fbPageStatus.isConnected 
                ? 'bg-emerald-500/10 border-emerald-500/30' 
                : fbPageStatus.isExpired 
                  ? 'bg-amber-500/10 border-amber-500/30' 
                  : 'bg-blue-500/10 border-blue-500/30'
            }`}>
              <div className="flex items-start gap-3">
                <div className={`mt-1 w-3 h-3 rounded-full shrink-0 ${
                  fbPageStatus.isConnected 
                    ? 'bg-emerald-400 shadow-lg shadow-emerald-400/40' 
                    : fbPageStatus.isExpired 
                      ? 'bg-amber-400 shadow-lg shadow-amber-400/40 animate-pulse' 
                      : 'bg-blue-400'
                }`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className={`text-sm font-bold ${
                        fbPageStatus.isConnected 
                          ? 'text-emerald-300' 
                          : fbPageStatus.isExpired 
                            ? 'text-amber-300' 
                            : 'text-blue-300'
                      }`}>
                        {fbPageStatus.isConnected 
                          ? 'Facebook Page Connected' 
                          : fbPageStatus.isExpired 
                            ? 'Facebook Page Session Expired' 
                            : 'Facebook Page Not Connected'}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {fbPageStatus.isConnected 
                          ? `Ready for simultaneous Reels: "${fbPageStatus.name}"` 
                          : fbPageStatus.isExpired 
                            ? 'Meta Session Expired: Your token expired on Meta. Follow the guide below to generate a Never-Expiring Page Token.' 
                            : 'Provide your Page ID & Page Access Token to broadcast Reels to Facebook Page.'}
                      </p>
                    </div>
                    {(fbPageStatus.isConnected || fbPageStatus.isExpired) && (
                      <button
                        type="button"
                        onClick={handleDisconnectFacebookPage}
                        disabled={fbPageLoading}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-[10px] font-bold text-rose-300 hover:bg-rose-500/20 flex items-center gap-1 disabled:opacity-50"
                      >
                        <Unplug className="w-3 h-3" />
                        Disconnect
                      </button>
                    )}
                  </div>

                  {(fbPageStatus.isConnected || fbPageStatus.isExpired) && fbPageStatus.pageId && (
                    <div className="mt-3 text-[11px] text-slate-300 space-y-1 bg-slate-950/50 p-2.5 rounded-xl border border-blue-500/20">
                      <div><span className="text-slate-500">Page Name:</span> <span className="font-semibold text-white">{fbPageStatus.name}</span></div>
                      <div><span className="text-slate-500">Page ID:</span> <span className="font-mono text-blue-400">{fbPageStatus.pageId}</span></div>
                      {fbPageStatus.isExpired && (
                        <div className="text-amber-400 font-semibold pt-1">
                          ⚠️ Notice: Meta returned token expired error. Auto-cross-posting to Facebook Page is paused until a fresh token is saved.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Auto-Detect Panel (Primary / Recommended) */}
            <div className="space-y-3 bg-gradient-to-b from-blue-950/30 to-slate-950/60 p-4 rounded-2xl border border-blue-500/30 shadow-lg">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  Auto-Detect Facebook Page (Recommended)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Zero Config
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Paste your Facebook Access Token (<code className="text-blue-400 font-mono text-[10px]">EAAB...</code> or <code className="text-blue-400 font-mono text-[10px]">EAA...</code>). The system will automatically detect your Page ID, Page name, and connect it with 1 click.
              </p>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Facebook Access Token (User Token or Page Token)
                </label>
                <textarea
                  rows={2}
                  placeholder="Paste EAAB... or EAA... token here"
                  value={fbAutoDetectToken}
                  onChange={(e) => setFbAutoDetectToken(e.target.value)}
                  className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none font-mono ${
                    fbAutoDetectToken.trim().startsWith('IG')
                      ? 'border-rose-500 focus:border-rose-400'
                      : 'border-slate-800 focus:border-blue-500'
                  }`}
                />
                {fbAutoDetectToken.trim().startsWith('IG') && (
                  <div className="mt-1.5 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300 leading-relaxed">
                    ⚠️ <strong>Instagram Token Detected:</strong> This token begins with <code className="font-mono text-rose-200">IG...</code>. Meta strictly separates Instagram and Facebook Graph APIs. Follow the 60-second guide below to get a Facebook token (<code className="font-mono text-rose-200">EAAB...</code>).
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleAutoDetectFacebook()}
                disabled={fbAutoDetectLoading || !fbAutoDetectToken.trim() || fbAutoDetectToken.trim().startsWith('IG')}
                className="w-full px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 transition-all cursor-pointer"
              >
                <Search className="w-4 h-4" />
                {fbAutoDetectLoading ? 'Detecting Facebook Pages...' : '🔍 Auto-Detect & Connect Facebook Page'}
              </button>

              {/* Discovered Pages List (if user manages multiple pages) */}
              {fbDiscoveredPages.length > 0 && (
                <div className="mt-3 space-y-2 pt-2 border-t border-slate-800">
                  <p className="text-[11px] font-bold text-slate-300">
                    Discovered {fbDiscoveredPages.length} Facebook Pages. Select yours to connect:
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {fbDiscoveredPages.map(page => (
                      <div key={page.id} className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{page.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">ID: {page.id} {page.category ? `• ${page.category}` : ''}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSelectDiscoveredPage(page)}
                          disabled={fbPageLoading}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shrink-0 flex items-center gap-1 shadow-sm"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Connect
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Step-by-Step 60-Second Setup Guide */}
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  Guide: Get a Never-Expiring Facebook Page Token
                </div>
                <div className="flex gap-2">
                  <a
                    href="https://developers.facebook.com/tools/explorer/?method=GET&path=me%2Faccounts%3Ffields%3Did%2Cname%2Caccess_token"
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-[11px] font-bold text-blue-300 flex items-center gap-1 transition-colors"
                  >
                    Graph Explorer
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href="https://developers.facebook.com/tools/debug/accesstoken/"
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-[11px] font-bold text-indigo-300 flex items-center gap-1 transition-colors"
                  >
                    Token Debugger
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
              <div className="text-[11px] text-slate-300 space-y-1.5 leading-relaxed">
                <p>1. Open <strong>Graph Explorer</strong> and select your Meta App.</p>
                <p>2. In the <strong>User or Page</strong> dropdown, choose your <strong>Facebook Page</strong> (or select User Token with <code className="text-blue-300 font-mono">pages_manage_posts</code>, <code className="text-blue-300 font-mono">pages_read_engagement</code>, and <code className="text-blue-300 font-mono">publish_video</code>).</p>
                <p>3. 💡 <strong>How to make it NEVER expire:</strong> Open <a href="https://developers.facebook.com/tools/debug/accesstoken/" target="_blank" rel="noreferrer" className="text-blue-400 underline">Access Token Debugger</a>, paste your user token, click <strong>Extend Access Token</strong> to get a 60-day token. Then in Graph Explorer run <code className="text-blue-300 font-mono">GET /me/accounts?fields=id,name,access_token</code> — the Page token returned has <strong>Expires: Never</strong>!</p>
                <p>4. Paste that <code className="text-blue-300 font-mono">EAAB...</code> token above and click <strong>Auto-Detect</strong>.</p>
              </div>
            </div>

            {/* Manual Entry Fallback */}
            <details className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800 text-xs">
              <summary className="font-bold text-slate-400 cursor-pointer hover:text-white transition-colors">
                Advanced: Manual Page ID & Page Token Entry
              </summary>
              <form onSubmit={handleConnectFacebookPage} className="space-y-3 mt-3 pt-3 border-t border-slate-800">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Facebook Page ID or Username
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 109283746524123 or theuntoldarch"
                    value={fbPageIdInput}
                    onChange={(e) => setFbPageIdInput(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Facebook Page Access Token
                  </label>
                  <textarea
                    rows={2}
                    placeholder="EAAB... or EAA..."
                    value={fbPageTokenInput}
                    onChange={(e) => setFbPageTokenInput(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={fbPageLoading || !fbPageIdInput.trim() || !fbPageTokenInput.trim() || fbPageTokenInput.trim().startsWith('IG')}
                  className="w-full px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white flex items-center justify-center gap-2 border border-slate-700"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {fbPageLoading ? 'Verifying with Meta...' : 'Save Manual Credentials'}
                </button>
              </form>
            </details>
          </div>
        )}

        {/* TAB 3: FACEBOOK USER ACCOUNT (PROFILE) CONNECTION */}
        {activeChannel === 'facebook_account' && (
          <div className="space-y-4">
            <div className={`p-4 rounded-2xl border ${
              fbAccountStatus.isConnected 
                ? 'bg-emerald-500/10 border-emerald-500/30' 
                : fbAccountStatus.isExpired 
                  ? 'bg-amber-500/10 border-amber-500/30' 
                  : 'bg-indigo-500/10 border-indigo-500/30'
            }`}>
              <div className="flex items-start gap-3">
                <div className={`mt-1 w-3 h-3 rounded-full shrink-0 ${
                  fbAccountStatus.isConnected 
                    ? 'bg-emerald-400 shadow-lg shadow-emerald-400/40' 
                    : fbAccountStatus.isExpired 
                      ? 'bg-amber-400 shadow-lg shadow-amber-400/40 animate-pulse' 
                      : 'bg-indigo-400'
                }`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className={`text-sm font-bold ${
                        fbAccountStatus.isConnected 
                          ? 'text-emerald-300' 
                          : fbAccountStatus.isExpired 
                            ? 'text-amber-300' 
                            : 'text-indigo-300'
                      }`}>
                        {fbAccountStatus.isConnected 
                          ? 'Facebook User Profile Connected' 
                          : fbAccountStatus.isExpired 
                            ? 'Facebook User Profile Session Expired' 
                            : 'Facebook User Profile Not Connected'}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {fbAccountStatus.isConnected 
                          ? `Ready for simultaneous Reels: "${fbAccountStatus.name}"` 
                          : fbAccountStatus.isExpired 
                            ? 'Meta Session Expired: Personal profile tokens expire after 60 days. Reconnect with a new User Token below.' 
                            : 'Provide your User ID & User Access Token with video publish permission.'}
                      </p>
                    </div>
                    {(fbAccountStatus.isConnected || fbAccountStatus.isExpired) && (
                      <button
                        type="button"
                        onClick={handleDisconnectFacebookAccount}
                        disabled={fbAccountLoading}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-[10px] font-bold text-rose-300 hover:bg-rose-500/20 flex items-center gap-1 disabled:opacity-50"
                      >
                        <Unplug className="w-3 h-3" />
                        Disconnect
                      </button>
                    )}
                  </div>

                  {(fbAccountStatus.isConnected || fbAccountStatus.isExpired) && fbAccountStatus.userId && (
                    <div className="mt-3 text-[11px] text-slate-300 space-y-1 bg-slate-950/50 p-2.5 rounded-xl border border-indigo-500/20">
                      <div><span className="text-slate-500">Profile Name:</span> <span className="font-semibold text-white">{fbAccountStatus.name}</span></div>
                      <div><span className="text-slate-500">User ID:</span> <span className="font-mono text-indigo-400">{fbAccountStatus.userId}</span></div>
                      {fbAccountStatus.isExpired && (
                        <div className="text-amber-400 font-semibold pt-1">
                          ⚠️ Notice: Meta returned token expired error. Auto-cross-posting to Facebook Profile is paused.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <form onSubmit={handleConnectFacebookAccount} className="space-y-3 bg-slate-950/40 p-4 rounded-2xl border border-slate-800">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-indigo-400" />
                {fbAccountStatus.isConnected ? 'Update Facebook Profile Credentials' : 'Connect Facebook Profile'}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Broadcasts videos directly to your personal Facebook Profile feed. Can also be set in <code className="text-indigo-400 font-mono text-[10px]">.env</code> as <code className="text-indigo-400 font-mono text-[10px]">FACEBOOK_USER_ID</code> & <code className="text-indigo-400 font-mono text-[10px]">FACEBOOK_USER_ACCESS_TOKEN</code>.
              </p>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Facebook User ID (Leave blank or "me" for authenticated user)
                </label>
                <input
                  type="text"
                  placeholder="me or user ID"
                  value={fbUserIdInput}
                  onChange={(e) => setFbUserIdInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Facebook User Access Token
                </label>
                <textarea
                  rows={2}
                  placeholder="EAA..."
                  value={fbUserTokenInput}
                  onChange={(e) => setFbUserTokenInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={fbAccountLoading || !fbUserTokenInput.trim()}
                className="w-full px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
              >
                <CheckCircle2 className="w-4 h-4" />
                {fbAccountLoading ? 'Verifying with Meta...' : 'Save & Verify Facebook Profile'}
              </button>
            </form>
          </div>
        )}

        {/* Security Assurance */}
        <div className="mt-4 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
          <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>
            Tokens are verified directly against Meta Graph API and encrypted at rest with AES-256-GCM. Reels are pushed simultaneously across all connected channels.
          </span>
        </div>

        {/* Modal Footer */}
        <div className="pt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isConnected && activeChannel === 'instagram' && (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isDisconnecting || oauthLoading}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Unplug className="w-3 h-3" />
                {isDisconnecting ? 'Disconnecting...' : 'Disconnect Instagram'}
              </button>
            )}

            {onResetToZero && activeChannel === 'instagram' && (
              <button
                type="button"
                onClick={handleReset}
                disabled={isResetting || isDisconnecting || oauthLoading}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-300 hover:bg-slate-800 border border-slate-800 flex items-center gap-1.5 disabled:opacity-50"
                title="Reset local metrics and disconnect Instagram"
              >
                <RotateCcw className={`w-3 h-3 ${isResetting ? 'animate-spin' : ''}`} />
                Reset
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
