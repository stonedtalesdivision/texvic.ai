import React, { useEffect, useState } from 'react';
import { 
  Instagram, 
  Facebook, 
  Youtube,
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
  Check,
  Video
} from 'lucide-react';
import { AccountAnalytics } from '../types';

export const TikTokIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.82 4.49 6.31 6.31 0 0 0 1.86-4.49V8.71a8.21 8.21 0 0 0 4.91 1.63V6.89a4.84 4.84 0 0 1-1-.2z"/>
  </svg>
);

interface AccountConnectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProfile: AccountAnalytics['profile'];
  isConnected: boolean;
  initialChannel?: 'instagram' | 'facebook_page' | 'facebook_account' | 'youtube' | 'tiktok';
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

interface YouTubeStatus {
  isConnected: boolean;
  isExpired?: boolean;
  isAppConfigured?: boolean;
  savedClientId?: string;
  channelId?: string;
  title?: string;
  customUrl?: string;
  subscriberCount?: number;
  avatarUrl?: string;
  defaultPrivacy?: 'public' | 'unlisted' | 'private';
  error?: string;
}

interface TikTokStatus {
  isConnected: boolean;
  isExpired?: boolean;
  isAppConfigured?: boolean;
  savedClientKey?: string;
  openId?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  followerCount?: number;
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
  const [activeChannel, setActiveChannel] = useState<'instagram' | 'facebook_page' | 'facebook_account' | 'youtube' | 'tiktok'>(initialChannel);
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

  // YouTube Channel fields
  const [ytStatus, setYtStatus] = useState<YouTubeStatus>({ isConnected: false });
  const [ytLoading, setYtLoading] = useState(false);
  const [ytOauthLoading, setYtOauthLoading] = useState(false);
  const [ytClientId, setYtClientId] = useState('');
  const [ytClientSecret, setYtClientSecret] = useState('');
  const [ytRefreshToken, setYtRefreshToken] = useState('');
  const [ytDirectToken, setYtDirectToken] = useState('');
  const [ytPrivacy, setYtPrivacy] = useState<'public' | 'unlisted' | 'private'>('public');
  const [editingYtAppCreds, setEditingYtAppCreds] = useState(false);
  const [ytFallbackUrl, setYtFallbackUrl] = useState<string | null>(null);
  const [ytLocalError, setYtLocalError] = useState<string | null>(null);
  const [ytUnpostedCount, setYtUnpostedCount] = useState<number>(0);
  const [isModalBatchSyncing, setIsModalBatchSyncing] = useState<boolean>(false);
  const [modalBatchMsg, setModalBatchMsg] = useState<string | null>(null);

