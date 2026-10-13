/**
 * Meta Graph API & Instagram Graph API Real Integration Client
 * Supports OAuth 2.0, Long-Lived Token Exchange, 2-Step Reels Container Publishing,
 * Real Insights Ingestion, Webhook Event Ingestion, and Comment Automation.
 */

export interface MetaAccountDetails {
  id: string;
  username: string;
  name: string;
  profile_picture_url?: string;
  biography?: string;
  followers_count: number;
  follows_count: number;
  media_count: number;
  website?: string;
}

export interface PublishReelResult {
  success: boolean;
  mediaId?: string;
  containerId?: string;
  permalink?: string;
  error?: string;
}

const GRAPH_API_VERSION = process.env.INSTAGRAM_GRAPH_API_VERSION || process.env.META_GRAPH_API_VERSION || 'v26.0';
const GRAPH_BASE_URL = `https://graph.instagram.com/${GRAPH_API_VERSION}`;
const INSTAGRAM_OAUTH_URL = 'https://www.instagram.com/oauth/authorize';
const INSTAGRAM_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';

/**
 * Constructs the real Meta OAuth dialog URL for connecting Instagram Business / Creator accounts.
 */
export function getMetaOAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const scopes = [
    'instagram_business_basic',
    'instagram_business_content_publish',
    'instagram_business_manage_comments',
    'instagram_business_manage_insights'
  ].join(',');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    state: state
  });

  params.set('enable_fb_login', '0');
  params.set('force_authentication', '1');
  return `${INSTAGRAM_OAUTH_URL}?${params.toString()}`;
}

/**
 * Exchanges short-lived OAuth authorization code for a long-lived Meta & Instagram Page access token.
 */
export async function exchangeCodeForLongLivedTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<{
  userAccessToken: string;
  longLivedAccessToken: string;
  instagramAccountId?: string;
  instagramUsername?: string;
  instagramName?: string;
  profilePictureUrl?: string;
  expiresIn?: number;
  error?: string;
}> {
  try {
    const shortTokenRes = await fetch(INSTAGRAM_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code
      }).toString()
    });
    const shortTokenData = await shortTokenRes.json();

    if (!shortTokenRes.ok || !shortTokenData.access_token) {
      return { userAccessToken: '', longLivedAccessToken: '', error: shortTokenData.error_message || shortTokenData.error?.message || 'Instagram authorization code exchange failed.' };
    }

    const longLivedUrl = new URL('https://graph.instagram.com/access_token');
    longLivedUrl.searchParams.set('grant_type', 'ig_exchange_token');
    longLivedUrl.searchParams.set('client_secret', clientSecret);
    longLivedUrl.searchParams.set('access_token', shortTokenData.access_token);

    const longLivedRes = await fetch(longLivedUrl.toString());
    const longLivedData = await longLivedRes.json();
    if (!longLivedRes.ok || !longLivedData.access_token) {
      return { userAccessToken: shortTokenData.access_token, longLivedAccessToken: '', error: longLivedData.error_message || longLivedData.error?.message || 'Instagram long-lived token exchange failed.' };
    }

    const profileRes = await getInstagramAccountProfile('', longLivedData.access_token);
    if (!profileRes.success || !profileRes.data) {
      return { userAccessToken: shortTokenData.access_token, longLivedAccessToken: longLivedData.access_token, error: profileRes.error || 'Connected Instagram account could not be verified.' };
    }

    return {
      userAccessToken: shortTokenData.access_token,
      longLivedAccessToken: longLivedData.access_token,
      instagramAccountId: profileRes.data.id,
      instagramUsername: profileRes.data.username.replace(/^@/, ''),
      instagramName: profileRes.data.name,
      profilePictureUrl: profileRes.data.profile_picture_url,
      expiresIn: Number(longLivedData.expires_in || 0) || undefined
    };
  } catch (err: any) {
    return { userAccessToken: '', longLivedAccessToken: '', error: err?.message || 'Network exception during Instagram token exchange' };
  }
}

/**
 * Fetches real account profile information from Instagram Graph API
 */
