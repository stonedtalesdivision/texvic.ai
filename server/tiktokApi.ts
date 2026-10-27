/**
 * TikTok Developer API & Content Posting API Integration Client
 * Supports TikTok OAuth popup authentication, user profile inspection,
 * and direct video publishing via TikTok's Content Posting API.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface TikTokUserProfile {
  openId: string;
  unionId?: string;
  avatarUrl?: string;
  displayName: string;
  username?: string;
  followerCount?: number;
}

export interface PublishTikTokResult {
  success: boolean;
  publishId?: string;
  shareUrl?: string;
  error?: string;
}

const TIKTOK_AUTH_ENDPOINT = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN_ENDPOINT = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_USER_ENDPOINT = 'https://open.tiktokapis.com/v2/user/info/';
const TIKTOK_POST_INIT_ENDPOINT = 'https://open.tiktokapis.com/v2/post/publish/video/init/';

export const TIKTOK_SCOPES = [
  'user.info.basic',
  'video.upload',
  'video.publish'
];

/**
 * Constructs TikTok OAuth 2.0 authorization dialog URL.
 */
export function getTikTokOAuthUrl(clientKey: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_key: clientKey,
    scope: TIKTOK_SCOPES.join(','),
    response_type: 'code',
    redirect_uri: redirectUri,
    state: state
  });

  return `${TIKTOK_AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Exchanges TikTok OAuth authorization code for access and refresh tokens.
 */
export async function exchangeTikTokCodeForTokens(
  code: string,
  clientKey: string,
  clientSecret: string,
  redirectUri: string
): Promise<{
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  openId?: string;
  error?: string;
}> {
  try {
    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    });

    const res = await fetch(TIKTOK_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error || data.data?.error_code) {
      return { 
        error: data.error_description || data.message || data.data?.error_description || `HTTP ${res.status} exchanging TikTok code` 
      };
    }

    const payload = data.data || data;
    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresIn: payload.expires_in,
      openId: payload.open_id
    };
  } catch (err: any) {
    return { error: err?.message || 'Failed to exchange TikTok authorization code' };
  }
}

/**
 * Refreshes an expired TikTok access token using the stored refresh token.
 */
export async function refreshTikTokAccessToken(
  refreshToken: string,
  clientKey: string,
  clientSecret: string
): Promise<{ accessToken?: string; expiresIn?: number; error?: string }> {
  try {
    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });

    const res = await fetch(TIKTOK_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      return { error: data.error_description || data.message || 'Failed to refresh TikTok access token' };
    }

    const payload = data.data || data;
    return {
      accessToken: payload.access_token,
      expiresIn: payload.expires_in
    };
  } catch (err: any) {
    return { error: err?.message || 'Error refreshing TikTok token' };
  }
}

/**
 * Retrieves the authenticated user's TikTok profile details.
 */
export async function getTikTokUserProfile(accessToken: string): Promise<{
  success: boolean;
  data?: TikTokUserProfile;
  error?: string;
}> {
  try {
    const url = `${TIKTOK_USER_ENDPOINT}?fields=open_id,union_id,avatar_url,display_name,username,follower_count`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error?.code || data.error_code) {
      return { 
        success: false, 
        error: data.error?.message || data.message || `TikTok API error: ${res.status}` 
      };
    }

    const user = data.data?.user || {};
    return {
      success: true,
      data: {
        openId: user.open_id || '',
        unionId: user.union_id,
        avatarUrl: user.avatar_url,
        displayName: user.display_name || user.username || 'TikTok Creator',
        username: user.username ? `@${user.username}` : undefined,
        followerCount: Number(user.follower_count || 0)
      }
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to retrieve TikTok profile' };
  }
}

/**
 * Publishes a finished video Reel directly to TikTok using Content Posting API v2.
 */
export async function publishReelToTikTok(
  accessToken: string,
  options: {
    videoPath?: string;
    videoUrl?: string;
    title?: string;
    caption: string;
    privacyLevel?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';
  }
): Promise<PublishTikTokResult> {
  try {
    let videoBuffer: Buffer | null = null;

    if (options.videoPath && fs.existsSync(options.videoPath)) {
      videoBuffer = fs.readFileSync(options.videoPath);
    } else if (options.videoUrl) {
      const resp = await fetch(options.videoUrl);
      if (!resp.ok) {
        return { success: false, error: `Could not fetch video from URL: HTTP ${resp.status}` };
      }
      videoBuffer = Buffer.from(await resp.arrayBuffer());
    }

    if (!videoBuffer || videoBuffer.length < 50000) {
      return { success: false, error: 'Invalid or missing video binary for TikTok upload' };
    }

    const cleanCaption = (options.caption || options.title || 'Declassified Archival Record #historytok').slice(0, 2200);

    console.info(`[TikTok API] Initiating direct post (${(videoBuffer.length / 1048576).toFixed(1)} MB)...`);

    // Step 1: Initialize post session
    const initBody = {
      post_info: {
        title: cleanCaption,
        privacy_level: options.privacyLevel || 'PUBLIC_TO_EVERYONE',
        disable_duet: false,
        disable_stitch: false,
        disable_comment: false
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoBuffer.length,
        chunk_size: videoBuffer.length,
        total_chunk_count: 1
      }
    };

    const initRes = await fetch(TIKTOK_POST_INIT_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8'
      },
      body: JSON.stringify(initBody)
    });

    const initData = await initRes.json().catch(() => ({}));
    if (!initRes.ok || initData.error?.code || !initData.data?.upload_url) {
      return { 
        success: false, 
        error: initData.error?.message || initData.message || `TikTok post initialization failed: HTTP ${initRes.status}` 
      };
    }

    const uploadUrl = initData.data.upload_url;
    const publishId = initData.data.publish_id;

    // Step 2: Upload video binary to TikTok upload URL
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': `bytes 0-${videoBuffer.length - 1}/${videoBuffer.length}`
      },
      body: new Uint8Array(videoBuffer)
    });

    if (!uploadRes.ok && uploadRes.status !== 200 && uploadRes.status !== 201) {
      return { success: false, error: `TikTok binary transfer failed: HTTP ${uploadRes.status}` };
    }

    console.info(`[TikTok API] ✅ TikTok video published successfully (publishId: ${publishId})`);

    return {
      success: true,
      publishId,
      shareUrl: `https://www.tiktok.com/@${publishId}`
    };
  } catch (err: any) {
    console.error('[TikTok API] Fatal error publishing reel:', err);
    return { success: false, error: err?.message || 'Fatal error during TikTok publishing' };
  }
}