  const fetchModalYtSyncCount = async () => {
    try {
      const res = await fetch('/api/reels/youtube-sync-status');
      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        setYtUnpostedCount(Number(data.unpostedCount || 0));
      }
    } catch {}
  };

  // TikTok Account fields
  const [tiktokStatus, setTiktokStatus] = useState<TikTokStatus>({ isConnected: false });
  const [tiktokLoading, setTiktokLoading] = useState(false);
  const [tiktokOauthLoading, setTiktokOauthLoading] = useState(false);
  const [tiktokDirectToken, setTiktokDirectToken] = useState('');
  const [tiktokClientKey, setTiktokClientKey] = useState('');
  const [tiktokClientSecret, setTiktokClientSecret] = useState('');
  const [editingTiktokAppCreds, setEditingTiktokAppCreds] = useState(false);
  const [tiktokFallbackUrl, setTiktokFallbackUrl] = useState<string | null>(null);
  const [tiktokLocalError, setTiktokLocalError] = useState<string | null>(null);

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

  // Fetch YouTube connection status
  const fetchYouTubeStatus = async () => {
    try {
      const res = await fetch('/api/auth/youtube/status');
      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        if (data.isConnected && data.channel) {
          setYtStatus({
            isConnected: true,
            isAppConfigured: Boolean(data.isAppConfigured),
            savedClientId: data.clientId || '',
            channelId: data.channel.channelId,
            title: data.channel.title,
            customUrl: data.channel.customUrl,
            subscriberCount: data.channel.subscriberCount,
            avatarUrl: data.channel.avatarUrl,
            defaultPrivacy: data.channel.defaultPrivacy || 'public'
          });
          if (data.channel.defaultPrivacy) {
            setYtPrivacy(data.channel.defaultPrivacy);
          }
        } else {
          setYtStatus({
            isConnected: false,
            isAppConfigured: Boolean(data.isAppConfigured),
            savedClientId: data.clientId || '',
            isExpired: Boolean(data.isExpired),
            error: data.error
          });
        }
        if (data.clientId && !ytClientId) {
          setYtClientId(data.clientId);
        }
      }
    } catch {}
  };

  // Fetch TikTok connection status
  const fetchTikTokStatus = async () => {
    try {
      const res = await fetch('/api/auth/tiktok/status');
      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        if (data.isConnected && data.account) {
          setTiktokStatus({
            isConnected: true,
            isAppConfigured: Boolean(data.isAppConfigured),
            savedClientKey: data.clientKey || '',
            openId: data.account.openId,
            username: data.account.username,
            displayName: data.account.displayName,
            avatarUrl: data.account.avatarUrl,
            followerCount: data.account.followerCount
          });
        } else {
          setTiktokStatus({
            isConnected: false,
            isAppConfigured: Boolean(data.isAppConfigured),
            savedClientKey: data.clientKey || '',
            isExpired: Boolean(data.isExpired),
            error: data.error
          });
        }
        if (data.clientKey && !tiktokClientKey) {
          setTiktokClientKey(data.clientKey);
        }
      }
    } catch {}
  };

  useEffect(() => {
    if (!isOpen) return;

    if (initialChannel) {
      setActiveChannel(initialChannel);
    }

    let cancelled = false;
    setErrorMsg(null);
    setStatusLoading(true);

    fetchModalYtSyncCount();
    Promise.allSettled([
      onRefreshStatus(),
      fetchFacebookStatus(),
      fetchYouTubeStatus(),
      fetchTikTokStatus()
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

  // ----------------------------------------------------
  // INSTAGRAM HANDLERS
  // ----------------------------------------------------
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

        const pollInterval = window.setInterval(async () => {
          if (popup.closed) {
            cleanup();
            try {
              const status = await onRefreshStatus();
              if (status?.isConnected && status?.account) {
                await onOAuthConnected?.(status.account);
                resolve();
                return;
              }
            } catch {}
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

          if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && (!event.data.platform || event.data.platform === 'instagram')) {
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
      setErrorMsg('Meta Graph API Access Token is required.');
      return;
    }

    setTokenLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/instagram/direct-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: directAccountId.trim(),
          accessToken: directToken.trim()
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Direct token validation failed.');
      }

      await onRefreshStatus();
      if (data.account) {
        await onOAuthConnected?.(data.account);
      }
      setDirectToken('');
      showNotification('Connected directly using Meta Graph API Token.');
    } catch (error: any) {
      setErrorMsg(error?.message || 'Failed to connect via direct token.');
    } finally {
      setTokenLoading(false);
    }
  };

  // ----------------------------------------------------
  // FACEBOOK PAGE & USER HANDLERS
  // ----------------------------------------------------
  const handleAutoDetectPages = async () => {
    if (!fbAutoDetectToken.trim()) {
      setErrorMsg('Please paste any Facebook Token to auto-detect pages.');
      return;
    }

    setFbAutoDetectLoading(true);
    setErrorMsg(null);
    setFbDiscoveredPages([]);

    try {
      const res = await fetch('/api/auth/facebook/auto-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: fbAutoDetectToken.trim() })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not auto-detect pages from token.');
      }

      setFbDiscoveredPages(data.discoveredPages || []);
      if (data.connectedPage) {
        setFbPageStatus({
          isConnected: true,
          pageId: data.connectedPage.id,
          name: data.connectedPage.name
        });
        setFbPageIdInput(data.connectedPage.id);
        onFacebookStatusChanged?.(true);
        showNotification(`Auto-connected Facebook Page "${data.connectedPage.name}"!`);
      } else if (data.discoveredPages?.length > 0) {
        showNotification(`Found ${data.discoveredPages.length} Facebook Page(s). Select one below.`);
      } else {
        setErrorMsg('No managed Facebook Pages found associated with this token.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Auto-detection failed.');
    } finally {
      setFbAutoDetectLoading(false);
    }
  };

  const handleConnectDiscoveredPage = async (page: any) => {
    setFbPageLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/facebook/connect-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: page.id,
          accessToken: page.access_token,
          pageName: page.name
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to connect selected page.');
      }

      setFbPageStatus({
        isConnected: true,
        pageId: page.id,
        name: page.name
      });
      onFacebookStatusChanged?.(true);
      showNotification(`Connected Facebook Page "${page.name}"!`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to connect page.');
    } finally {
      setFbPageLoading(false);
    }
  };

  const handleManualConnectPage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fbPageTokenInput.trim()) {
      setErrorMsg('Page Access Token is required.');
      return;
    }

    setFbPageLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/facebook/connect-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: fbPageIdInput.trim() || undefined,
          accessToken: fbPageTokenInput.trim()
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to connect Facebook Page.');
      }

      setFbPageStatus({
        isConnected: true,
        pageId: data.page?.id || fbPageIdInput,
        name: data.page?.name || 'Facebook Page'
      });
      onFacebookStatusChanged?.(true);
      setFbPageTokenInput('');
      showNotification(`Facebook Page "${data.page?.name || 'Page'}" connected successfully!`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to connect Facebook Page.');
    } finally {
      setFbPageLoading(false);
    }
  };

  const handleConnectFacebookAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fbUserTokenInput.trim()) {
      setErrorMsg('Facebook User Access Token is required.');
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

      setFbAccountStatus({
        isConnected: true,
        userId: data.account?.id || fbUserIdInput,
        name: data.account?.name || 'Facebook User'
      });
      setFbUserTokenInput('');
      showNotification(`Facebook Profile "${data.account?.name || 'User'}" connected!`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to connect Facebook Profile.');
    } finally {
      setFbAccountLoading(false);
    }
  };

  // ----------------------------------------------------
  // YOUTUBE SHORTS HANDLERS
  // ----------------------------------------------------
  const handleYouTubeOAuthConnect = async () => {
    setYtOauthLoading(true);
    setYtLocalError(null);
    setErrorMsg(null);
    setYtFallbackUrl(null);

    // If OAuth app is not configured yet and fields are empty, require Client ID
    if (!ytStatus.isAppConfigured && !ytClientId.trim()) {
      setYtOauthLoading(false);
      setYtLocalError('Please enter your Google OAuth Client ID to start Google Login.');
      return;
    }

    // 1. Immediately create a blank popup synchronously to guarantee it is not blocked by the browser
    let popup: Window | null = null;
    try {
      popup = window.open('about:blank', 'texvic-youtube-oauth', 'width=620,height=760');
    } catch {
      popup = null;
    }

    try {
      const q = new URLSearchParams();
      if (ytClientId.trim()) q.set('clientId', ytClientId.trim());
      if (ytClientSecret.trim()) q.set('clientSecret', ytClientSecret.trim());
      const qs = q.toString() ? `?${q.toString()}` : '';

      const res = await fetch(`/api/auth/youtube/url${qs}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.url) {
        if (popup && !popup.closed) popup.close();
        throw new Error(data.error || 'Could not start YouTube OAuth.');
      }

      // If popup was blocked by strict browser setting, offer direct link
      if (!popup || popup.closed) {
        setYtFallbackUrl(data.url);
        throw new Error('Your browser blocked the popup. Click the button below to open Google Login directly.');
      }

      // Direct popup to Google OAuth URL
      popup.location.href = data.url;
      try { popup.focus(); } catch {}

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
          reject(new Error('YouTube connection timed out.'));
        }, 180000);

        const pollInterval = window.setInterval(async () => {
          if (popup.closed) {
            cleanup();
            await fetchYouTubeStatus();
            resolve();
          }
        }, 1000);

        const onMessage = async (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;

          if (event.data?.type === 'OAUTH_AUTH_FAILED' && event.data.platform === 'youtube') {
            cleanup();
            reject(new Error(event.data.error || 'YouTube authorization failed.'));
            return;
          }

          if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data.platform === 'youtube') {
            cleanup();
            await fetchYouTubeStatus();
            resolve();
          }
        };

        window.addEventListener('message', onMessage);
      });

      showNotification('YouTube Channel connected successfully!');
      setEditingYtAppCreds(false);
    } catch (err: any) {
      setYtLocalError(err?.message || 'YouTube connection failed.');
    } finally {
      setYtOauthLoading(false);
    }
  };

  const handleYouTubeDirectConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ytDirectToken.trim() && !ytRefreshToken.trim()) {
      setErrorMsg('YouTube Access Token or Refresh Token is required.');
      return;
    }

    setYtLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/youtube/direct-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: ytClientId.trim() || undefined,
          clientSecret: ytClientSecret.trim() || undefined,
          refreshToken: ytRefreshToken.trim() || undefined,
          accessToken: ytDirectToken.trim() || undefined,
          defaultPrivacy: ytPrivacy
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to verify YouTube credentials.');
      }

      await fetchYouTubeStatus();
      setYtDirectToken('');
      showNotification(`Connected YouTube Channel "${data.channel?.title || 'Channel'}"!`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to connect YouTube channel.');
    } finally {
      setYtLoading(false);
    }
  };

  const handleModalBatchSync = async () => {
    if (isModalBatchSyncing) return;
    setIsModalBatchSyncing(true);
    setModalBatchMsg(null);
    try {
      const res = await fetch('/api/reels/sync-youtube-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 6 })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to batch sync to YouTube Shorts.');
      }
      setModalBatchMsg(data.message || 'Batch sync completed!');
      await fetchModalYtSyncCount();
      await fetchYouTubeStatus();
      showNotification(data.message || 'Synced to YouTube Shorts!');
    } catch (err: any) {
      setModalBatchMsg(err?.message || 'Batch sync failed.');
    } finally {
      setIsModalBatchSyncing(false);
    }
  };

  const handleYouTubeDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await fetch('/api/auth/youtube/disconnect', { method: 'POST' });
      setYtStatus({ isConnected: false });
      showNotification('YouTube disconnected successfully.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to disconnect YouTube.');
    } finally {
      setIsDisconnecting(false);
    }
  };

  // ----------------------------------------------------
  // TIKTOK HANDLERS
  // ----------------------------------------------------
  const handleTikTokOAuthConnect = async () => {
    setTiktokOauthLoading(true);
    setTiktokLocalError(null);
    setErrorMsg(null);
    setTiktokFallbackUrl(null);

    if (!tiktokStatus.isAppConfigured && !tiktokClientKey.trim()) {
      setTiktokOauthLoading(false);
      setTiktokLocalError('Please enter your TikTok App Client Key to start authorization.');
      return;
    }

    let popup: Window | null = null;
    try {
      popup = window.open('about:blank', 'texvic-tiktok-oauth', 'width=620,height=760');
    } catch {
      popup = null;
    }

    try {
      const q = new URLSearchParams();
      if (tiktokClientKey.trim()) q.set('clientKey', tiktokClientKey.trim());
      if (tiktokClientSecret.trim()) q.set('clientSecret', tiktokClientSecret.trim());
      const qs = q.toString() ? `?${q.toString()}` : '';

      const res = await fetch(`/api/auth/tiktok/url${qs}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.url) {
        if (popup && !popup.closed) popup.close();
        throw new Error(data.error || 'Could not start TikTok OAuth.');
      }

      if (!popup || popup.closed) {
        setTiktokFallbackUrl(data.url);
        throw new Error('Your browser blocked the popup. Click the button below to open TikTok Login directly.');
      }

      popup.location.href = data.url;
      try { popup.focus(); } catch {}

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
          reject(new Error('TikTok connection timed out.'));
        }, 180000);

        const pollInterval = window.setInterval(async () => {
          if (popup.closed) {
            cleanup();
            await fetchTikTokStatus();
            resolve();
          }
        }, 1000);

        const onMessage = async (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;

          if (event.data?.type === 'OAUTH_AUTH_FAILED' && event.data.platform === 'tiktok') {
            cleanup();
            reject(new Error(event.data.error || 'TikTok authorization failed.'));
            return;
          }

          if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data.platform === 'tiktok') {
            cleanup();
            await fetchTikTokStatus();
            resolve();
          }
        };

        window.addEventListener('message', onMessage);
      });

      showNotification('TikTok account connected successfully!');
      setEditingTiktokAppCreds(false);
    } catch (err: any) {
      setTiktokLocalError(err?.message || 'TikTok connection failed.');
    } finally {
      setTiktokOauthLoading(false);
    }
  };

  const handleTikTokDirectConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tiktokDirectToken.trim()) {
      setErrorMsg('TikTok Access Token is required.');
      return;
    }

    setTiktokLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/tiktok/direct-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: tiktokDirectToken.trim() })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to verify TikTok credentials.');
      }

      await fetchTikTokStatus();
      setTiktokDirectToken('');
      showNotification(`Connected TikTok account "${data.account?.displayName || 'Creator'}"!`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to connect TikTok.');
    } finally {
      setTiktokLoading(false);
    }
  };

  const handleTikTokDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await fetch('/api/auth/tiktok/disconnect', { method: 'POST' });
      setTiktokStatus({ isConnected: false });
      showNotification('TikTok disconnected successfully.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to disconnect TikTok.');
    } finally {
      setIsDisconnecting(false);
    }
  };

  // ----------------------------------------------------
  // GLOBAL DISCONNECT & RESET
  // ----------------------------------------------------
  const handleDisconnectFacebook = async (target: 'page' | 'account') => {
    setIsDisconnecting(true);
    setErrorMsg(null);
    try {
      await fetch('/api/auth/facebook/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target })
      });
      if (target === 'page') {
        setFbPageStatus({ isConnected: false });
        onFacebookStatusChanged?.(false);
        showNotification('Facebook Page disconnected.');
      } else {
        setFbAccountStatus({ isConnected: false });
        showNotification('Facebook Profile disconnected.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Disconnect failed.');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (activeChannel === 'youtube') return handleYouTubeDisconnect();
    if (activeChannel === 'tiktok') return handleTikTokDisconnect();
    if (activeChannel === 'facebook_page') return handleDisconnectFacebook('page');
    if (activeChannel === 'facebook_account') return handleDisconnectFacebook('account');

    setIsDisconnecting(true);
    setErrorMsg(null);
    try {
      await onDisconnect();
      showNotification('Instagram disconnected.');
    } catch (error: any) {
      setErrorMsg(error?.message || 'Could not disconnect account.');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset local engagement metrics and disconnect Instagram?')) return;
    setIsResetting(true);
    setErrorMsg(null);
    try {
      await onResetToZero?.();
      showNotification('Account reset successfully.');
    } catch (error: any) {
      setErrorMsg(error?.message || 'Reset failed.');
    } finally {
      setIsResetting(false);
    }
  };

  const handleRefresh = async () => {
    setStatusLoading(true);
    setErrorMsg(null);
    try {
      if (activeChannel === 'instagram') {
        const data = await onRefreshStatus();
        if (data?.isConnected) showNotification('Instagram account verified.');
      } else if (activeChannel === 'facebook_page' || activeChannel === 'facebook_account') {
        await fetchFacebookStatus();
        showNotification('Facebook connection verified.');
      } else if (activeChannel === 'youtube') {
        await fetchYouTubeStatus();
        showNotification('YouTube Channel verified.');
      } else if (activeChannel === 'tiktok') {
        await fetchTikTokStatus();
        showNotification('TikTok account verified.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Verification failed.');
    } finally {
      setStatusLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-500 via-purple-600 to-red-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Share2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Simultaneous Multi-Platform Publishing</h2>
            <p className="text-xs text-slate-400">Post Reels concurrently to Instagram, Facebook, YouTube Shorts & TikTok</p>
          </div>
        </div>

        {/* 5-Channel Platform Status Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
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
              {fbPageStatus.isConnected ? (fbPageStatus.name || 'Connected') : fbPageStatus.isExpired ? 'Expired' : 'Disconnected'}
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
              {fbAccountStatus.isConnected ? (fbAccountStatus.name || 'Connected') : fbAccountStatus.isExpired ? 'Expired' : 'Disconnected'}
            </p>
          </button>

          {/* YouTube Shorts Pill */}
          <button
            type="button"
            onClick={() => setActiveChannel('youtube')}
            className={`p-2.5 rounded-xl border text-left transition-all ${
              activeChannel === 'youtube' 
                ? 'bg-red-500/15 border-red-500/40' 
                : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <Youtube className="w-3.5 h-3.5 text-red-500" />
              <div className={`w-2 h-2 rounded-full ${
                ytStatus.isConnected 
                  ? 'bg-emerald-400 shadow-sm shadow-emerald-400' 
                  : ytStatus.isExpired 
                    ? 'bg-amber-400 animate-pulse' 
                    : 'bg-slate-600'
              }`} />
            </div>
            <p className="text-[11px] font-bold text-white truncate">YouTube</p>
            <p className={`text-[10px] truncate ${
              ytStatus.isConnected 
                ? 'text-emerald-400 font-semibold' 
                : ytStatus.isExpired 
                  ? 'text-amber-400 font-semibold' 
                  : 'text-slate-500'
            }`}>
              {ytStatus.isConnected ? (ytStatus.title || 'Connected') : ytStatus.isExpired ? 'Expired' : 'Disconnected'}
            </p>
          </button>

          {/* TikTok Pill */}
          <button
            type="button"
            onClick={() => setActiveChannel('tiktok')}
            className={`p-2.5 rounded-xl border text-left transition-all ${
              activeChannel === 'tiktok' 
                ? 'bg-cyan-500/15 border-cyan-500/40' 
                : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <TikTokIcon className="w-3.5 h-3.5 text-cyan-400" />
              <div className={`w-2 h-2 rounded-full ${
                tiktokStatus.isConnected 
                  ? 'bg-emerald-400 shadow-sm shadow-emerald-400' 
                  : tiktokStatus.isExpired 
                    ? 'bg-amber-400 animate-pulse' 
                    : 'bg-slate-600'
              }`} />
            </div>
            <p className="text-[11px] font-bold text-white truncate">TikTok</p>
            <p className={`text-[10px] truncate ${
              tiktokStatus.isConnected 
                ? 'text-emerald-400 font-semibold' 
                : tiktokStatus.isExpired 
                  ? 'text-amber-400 font-semibold' 
                  : 'text-slate-500'
            }`}>
              {tiktokStatus.isConnected ? (tiktokStatus.displayName || 'Connected') : tiktokStatus.isExpired ? 'Expired' : 'Disconnected'}
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
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] shrink-0 font-medium"
                  >
                    Copy
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleDirectTokenConnect} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Instagram Account ID (Leave blank to auto-detect from token)
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
                    Meta Graph API Access Token (Short or Long-Lived)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Paste Meta User or Page Access Token (EAA...)"
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
                  <CheckCircle2 className="w-4 h-4" />
                  {tokenLoading ? 'Verifying with Graph API...' : 'Save & Verify Token'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* TAB 2: FACEBOOK PAGE */}
        {activeChannel === 'facebook_page' && (
          <div>
            <div className={`p-4 rounded-2xl border mb-4 ${
              fbPageStatus.isConnected 
                ? 'bg-emerald-500/10 border-emerald-500/30' 
                : fbPageStatus.isExpired 
                  ? 'bg-amber-500/10 border-amber-500/30' 
                  : 'bg-slate-950/50 border-slate-800'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`mt-1 w-3 h-3 rounded-full shrink-0 ${
                    fbPageStatus.isConnected 
                      ? 'bg-emerald-400 shadow-lg shadow-emerald-400/40' 
                      : fbPageStatus.isExpired 
                        ? 'bg-amber-400 animate-pulse' 
                        : 'bg-slate-600'
                  }`} />
                  <div className="min-w-0">
                    <p className={`text-sm font-bold ${
                      fbPageStatus.isConnected ? 'text-emerald-300' : fbPageStatus.isExpired ? 'text-amber-300' : 'text-slate-300'
                    }`}>
                      {fbPageStatus.isConnected ? 'Facebook Page Connected' : fbPageStatus.isExpired ? 'Facebook Page Session Expired' : 'Facebook Page Not Connected'}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {fbPageStatus.isConnected
                        ? `Connected to "${fbPageStatus.name}" (ID: ${fbPageStatus.pageId})`
                        : fbPageStatus.isExpired
                          ? 'Token has expired or was invalidated. Please re-authenticate below.'
                          : 'Reels will be pushed directly to your Facebook Page when published.'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={statusLoading}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950/70 border border-slate-700 text-[10px] font-bold text-slate-200 flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                >
                  <RefreshCw className={`w-3 h-3 ${statusLoading ? 'animate-spin' : ''}`} />
                  Verify
                </button>
              </div>
            </div>

            {/* Auto Detect Section */}
            <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800 mb-4 space-y-3">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                1-Click Auto-Detect Facebook Pages
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Paste any Meta User Access Token or Facebook Token. Texvic will automatically scan all Facebook Pages you manage.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Paste Meta Token (EAA...)"
                  value={fbAutoDetectToken}
                  onChange={(e) => setFbAutoDetectToken(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                />
                <button
                  type="button"
                  onClick={handleAutoDetectPages}
                  disabled={fbAutoDetectLoading || !fbAutoDetectToken.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white flex items-center gap-1.5 shrink-0 shadow-lg shadow-blue-600/20"
                >
                  <Search className="w-3.5 h-3.5" />
                  {fbAutoDetectLoading ? 'Scanning...' : 'Scan Pages'}
                </button>
              </div>

              {fbDiscoveredPages.length > 0 && (
                <div className="pt-2 border-t border-slate-800 space-y-1.5">
                  <p className="text-[11px] font-semibold text-slate-300">Managed Pages Found:</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {fbDiscoveredPages.map((page: any) => (
                      <div key={page.id} className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{page.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">ID: {page.id} • {page.category || 'Page'}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleConnectDiscoveredPage(page)}
                          disabled={fbPageLoading}
                          className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold flex items-center gap-1 shrink-0"
                        >
                          <Check className="w-3 h-3" />
                          Connect
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Manual Form */}
            <form onSubmit={handleManualConnectPage} className="p-4 rounded-2xl bg-slate-950/30 border border-slate-800/80 space-y-3">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-blue-400" />
                Manual Page Credentials
              </h3>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Facebook Page ID (Leave blank to auto-detect from token)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1000892837465"
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
                disabled={fbPageLoading || !fbPageTokenInput.trim()}
                className="w-full px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
              >
                <CheckCircle2 className="w-4 h-4" />
                {fbPageLoading ? 'Verifying with Meta...' : 'Save & Verify Page'}
              </button>
            </form>
          </div>
        )}

        {/* TAB 3: FACEBOOK USER PROFILE */}
        {activeChannel === 'facebook_account' && (
          <div>
            <div className={`p-4 rounded-2xl border mb-4 ${
              fbAccountStatus.isConnected 
                ? 'bg-emerald-500/10 border-emerald-500/30' 
                : fbAccountStatus.isExpired 
                  ? 'bg-amber-500/10 border-amber-500/30' 
                  : 'bg-slate-950/50 border-slate-800'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`mt-1 w-3 h-3 rounded-full shrink-0 ${
                    fbAccountStatus.isConnected 
                      ? 'bg-emerald-400 shadow-lg shadow-emerald-400/40' 
                      : fbAccountStatus.isExpired 
                        ? 'bg-amber-400 animate-pulse' 
                        : 'bg-slate-600'
                  }`} />
                  <div className="min-w-0">
                    <p className={`text-sm font-bold ${
                      fbAccountStatus.isConnected ? 'text-emerald-300' : fbAccountStatus.isExpired ? 'text-amber-300' : 'text-slate-300'
                    }`}>
                      {fbAccountStatus.isConnected ? 'Facebook Profile Connected' : fbAccountStatus.isExpired ? 'Facebook Profile Session Expired' : 'Facebook Profile Not Connected'}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {fbAccountStatus.isConnected
                        ? `Connected as "${fbAccountStatus.name}"`
                        : 'Reels can be pushed concurrently to your personal Facebook Profile.'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={statusLoading}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950/70 border border-slate-700 text-[10px] font-bold text-slate-200 flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                >
                  <RefreshCw className={`w-3 h-3 ${statusLoading ? 'animate-spin' : ''}`} />
                  Verify
                </button>
              </div>
            </div>

            <form onSubmit={handleConnectFacebookAccount} className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-indigo-400" />
                Connect Facebook Profile
              </h3>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Facebook User ID (Leave blank or "me")
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

        {/* TAB 4: YOUTUBE SHORTS */}
        {activeChannel === 'youtube' && (
          <div>
            <div className={`p-4 rounded-2xl border mb-4 ${
              ytStatus.isConnected 
                ? 'bg-emerald-500/10 border-emerald-500/30' 
                : ytStatus.isExpired 
                  ? 'bg-amber-500/10 border-amber-500/30' 
                  : 'bg-slate-950/50 border-slate-800'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`mt-1 w-3 h-3 rounded-full shrink-0 ${
                    ytStatus.isConnected 
                      ? 'bg-emerald-400 shadow-lg shadow-emerald-400/40' 
                      : ytStatus.isExpired 
                        ? 'bg-amber-400 animate-pulse' 
                        : 'bg-slate-600'
                  }`} />
                  <div className="min-w-0">
                    <p className={`text-sm font-bold ${
                      ytStatus.isConnected ? 'text-emerald-300' : ytStatus.isExpired ? 'text-amber-300' : 'text-slate-300'
                    }`}>
                      {ytStatus.isConnected ? 'YouTube Shorts Connected' : ytStatus.isExpired ? 'YouTube Session Expired' : 'YouTube Channel Not Connected'}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {ytStatus.isConnected
                        ? `Channel: "${ytStatus.title}" (${(ytStatus.subscriberCount || 0).toLocaleString()} subscribers)`
                        : 'Reels will be published as vertical YouTube Shorts with chapter timestamps & #Shorts tags.'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={statusLoading}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950/70 border border-slate-700 text-[10px] font-bold text-slate-200 flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                >
                  <RefreshCw className={`w-3 h-3 ${statusLoading ? 'animate-spin' : ''}`} />
                  Verify
                </button>
              </div>

              {ytStatus.isConnected && (
                <div className="mt-3 pt-3 border-t border-emerald-500/20 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Default Upload Visibility:</span>
                    <select
                      value={ytPrivacy}
                      onChange={(e) => setYtPrivacy(e.target.value as any)}
                      className="px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-white font-medium text-xs focus:outline-none"
                    >
                      <option value="public">Public (Immediate Distribution)</option>
                      <option value="unlisted">Unlisted (Review Before Public)</option>
                      <option value="private">Private (Draft)</option>
                    </select>
                  </div>
                  <span className="text-emerald-400 font-mono text-[11px]">{ytStatus.customUrl || ytStatus.channelId}</span>
                </div>
              )}

              {/* Historical Reels Sync Card */}
              {ytStatus.isConnected && (
                <div className="mt-3 p-3 rounded-xl bg-slate-950/70 border border-red-500/30 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-red-400">
                      <Youtube className="w-4 h-4" />
                      <span>Historical Reels Sync</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-300 font-mono text-[10px] border border-red-500/20">
                      {ytUnpostedCount} unposted reel{ytUnpostedCount === 1 ? '' : 's'}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Publish previously rendered reels to YouTube Shorts with chapter markers, captions & <code className="text-red-400 font-mono">#Shorts</code> metadata.
                  </p>

                  {modalBatchMsg && (
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-[10px] text-slate-300">
                      {modalBatchMsg}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={isModalBatchSyncing || ytUnpostedCount === 0}
                    onClick={handleModalBatchSync}
                    className="w-full py-2 px-3 rounded-lg text-xs font-bold bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white flex items-center justify-center gap-1.5 shadow-md shadow-red-600/20 disabled:opacity-50 transition-all active:scale-95 cursor-pointer"
                  >
                    {isModalBatchSyncing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Uploading to YouTube Shorts...
                      </>
                    ) : ytUnpostedCount === 0 ? (
                      '✓ All Past Reels Synced to YouTube'
                    ) : (
                      `Sync ${ytUnpostedCount} Past Reel${ytUnpostedCount === 1 ? '' : 's'} to YouTube (Daily Batch)`
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Sub-tab: OAuth vs Token */}
            <div className="flex border-b border-slate-800 mb-4">
              <button
                type="button"
                onClick={() => setConnectTab('oauth')}
                className={`flex-1 py-2 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                  connectTab === 'oauth'
                    ? 'border-red-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                Google OAuth Login
              </button>
              <button
                type="button"
                onClick={() => setConnectTab('token')}
                className={`flex-1 py-2 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                  connectTab === 'token'
                    ? 'border-red-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                Direct API Credentials
              </button>
            </div>

            {connectTab === 'oauth' ? (
              <div className="space-y-3">
                {/* Local Error */}
                {ytLocalError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{ytLocalError}</span>
                  </div>
                )}

                {/* Popup Blocked Fallback */}
                {ytFallbackUrl && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2">
                    <p className="font-semibold">Popup blocked by browser</p>
                    <div className="flex gap-2">
                      <a
                        href={ytFallbackUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-[11px] inline-flex items-center gap-1.5"
                      >
                        Open Google Login in New Tab ↗
                      </a>
                      <button
                        type="button"
                        onClick={() => { window.location.href = ytFallbackUrl; }}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg text-[11px]"
                      >
                        Open in Current Tab
                      </button>
                    </div>
                  </div>
                )}

                {/* App Configuration Card */}
                {(!ytStatus.isAppConfigured || editingYtAppCreds) ? (
                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-red-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                        <Youtube className="w-4 h-4" />
                        Google Cloud OAuth App Credentials
                      </span>
                      {ytStatus.isAppConfigured && (
                        <button
                          type="button"
                          onClick={() => setEditingYtAppCreds(false)}
                          className="text-[10px] text-slate-400 hover:text-slate-200 underline"
                        >
                          Cancel
                        </button>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Enter your Google OAuth Client ID & Secret from Google Cloud Console. These are securely encrypted at rest.
                    </p>

                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-[10px] text-slate-300 flex items-center justify-between gap-2">
                      <div className="truncate">
                        <span className="text-slate-500">Redirect URI: </span>
                        <span className="font-mono text-red-400 select-all">
                          {typeof window !== 'undefined' ? `${window.location.origin}/auth/youtube/callback` : '/auth/youtube/callback'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof window !== 'undefined') {
                            navigator.clipboard.writeText(`${window.location.origin}/auth/youtube/callback`);
                            showNotification('Redirect URI copied to clipboard!');
                          }
                        }}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px] shrink-0 font-medium"
                      >
                        Copy
                      </button>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-300 mb-1">
                          Google Client ID <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 123456789-abcdef.apps.googleusercontent.com"
                          value={ytClientId}
                          onChange={(e) => setYtClientId(e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-red-500 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-300 mb-1">
                          Google Client Secret <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="password"
                          placeholder="GOCSPX-..."
                          value={ytClientSecret}
                          onChange={(e) => setYtClientSecret(e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-red-500 font-mono"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      <span className="text-slate-300 font-medium">Google OAuth App Configured</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingYtAppCreds(true)}
                      className="text-[11px] text-red-400 hover:text-red-300 font-medium underline"
                    >
                      Edit Keys
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleYouTubeOAuthConnect}
                  disabled={ytOauthLoading}
                  className="w-full px-4 py-3 rounded-xl text-xs font-bold bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 disabled:opacity-60 text-white flex items-center justify-center gap-2 shadow-lg shadow-red-600/20"
                >
                  <Youtube className="w-4 h-4" />
                  {ytOauthLoading
                    ? 'Launching Google Login...'
                    : (!ytStatus.isAppConfigured && ytClientId.trim())
                      ? 'Save Credentials & Connect with Google'
                      : ytStatus.isConnected
                        ? 'Reconnect YouTube Channel'
                        : 'Connect YouTube Channel with Google'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleYouTubeDirectConnect} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Google OAuth Client ID (Optional if in .env)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 123456789-abc.apps.googleusercontent.com"
                    value={ytClientId}
                    onChange={(e) => setYtClientId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-red-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Google OAuth Client Secret (Optional if in .env)
                  </label>
                  <input
                    type="password"
                    placeholder="GOCSPX-..."
                    value={ytClientSecret}
                    onChange={(e) => setYtClientSecret(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-red-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    YouTube Refresh Token or Direct Access Token
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Paste Google Refresh Token (1//0...) or Access Token (ya29...)"
                    value={ytRefreshToken || ytDirectToken}
                    onChange={(e) => {
                      setYtRefreshToken(e.target.value);
                      setYtDirectToken(e.target.value);
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-red-500 font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={ytLoading || (!ytRefreshToken.trim() && !ytDirectToken.trim())}
                  className="w-full px-4 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white flex items-center justify-center gap-2 shadow-lg shadow-red-600/20"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {ytLoading ? 'Verifying YouTube Channel...' : 'Save & Verify YouTube Channel'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* TAB 5: TIKTOK */}
        {activeChannel === 'tiktok' && (
          <div>
            <div className={`p-4 rounded-2xl border mb-4 ${
              tiktokStatus.isConnected 
                ? 'bg-emerald-500/10 border-emerald-500/30' 
                : tiktokStatus.isExpired 
                  ? 'bg-amber-500/10 border-amber-500/30' 
                  : 'bg-slate-950/50 border-slate-800'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`mt-1 w-3 h-3 rounded-full shrink-0 ${
                    tiktokStatus.isConnected 
                      ? 'bg-emerald-400 shadow-lg shadow-emerald-400/40' 
                      : tiktokStatus.isExpired 
                        ? 'bg-amber-400 animate-pulse' 
                        : 'bg-slate-600'
                  }`} />
                  <div className="min-w-0">
                    <p className={`text-sm font-bold ${
                      tiktokStatus.isConnected ? 'text-emerald-300' : tiktokStatus.isExpired ? 'text-amber-300' : 'text-slate-300'
                    }`}>
                      {tiktokStatus.isConnected ? 'TikTok Connected' : tiktokStatus.isExpired ? 'TikTok Session Expired' : 'TikTok Not Connected'}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {tiktokStatus.isConnected
                        ? `Account: "${tiktokStatus.displayName}" (${(tiktokStatus.followerCount || 0).toLocaleString()} followers)`
                        : 'Reels will be uploaded directly via TikTok Content Posting API with #historytok tags.'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={statusLoading}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950/70 border border-slate-700 text-[10px] font-bold text-slate-200 flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                >
                  <RefreshCw className={`w-3 h-3 ${statusLoading ? 'animate-spin' : ''}`} />
                  Verify
                </button>
              </div>
            </div>

            {/* Sub-tab: OAuth vs Token */}
            <div className="flex border-b border-slate-800 mb-4">
              <button
                type="button"
                onClick={() => setConnectTab('oauth')}
                className={`flex-1 py-2 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                  connectTab === 'oauth'
                    ? 'border-cyan-400 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                TikTok OAuth Login
              </button>
              <button
                type="button"
                onClick={() => setConnectTab('token')}
                className={`flex-1 py-2 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                  connectTab === 'token'
                    ? 'border-cyan-400 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                Direct Access Token
              </button>
            </div>

            {connectTab === 'oauth' ? (
              <div className="space-y-3">
                {/* Local Error */}
                {tiktokLocalError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{tiktokLocalError}</span>
                  </div>
                )}

                {/* Popup Blocked Fallback */}
                {tiktokFallbackUrl && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2">
                    <p className="font-semibold">Popup blocked by browser</p>
                    <div className="flex gap-2">
                      <a
                        href={tiktokFallbackUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-lg text-[11px] inline-flex items-center gap-1.5"
                      >
                        Open TikTok Login in New Tab ↗
                      </a>
                      <button
                        type="button"
                        onClick={() => { window.location.href = tiktokFallbackUrl; }}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg text-[11px]"
                      >
                        Open in Current Tab
                      </button>
                    </div>
                  </div>
                )}

                {/* App Configuration Card */}
                {(!tiktokStatus.isAppConfigured || editingTiktokAppCreds) ? (
                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-cyan-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                        <TikTokIcon className="w-4 h-4" />
                        TikTok Developer App Credentials
                      </span>
                      {tiktokStatus.isAppConfigured && (
                        <button
                          type="button"
                          onClick={() => setEditingTiktokAppCreds(false)}
                          className="text-[10px] text-slate-400 hover:text-slate-200 underline"
                        >
                          Cancel
                        </button>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Enter your TikTok App Client Key & Secret from TikTok Developer Portal.
                    </p>

                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-[10px] text-slate-300 flex items-center justify-between gap-2">
                      <div className="truncate">
                        <span className="text-slate-500">Redirect URI: </span>
                        <span className="font-mono text-cyan-400 select-all">
                          {typeof window !== 'undefined' ? `${window.location.origin}/auth/tiktok/callback` : '/auth/tiktok/callback'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof window !== 'undefined') {
                            navigator.clipboard.writeText(`${window.location.origin}/auth/tiktok/callback`);
                            showNotification('Redirect URI copied!');
                          }
                        }}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px] shrink-0 font-medium"
                      >
                        Copy
                      </button>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-300 mb-1">
                          TikTok Client Key <span className="text-cyan-400">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. aw..."
                          value={tiktokClientKey}
                          onChange={(e) => setTiktokClientKey(e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-300 mb-1">
                          TikTok Client Secret <span className="text-cyan-400">*</span>
                        </label>
                        <input
                          type="password"
                          placeholder="Secret..."
                          value={tiktokClientSecret}
                          onChange={(e) => setTiktokClientSecret(e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-mono"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      <span className="text-slate-300 font-medium">TikTok App Configured</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingTiktokAppCreds(true)}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 font-medium underline"
                    >
                      Edit Keys
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleTikTokOAuthConnect}
                  disabled={tiktokOauthLoading}
                  className="w-full px-4 py-3 rounded-xl text-xs font-bold bg-slate-950 hover:bg-slate-800 border border-slate-700 disabled:opacity-60 text-white flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/10"
                >
                  <TikTokIcon className="w-4 h-4 text-cyan-400" />
                  {tiktokOauthLoading
                    ? 'Launching TikTok Login...'
                    : (!tiktokStatus.isAppConfigured && tiktokClientKey.trim())
                      ? 'Save Credentials & Connect TikTok'
                      : tiktokStatus.isConnected
                        ? 'Reconnect TikTok Account'
                        : 'Connect TikTok Account with Login Kit'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleTikTokDirectConnect} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    TikTok Developer Access Token (act.example...)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Paste TikTok Access Token"
                    value={tiktokDirectToken}
                    onChange={(e) => setTiktokDirectToken(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={tiktokLoading || !tiktokDirectToken.trim()}
                  className="w-full px-4 py-2.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/20"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {tiktokLoading ? 'Verifying with TikTok...' : 'Save & Verify TikTok Token'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Security Assurance */}
        <div className="mt-4 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
          <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>
            Credentials are verified live against official platform APIs and encrypted with AES-256-GCM. Finished Reels are published concurrently across all connected channels.
          </span>
        </div>

        {/* Modal Footer */}
        <div className="pt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {activeChannel === 'instagram' && isConnected && (
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

            {activeChannel === 'facebook_page' && fbPageStatus.isConnected && (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Unplug className="w-3 h-3" />
                Disconnect FB Page
              </button>
            )}

            {activeChannel === 'facebook_account' && fbAccountStatus.isConnected && (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Unplug className="w-3 h-3" />
                Disconnect FB Profile
              </button>
            )}

            {activeChannel === 'youtube' && ytStatus.isConnected && (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Unplug className="w-3 h-3" />
                Disconnect YouTube
              </button>
            )}

            {activeChannel === 'tiktok' && tiktokStatus.isConnected && (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Unplug className="w-3 h-3" />
                Disconnect TikTok
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