export async function getInstagramAccountProfile(
  _igAccountId: string,
  accessToken: string
): Promise<{ success: boolean; data?: MetaAccountDetails; error?: string; errorCode?: number | string; httpStatus?: number }> {
  try {
    const url = `${GRAPH_BASE_URL}/me?fields=id,username,name,profile_picture_url,biography,followers_count,follows_count,media_count,website&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || data.error) {
      return {
        success: false,
        error: data.error?.message || 'Failed to query Instagram Graph API',
        errorCode: data.error?.code,
        httpStatus: res.status
      };
    }

    return {
      success: true,
      data: {
        id: data.id,
        username: data.username ? `@${data.username}` : '@instagram_user',
        name: data.name || data.username || 'Instagram Creator',
        profile_picture_url: data.profile_picture_url || '',
        biography: data.biography || '',
        followers_count: Number(data.followers_count || 0),
        follows_count: Number(data.follows_count || 0),
        media_count: Number(data.media_count || 0),
        website: data.website || ''
      }
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error fetching Instagram profile' };
  }
}

/**
 * Pre-flight probe to verify public accessibility of media URL before sending to Meta Graph API.
 * Prevents account strikes and rate limit exhaustion caused by dead Cloudflare tunnels or 502/530 error pages.
 */
export async function verifyPublicMediaUrl(mediaUrl: string, expectedType: 'image' | 'video' = 'image'): Promise<{ reachable: boolean; status?: number; contentType?: string; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(mediaUrl, {
      method: 'GET',
      headers: { 'Range': 'bytes=0-1024' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) {
      return {
        reachable: false,
        status: res.status,
        contentType,
        error: `Public media URL returned HTTP ${res.status}. If using a Cloudflare tunnel or reverse proxy, ensure the tunnel is active.`
      };
    }

    if (contentType.includes('text/html')) {
      return {
        reachable: false,
        status: res.status,
        contentType,
        error: `Public media URL returned HTML instead of media bytes. This means your public tunnel (e.g. Cloudflare) has expired or is displaying an error page.`
      };
    }

    if (expectedType === 'image' && !contentType.startsWith('image/')) {
      return {
        reachable: false,
        status: res.status,
        contentType,
        error: `Expected image MIME type, received "${contentType}".`
      };
    }

    return { reachable: true, status: res.status, contentType };
  } catch (err: any) {
    return {
      reachable: false,
      error: `Network error probing public media URL: ${err?.message || err}. Ensure your public tunnel (APP_URL) is online.`
    };
  }
}

/**
 * Real Meta Graph API 2-Step Reels Video Publishing Pipeline
 * Step 1: POST /{ig_user_id}/media with media_type=REELS
 * Step 2: Poll container status until FINISHED
 * Step 3: POST /{ig_user_id}/media_publish with creation_id
 */
export async function publishReelToInstagram(
  igAccountId: string,
  accessToken: string,
  params: {
    videoUrl: string;
    caption: string;
    shareToFeed?: boolean;
    audioName?: string;
  }
): Promise<PublishReelResult> {
  if (!igAccountId || !accessToken) {
    return {
      success: false,
      error: 'Missing Meta Instagram credentials (INSTAGRAM_ACCOUNT_ID or META_ACCESS_TOKEN).'
    };
  }

  // Pre-flight probe to ensure video is publicly accessible before pinging Meta
  const probe = await verifyPublicMediaUrl(params.videoUrl, 'video');
  if (!probe.reachable) {
    console.error(`[Meta Reels Pipeline] Pre-flight media probe failed:`, probe.error);
    return {
      success: false,
      error: `Pre-flight validation failed: ${probe.error}`
    };
  }

  try {
    // Step 1: Create Video Container
    const createContainerUrl = `${GRAPH_BASE_URL}/${igAccountId}/media`;
    const containerBody = new URLSearchParams({
      media_type: 'REELS',
      video_url: params.videoUrl,
      caption: params.caption,
      share_to_feed: params.shareToFeed !== false ? 'true' : 'false',
      access_token: accessToken
    });
    if (params.audioName) {
      containerBody.set('audio_name', params.audioName.slice(0, 255));
    }

    const createRes = await fetch(createContainerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: containerBody.toString()
    });

    const createData = await createRes.json();
    if (!createRes.ok || !createData.id) {
      return {
        success: false,
        error: createData.error?.message || 'Failed to create Instagram Reels container'
      };
    }

    const containerId = createData.id;

    // Step 2: Poll container status (Meta video ingestion takes 4-45 seconds)
    let isReady = false;
    let attempts = 0;
    const maxAttempts = 30;

    while (!isReady && attempts < maxAttempts) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 2500));

      const statusUrl = `${GRAPH_BASE_URL}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`;
      const statusRes = await fetch(statusUrl);
      const statusData = await statusRes.json();
      console.log(`[Meta Reels Ingestion] Container ${containerId} status: ${statusData.status_code || statusData.status || 'unknown'} (poll ${attempts}/${maxAttempts})`);

      if (statusData.status_code === 'FINISHED') {
        isReady = true;
        break;
      } else if (statusData.status_code === 'ERROR' || statusData.status_code === 'EXPIRED') {
        return {
          success: false,
          containerId,
          error: `Instagram media container processing failed: ${statusData.status_code}`
        };
      }
    }

    if (!isReady) {
      return {
        success: false,
        containerId,
        error: 'Instagram media container did not finish processing before the publish timeout.'
      };
    }

    // Step 3: Publish the container
    const publishUrl = `${GRAPH_BASE_URL}/${igAccountId}/media_publish`;
    const publishBody = new URLSearchParams({
      creation_id: containerId,
      access_token: accessToken
    });

    const publishRes = await fetch(publishUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: publishBody.toString()
    });

    const publishData = await publishRes.json();
    if (!publishRes.ok || !publishData.id) {
      return {
        success: false,
        containerId,
        error: publishData.error?.message || 'Failed to publish ready Instagram Reel container'
      };
    }

    const mediaId = publishData.id;

    // Query permalink for direct access
    let permalink: string | undefined;
    try {
      const mediaQueryRes = await fetch(`${GRAPH_BASE_URL}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`);
      const mediaQuery = await mediaQueryRes.json();
      permalink = mediaQuery.permalink;
    } catch {
      // Non-critical
    }

    return {
      success: true,
      mediaId,
      containerId,
      permalink: permalink || `https://www.instagram.com/reel/${mediaId}/`
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network exception occurred during Instagram Reel publishing pipeline'
    };
  }
}

