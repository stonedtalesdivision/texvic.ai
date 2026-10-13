import React, { useEffect, useState } from 'react';
import { Instagram, CheckCircle2, X, Shield, RefreshCw, RotateCcw, Unplug, AlertCircle, Key, Globe } from 'lucide-react';
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
  const [connectTab, setConnectTab] = useState<'oauth' | 'token'>('oauth');
  const [oauthLoading, setOauthLoading] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [directAccountId, setDirectAccountId] = useState('');
  const [directToken, setDirectToken] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setOauthError(null);
    setTokenError(null);
    setStatusError(null);
    setStatusLoading(true);

    onRefreshStatus()
      .then((data) => {
        if (cancelled) return;
        if (!data?.isConnected && data?.error) {
          setStatusError(data.error);
        }
      })
      .catch((error: any) => {
        if (!cancelled) setStatusError(error?.message || 'Could not verify Instagram connection.');
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, onRefreshStatus]);

  if (!isOpen) return null;

  const handleOAuthConnect = async () => {
    setOauthLoading(true);
    setOauthError(null);
    setStatusError(null);

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

      setSuccess('Instagram authorization verified successfully.');
      window.setTimeout(() => setSuccess(null), 3000);
    } catch (error: any) {
      setOauthError(error?.message || 'Instagram connection failed.');
    } finally {
      setOauthLoading(false);
    }
  };

  const handleDirectTokenConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directToken.trim()) {
      setTokenError('Please enter a valid Meta Access Token.');
      return;
    }

    setTokenLoading(true);
    setTokenError(null);
    setStatusError(null);

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

      setSuccess(`Connected successfully to @${data.account?.username || 'instagram'}!`);
      const status = await onRefreshStatus();
      if (status?.account) {
        await onOAuthConnected?.(status.account);
      }
      setDirectToken('');
      window.setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setTokenError(err?.message || 'Failed to connect token.');
    } finally {
      setTokenLoading(false);
    }
  };

  const handleRefresh = async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const data = await onRefreshStatus();
      if (!data?.isConnected && data?.error) {
        setStatusError(data.error);
      }
    } catch (error: any) {
      setStatusError(error?.message || 'Could not verify Instagram connection.');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    setStatusError(null);
    try {
      await onDisconnect();
    } catch (error: any) {
      setStatusError(error?.message || 'Could not disconnect Instagram.');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleReset = async () => {
    if (!onResetToZero) return;
    setIsResetting(true);
    setStatusError(null);
    try {
      await onResetToZero();
    } catch (error: any) {
      setStatusError(error?.message || 'Could not reset the account.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600 flex items-center justify-center shadow-lg shadow-pink-500/20">
            <Instagram className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Instagram Connection</h2>
            <p className="text-xs text-slate-400">Real Meta Graph API connection — encrypted token vault</p>
          </div>
        </div>

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

        {statusError && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{statusError}</span>
          </div>
        )}

        {oauthError && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{oauthError}</span>
          </div>
        )}

        {tokenError && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{tokenError}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {success}
          </div>
        )}

        {/* Tab Selector */}
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
              Connect directly using a Meta System User Token or Graph API Explorer token. Token is verified and encrypted in SQLite with AES-256-GCM.
            </p>
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Instagram Business Account ID (Optional if linked to Page)
              </label>
              <input
                type="text"
                placeholder="e.g. 17841400000000000"
                value={directAccountId}
                onChange={(e) => setDirectAccountId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Meta Access Token (Required)
              </label>
              <textarea
                rows={3}
                placeholder="EAABw..."
                value={directToken}
                onChange={(e) => setDirectToken(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={tokenLoading || !directToken.trim()}
              className="w-full px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
            >
              <Key className="w-4 h-4" />
              {tokenLoading ? 'Verifying & Saving...' : 'Save & Verify Token'}
            </button>
          </form>
        )}

        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
          <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>
            TEXVIC verifies access tokens directly against Meta before showing the account as connected. Stored tokens are encrypted at rest with AES-256-GCM.
          </span>
        </div>

        <div className="pt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isConnected && (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isDisconnecting || oauthLoading}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Unplug className="w-3 h-3" />
                {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            )}

            {onResetToZero && (
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

