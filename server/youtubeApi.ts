/**
 * YouTube Data API v3 & Google OAuth 2.0 Integration Client
 * Supports Google OAuth popup flow, automated token refresh, channel verification,
 * and automated YouTube Shorts publishing with metadata and chapter timestamps.
 */

import fs from 'node:fs';
import path from 'node:path';
import { db } from './database.js';
import { encryptSecret, decryptSecret } from './tokenVault.js';

export interface YouTubeChannelProfile {
  channelId: string;
  title: string;
  customUrl?: string;
  description?: string;
  subscriberCount: number;
  videoCount: number;
  avatarUrl?: string;
}

export interface PublishYouTubeResult {
  success: boolean;
  videoId?: string;
  permalink?: string;
  error?: string;
}

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3';

export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/userinfo.profile'
];

/**
 * Constructs Google OAuth 2.0 authorization URL for YouTube Shorts publishing.
 */
export function getGoogleOAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: YOUTUBE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: state
  });

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Exchanges Google OAuth code for access and refresh tokens.
 */
export async function exchangeGoogleCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<{
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
}> {
  try {
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    });

    const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      return { error: data.error_description || data.error || `HTTP ${res.status} exchanging Google code` };
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in
    };
  } catch (err: any) {
    return { error: err?.message || 'Failed to exchange Google OAuth code' };
  }
}

/**
 * Refreshes an expired Google access token using the stored refresh token.
 */
export async function refreshGoogleAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken?: string; expiresIn?: number; error?: string }> {
  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      return { error: data.error_description || data.error || 'Failed to refresh Google token' };
    }

    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in
    };
  } catch (err: any) {
    return { error: err?.message || 'Error refreshing Google access token' };
  }
}

/**
 * Fetches the authenticated user's YouTube Channel details.
 */
export async function getYouTubeChannelProfile(accessToken: string): Promise<{
  success: boolean;
  data?: YouTubeChannelProfile;
  error?: string;
}> {
  try {
    const url = `${YOUTUBE_API_BASE}/channels?part=snippet,statistics&mine=true`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      return { success: false, error: data.error?.message || `YouTube API error: ${res.status}` };
    }

    const item = data.items?.[0];
    if (!item) {
      return { success: false, error: 'No YouTube channel found for this Google account.' };
    }

    const snippet = item.snippet || {};
    const stats = item.statistics || {};

    return {
      success: true,
      data: {
        channelId: item.id,
        title: snippet.title || 'YouTube Channel',
        customUrl: snippet.customUrl || `@${snippet.title?.replace(/\s+/g, '')}`,
        description: snippet.description || '',
        subscriberCount: Number(stats.subscriberCount || 0),
        videoCount: Number(stats.videoCount || 0),
        avatarUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url
      }
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to fetch YouTube channel profile' };
  }
}

/**
 * Publishes a video to YouTube Shorts using resumable upload.
 */
export async function publishReelToYouTube(
  accessToken: string,
  options: {
    videoPath?: string;
    videoUrl?: string;
    title: string;
    description: string;
    tags?: string[];
    categoryId?: string;
    privacyStatus?: 'public' | 'unlisted' | 'private';
    coverPath?: string;
  }
): Promise<PublishYouTubeResult> {
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
      return { success: false, error: 'Invalid or missing video binary for YouTube Shorts upload' };
    }

    // Ensure title includes #Shorts for algorithmic Shorts feed recognition
    let finalTitle = options.title.trim();
    if (!finalTitle.includes('#Shorts')) {
      finalTitle = `${finalTitle} #Shorts`;
    }
    if (finalTitle.length > 100) {
      finalTitle = `${finalTitle.slice(0, 92).trim()} #Shorts`;
    }

    const metadata = {
      snippet: {
        title: finalTitle,
        description: options.description || '',
        tags: options.tags || ['shorts', 'documentary', 'history'],
        categoryId: options.categoryId || '27' // Education / Documentary
      },
      status: {
        privacyStatus: options.privacyStatus || 'public',
        selfDeclaredMadeForKids: false
      }
    };

    console.info(`[YouTube API] Initiating resumable video upload (${(videoBuffer.length / 1048576).toFixed(1)} MB): "${finalTitle}"...`);

    // Step 1: Initiate resumable session
    const initRes = await fetch(`${YOUTUBE_UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(videoBuffer.length),
        'X-Upload-Content-Type': 'video/mp4'
      },
      body: JSON.stringify(metadata)
    });

    if (!initRes.ok) {
      const errData = await initRes.json().catch(() => ({}));
      return { success: false, error: errData.error?.message || `YouTube upload init failed: HTTP ${initRes.status}` };
    }

    const uploadUrl = initRes.headers.get('location');
    if (!uploadUrl) {
      return { success: false, error: 'YouTube did not return a resumable upload URL' };
    }

    // Step 2: Upload video payload
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(videoBuffer.length)
      },
      body: new Uint8Array(videoBuffer)
    });

    const uploadData = await uploadRes.json().catch(() => ({}));
    if (!uploadRes.ok || !uploadData.id) {
      return { success: false, error: uploadData.error?.message || `YouTube upload transfer failed: HTTP ${uploadRes.status}` };
    }

    const videoId = uploadData.id;
    console.info(`[YouTube API] ✅ YouTube Shorts published successfully: ${videoId}`);

    // Optional: Upload custom high-CTR cover thumbnail if available
    if (options.coverPath && fs.existsSync(options.coverPath)) {
      try {
        const coverBuf = fs.readFileSync(options.coverPath);
        await fetch(`${YOUTUBE_UPLOAD_BASE}/thumbnails/set?videoId=${videoId}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'image/jpeg',
            'Content-Length': String(coverBuf.length)
          },
          body: new Uint8Array(coverBuf)
        });
        console.info(`[YouTube API] 🖼️ Custom 9:16 thumbnail uploaded for ${videoId}`);
      } catch (thumbErr) {
        console.warn(`[YouTube API] Notice uploading thumbnail for ${videoId}:`, thumbErr);
      }
    }

    return {
      success: true,
      videoId,
      permalink: `https://youtube.com/shorts/${videoId}`
    };
  } catch (err: any) {
    console.error('[YouTube API] Fatal error publishing reel:', err);
    return { success: false, error: err?.message || 'Fatal error during YouTube publishing' };
  }
}
