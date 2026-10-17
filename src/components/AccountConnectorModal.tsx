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
  UserCheck
} from 'lucide-react';
import { AccountAnalytics } from '../types';

interface AccountConnectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProfile: AccountAnalytics['profile'];
  isConnected: boolean;
  onResetToZero?: () => Promise<void>;
  onOAuthConnected?: (profile: AccountAnalytics['profile']) => Promise<void>;
  onRefreshStatus: () => Promise<any>;
  onDisconnect: () => Promise<void>;
}

interface FacebookStatus {
  isConnected: boolean;
  pageId?: string;
  name?: string;
  username?: string;
}

interface FacebookUserStatus {
  isConnected: boolean;
  userId?: string;
  name?: string;
  username?: string;
}

export const AccountConnectorModal: React.FC<AccountConnectorModalProps> = ({
  isOpen,
  onClose,
  currentProfile,
  isConnected,
  onResetToZero,
  onOAuthConnected,
  onRefreshStatus,
  onDisconnect
}) => {
  const [activeChannel, setActiveChannel] = useState<'instagram' | 'facebook_page' | 'facebook_account'>('instagram');
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

      const popup = window.open(
        data.url,
        'texvic-instagram-oauth',
        'width=620,height=760,noopener,noreferrer'
      );

      if (!popup) {
        throw new Error('Popup was blocked. Allow popups for this site and try again.');
      }

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          window.removeEventListener('message', onMessage);
          reject(new Error('Instagram connection timed out.'));
        }, 180000);

        const onMessage = async (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;

          if (event.data?.type === 'OAUTH_AUTH_FAILED') {
            window.clearTimeout(timeout);
            window.removeEventListener('message', onMessage);
            reject(new Error(event.data.error || 'Instagram authorization failed.'));
            return;
          }

          if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
            window.clearTimeout(timeout);
            window.removeEventListener('message', onMessage);

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

  // Connect Facebook Page
  const handleConnectFacebookPage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fbPageIdInput.trim() || !fbPageTokenInput.trim()) {
      setErrorMsg('Please enter both Facebook Page ID and Page Access Token.');
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
              <div className={`w-2 h-2 rounded-full ${fbPageStatus.isConnected ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-slate-600'}`} />
            </div>
            <p className="text-[11px] font-bold text-white truncate">FB Page</p>
            <p className={`text-[10px] truncate ${fbPageStatus.isConnected ? 'text-emerald-400 font-semibold' : 'text-slate-500'}`}>
              {fbPageStatus.isConnected ? (fbPageStatus.name || 'Connected') : 'Disconnected'}
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
              <div className={`w-2 h-2 rounded-full ${fbAccountStatus.isConnected ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-slate-600'}`} />
            </div>
            <p className="text-[11px] font-bold text-white truncate">FB Profile</p>
            <p className={`text-[10px] truncate ${fbAccountStatus.isConnected ? 'text-emerald-400 font-semibold' : 'text-slate-500'}`}>
              {fbAccountStatus.isConnected ? (fbAccountStatus.name || 'Connected') : 'Disconnected'}
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
              </div>
            ) : (
              <form onSubmit={handleDirectTokenConnect} className="space-y-3 mb-3">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Connect directly using an Instagram Graph API token. Token is verified and encrypted in SQLite with AES-256-GCM.
                </p>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Instagram Account ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 29026007403754793"
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
                    placeholder="IGAAv..."
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
            <div className={`p-4 rounded-2xl border ${fbPageStatus.isConnected ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-blue-500/10 border-blue-500/30'}`}>
              <div className="flex items-start gap-3">
                <div className={`mt-1 w-3 h-3 rounded-full shrink-0 ${fbPageStatus.isConnected ? 'bg-emerald-400 shadow-lg shadow-emerald-400/40' : 'bg-blue-400'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className={`text-sm font-bold ${fbPageStatus.isConnected ? 'text-emerald-300' : 'text-blue-300'}`}>
                        {fbPageStatus.isConnected ? 'Facebook Page Connected' : 'Facebook Page Not Connected'}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {fbPageStatus.isConnected 
                          ? `Ready for simultaneous Reels: "${fbPageStatus.name}"` 
                          : 'Provide your Page ID & Page Access Token to broadcast Reels to Facebook Page.'}
                      </p>
                    </div>
                    {fbPageStatus.isConnected && (
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

                  {fbPageStatus.isConnected && (
                    <div className="mt-3 text-[11px] text-slate-300 space-y-1 bg-slate-950/50 p-2.5 rounded-xl border border-blue-500/20">
                      <div><span className="text-slate-500">Page Name:</span> <span className="font-semibold text-white">{fbPageStatus.name}</span></div>
                      <div><span className="text-slate-500">Page ID:</span> <span className="font-mono text-blue-400">{fbPageStatus.pageId}</span></div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <form onSubmit={handleConnectFacebookPage} className="space-y-3 bg-slate-950/40 p-4 rounded-2xl border border-slate-800">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <Facebook className="w-4 h-4 text-blue-400" />
                {fbPageStatus.isConnected ? 'Update Facebook Page Credentials' : 'Connect Facebook Page'}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Reels are uploaded concurrently to your Facebook Page using the official Facebook Video Reels API. Can also be set in <code className="text-blue-400 font-mono text-[10px]">.env</code> as <code className="text-blue-400 font-mono text-[10px]">FACEBOOK_PAGE_ID</code> & <code className="text-blue-400 font-mono text-[10px]">FACEBOOK_PAGE_ACCESS_TOKEN</code>.
              </p>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Facebook Page ID (Numeric)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 109283746524123"
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
                  placeholder="EAA..."
                  value={fbPageTokenInput}
                  onChange={(e) => setFbPageTokenInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={fbPageLoading || !fbPageIdInput.trim() || !fbPageTokenInput.trim()}
                className="w-full px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
              >
                <CheckCircle2 className="w-4 h-4" />
                {fbPageLoading ? 'Verifying with Meta...' : 'Save & Verify Facebook Page'}
              </button>
            </form>
          </div>
        )}

        {/* TAB 3: FACEBOOK USER ACCOUNT (PROFILE) CONNECTION */}
        {activeChannel === 'facebook_account' && (
          <div className="space-y-4">
            <div className={`p-4 rounded-2xl border ${fbAccountStatus.isConnected ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-indigo-500/10 border-indigo-500/30'}`}>
              <div className="flex items-start gap-3">
                <div className={`mt-1 w-3 h-3 rounded-full shrink-0 ${fbAccountStatus.isConnected ? 'bg-emerald-400 shadow-lg shadow-emerald-400/40' : 'bg-indigo-400'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className={`text-sm font-bold ${fbAccountStatus.isConnected ? 'text-emerald-300' : 'text-indigo-300'}`}>
                        {fbAccountStatus.isConnected ? 'Facebook User Profile Connected' : 'Facebook User Profile Not Connected'}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {fbAccountStatus.isConnected 
                          ? `Ready for simultaneous Reels: "${fbAccountStatus.name}"` 
                          : 'Provide your User ID & User Access Token with video publish permission.'}
                      </p>
                    </div>
                    {fbAccountStatus.isConnected && (
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

                  {fbAccountStatus.isConnected && (
                    <div className="mt-3 text-[11px] text-slate-300 space-y-1 bg-slate-950/50 p-2.5 rounded-xl border border-indigo-500/20">
                      <div><span className="text-slate-500">Profile Name:</span> <span className="font-semibold text-white">{fbAccountStatus.name}</span></div>
                      <div><span className="text-slate-500">User ID:</span> <span className="font-mono text-indigo-400">{fbAccountStatus.userId}</span></div>
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