export interface PublishCarouselResult {
  success: boolean;
  mediaId?: string;
  containerId?: string;
  permalink?: string;
  error?: string;
}

/**
 * Publishes a multi-slide Carousel (Album) to Instagram via Meta Graph API v21.0
 * Step 1: Create individual item containers for each slide image with is_carousel_item=true
 * Step 2: Poll item containers to ensure image ingestion
 * Step 3: Create parent container with media_type=CAROUSEL and children=<ids>
 * Step 4: Poll parent container until FINISHED
 * Step 5: POST /{ig_user_id}/media_publish with creation_id
 */
export async function publishCarouselToInstagram(
  igAccountId: string,
  accessToken: string,
  params: {
    imageUrls: string[];
    caption: string;
  }
): Promise<PublishCarouselResult> {
  if (!igAccountId || !accessToken) {
    return {
      success: false,
      error: 'Missing Meta Instagram credentials (INSTAGRAM_ACCOUNT_ID or META_ACCESS_TOKEN).'
    };
  }

  if (!Array.isArray(params.imageUrls) || params.imageUrls.length < 2) {
    return {
      success: false,
      error: 'Instagram Carousels require at least 2 slide images (up to 10).'
    };
  }

  const urlsToPublish = params.imageUrls.slice(0, 10);

  // Pre-flight probe first slide image to ensure public tunnel/URL is reachable before hitting Meta
  const probe = await verifyPublicMediaUrl(urlsToPublish[0], 'image');
  if (!probe.reachable) {
    console.error(`[Meta Carousel Pipeline] Pre-flight media probe failed:`, probe.error);
    return {
      success: false,
      error: `Pre-flight validation failed: ${probe.error}`
    };
  }

  try {
    // Step 1: Create item containers for each slide
    console.log(`[Meta Carousel Pipeline] Creating ${urlsToPublish.length} slide item containers...`);
    const childIds: string[] = [];

    for (let i = 0; i < urlsToPublish.length; i++) {
      const imageUrl = urlsToPublish[i];
      const itemUrl = `${GRAPH_BASE_URL}/${igAccountId}/media`;
      const itemBody = new URLSearchParams({
        image_url: imageUrl,
        is_carousel_item: 'true',
        access_token: accessToken
      });

      const itemRes = await fetch(itemUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: itemBody.toString()
      });

      const itemData = await itemRes.json();
      if (!itemRes.ok || !itemData.id) {
        console.error(`[Meta Carousel Pipeline] Slide ${i + 1} container creation failed:`, itemData);
        return {
          success: false,
          error: itemData.error?.message || `Failed to create item container for slide ${i + 1}`
        };
      }

      childIds.push(itemData.id);
      console.log(`[Meta Carousel Pipeline] Slide ${i + 1} container created: ${itemData.id}`);
    }

    // Step 2: Wait briefly and check item containers
    await new Promise(r => setTimeout(r, 2000));
    for (let i = 0; i < childIds.length; i++) {
      const childId = childIds[i];
      let itemReady = false;
      let attempts = 0;
      while (!itemReady && attempts < 15) {
        attempts++;
        const checkUrl = `${GRAPH_BASE_URL}/${childId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`;
        const checkRes = await fetch(checkUrl);
        const checkData = await checkRes.json();
        const code = checkData.status_code || checkData.status;
        if (code === 'FINISHED' || !code) {
          itemReady = true;
          break;
        } else if (code === 'ERROR' || code === 'EXPIRED') {
          return {
            success: false,
            error: `Slide item container ${i + 1} failed processing: ${code}`
          };
        }
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    // Step 3: Create parent Carousel container
    console.log(`[Meta Carousel Pipeline] Creating parent Carousel container with children: ${childIds.join(',')}`);
    const carouselContainerUrl = `${GRAPH_BASE_URL}/${igAccountId}/media`;
    const carouselBody = new URLSearchParams({
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption: params.caption,
      access_token: accessToken
    });

    const carouselRes = await fetch(carouselContainerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: carouselBody.toString()
    });

    const carouselData = await carouselRes.json();
    if (!carouselRes.ok || !carouselData.id) {
      console.error('[Meta Carousel Pipeline] Parent carousel container creation failed:', carouselData);
      return {
        success: false,
        error: carouselData.error?.message || 'Failed to create Instagram Carousel parent container'
      };
    }

    const containerId = carouselData.id;
    console.log(`[Meta Carousel Pipeline] Carousel container created: ${containerId}. Polling status...`);

    // Step 4: Poll parent carousel container
    let isReady = false;
    let attempts = 0;
    const maxAttempts = 20;

    while (!isReady && attempts < maxAttempts) {
      attempts++;
      await new Promise(r => setTimeout(r, 2000));
      const statusUrl = `${GRAPH_BASE_URL}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`;
      const statusRes = await fetch(statusUrl);
      const statusData = await statusRes.json();
      console.log(`[Meta Carousel Pipeline] Container ${containerId} status: ${statusData.status_code || statusData.status || 'unknown'} (poll ${attempts}/${maxAttempts})`);

      if (statusData.status_code === 'FINISHED') {
        isReady = true;
        break;
      } else if (statusData.status_code === 'ERROR' || statusData.status_code === 'EXPIRED') {
        return {
          success: false,
          containerId,
          error: `Instagram carousel container processing failed: ${statusData.status_code}`
        };
      }
    }

    if (!isReady) {
      return {
        success: false,
        containerId,
        error: 'Instagram carousel container did not finish processing before timeout.'
      };
    }

    // Step 5: Publish carousel container
    console.log(`[Meta Carousel Pipeline] Publishing container ${containerId}...`);
    const publishUrl = `${GRAPH_BASE_URL}/${igAccountId}/media_publish`;
    const publishBody = new URLSearchParams({
      creation_id: containerId,
      access_token: accessToken
    });

    const publishRes = await fetch(publishUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: publishBody.toString()
    });

    const publishData = await publishRes.json();
    if (!publishRes.ok || !publishData.id) {
      return {
        success: false,
        containerId,
        error: publishData.error?.message || 'Failed to publish ready Instagram Carousel container'
      };
    }

    const mediaId = publishData.id;

    // Step 6: Fetch permalink
    let permalink: string | undefined;
    try {
      const mediaQueryRes = await fetch(`${GRAPH_BASE_URL}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`);
      const mediaQuery = await mediaQueryRes.json();
      permalink = mediaQuery.permalink;
    } catch {}

    return {
      success: true,
      mediaId,
      containerId,
      permalink: permalink || `https://www.instagram.com/p/${mediaId}/`
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network exception occurred during Instagram Carousel publishing pipeline'
    };
  }
}

/**
 * Ingests real account and media insights directly from Meta Graph API
 */
export async function fetchLiveInstagramInsights(
  igAccountId: string,
  accessToken: string
): Promise<{
  success: boolean;
  accountMetrics?: {
    impressions: number;
    reach: number;
    profileViews: number;
  };
  recentMediaInsights?: Array<{
    mediaId: string;
    reach: number;
    plays: number;
    likes: number;
    comments: number;
    shares: number;
    saved: number;
  }>;
  error?: string;
}> {
  try {
    // 1. Account-level metrics
    const accountInsightsUrl = `${GRAPH_BASE_URL}/${igAccountId}/insights?metric=impressions,reach,profile_views&period=day&access_token=${encodeURIComponent(accessToken)}`;
    const accRes = await fetch(accountInsightsUrl);
    const accData = await accRes.json();

    let impressions = 0;
    let reach = 0;
    let profileViews = 0;

    if (accData.data && Array.isArray(accData.data)) {
      for (const item of accData.data) {
        const val = item.values?.[0]?.value || 0;
        if (item.name === 'impressions') impressions = Number(val);
        if (item.name === 'reach') reach = Number(val);
        if (item.name === 'profile_views') profileViews = Number(val);
      }
    }

    // 2. Recent Media metrics (Meta Graph API v26 uses 'views' instead of deprecated 'plays')
    const mediaUrl = `${GRAPH_BASE_URL}/${igAccountId}/media?fields=id,caption,media_type,like_count,comments_count,insights.metric(reach,views,saved,shares)&limit=10&access_token=${encodeURIComponent(accessToken)}`;
    const mediaRes = await fetch(mediaUrl);
    const mediaData = await mediaRes.json();

    const mediaList: Array<any> = [];
    if (mediaData.data && Array.isArray(mediaData.data)) {
      for (const m of mediaData.data) {
        let mReach = 0;
        let mPlays = 0;
        let mSaved = 0;
        let mShares = 0;

        if (m.insights?.data) {
          for (const mi of m.insights.data) {
            const v = mi.values?.[0]?.value || 0;
            if (mi.name === 'reach') mReach = Number(v);
            if (mi.name === 'views' || mi.name === 'plays') mPlays = Number(v);
            if (mi.name === 'saved') mSaved = Number(v);
            if (mi.name === 'shares') mShares = Number(v);
          }
        }

        mediaList.push({
          mediaId: m.id,
          reach: mReach,
          plays: mPlays,
          likes: Number(m.like_count || 0),
          comments: Number(m.comments_count || 0),
          shares: mShares,
          saved: mSaved
        });
      }
    }

    return {
      success: true,
      accountMetrics: { impressions, reach, profileViews },
      recentMediaInsights: mediaList
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error ingesting live Instagram insights' };
  }
}

/**
 * Ingests live comments on a published Instagram post or reel
 */
export async function fetchLiveInstagramComments(
  mediaId: string,
  accessToken: string
): Promise<{
  success: boolean;
  comments?: Array<{
    id: string;
    text: string;
    timestamp: string;
    username: string;
    likeCount: number;
  }>;
  error?: string;
}> {
  try {
    const url = `${GRAPH_BASE_URL}/${mediaId}/comments?fields=id,text,timestamp,username,like_count&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || data.error) {
      return { success: false, error: data.error?.message || 'Failed to fetch comments' };
    }

    const comments = (data.data || []).map((c: any) => ({
      id: c.id,
      text: c.text || '',
      timestamp: c.timestamp || new Date().toISOString(),
      username: c.username ? `@${c.username}` : '@instagram_user',
      likeCount: Number(c.like_count || 0)
    }));

    return { success: true, comments };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error fetching comments' };
  }
}

/**
 * Publishes a reply to an Instagram comment via Meta Graph API
 */
export async function replyToInstagramComment(
  commentId: string,
  message: string,
  accessToken: string
): Promise<{ success: boolean; replyId?: string; error?: string }> {
  try {
    const url = `${GRAPH_BASE_URL}/${commentId}/replies`;
    const body = new URLSearchParams({
      message: message,
      access_token: accessToken
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    const data = await res.json();
    if (!res.ok || !data.id) {
      return { success: false, error: data.error?.message || 'Failed to publish comment reply' };
    }

    return { success: true, replyId: data.id };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error publishing comment reply' };
  }
}

/**
 * Posts a top-level comment to an Instagram media (post or reel) via Meta Graph API
 */
export async function postCommentToMedia(
  mediaId: string,
  message: string,
  accessToken: string
): Promise<{ success: boolean; commentId?: string; error?: string }> {
  try {
    const url = `${GRAPH_BASE_URL}/${mediaId}/comments`;
    const body = new URLSearchParams({
      message: message,
      access_token: accessToken
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    const data = await res.json();
    if (!res.ok || !data.id) {
      return { success: false, error: data.error?.message || 'Failed to post comment to media' };
    }

    return { success: true, commentId: data.id };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error posting comment to media' };
  }
}

/**
 * Fetches recent posts and reels with captions, engagement metrics, and timestamps
 * for account style analysis and Content DNA learning.
 */
export async function fetchRecentAccountMedia(
  igAccountId: string,
  accessToken: string,
  limit = 20
): Promise<Array<{ id: string; caption?: string; media_type?: string; like_count?: number; comments_count?: number; timestamp?: string }>> {
  try {
    const url = `${GRAPH_BASE_URL}/${igAccountId}/media?fields=id,caption,media_type,like_count,comments_count,timestamp&limit=${limit}&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.data && Array.isArray(data.data)) {
      return data.data;
    }
    return [];
  } catch (err) {
    console.warn('[Meta Graph API] Failed to fetch recent media:', err);
    return [];
  }
}
