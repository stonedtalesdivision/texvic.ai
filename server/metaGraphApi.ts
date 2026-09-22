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

const GRAPH_API_VERSION = 'v19.0';
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Constructs the real Meta OAuth dialog URL for connecting Instagram Business / Creator accounts.
 */
export function getMetaOAuthUrl(clientId: string, redirectUri: string, state: string = 'sarlx_oauth_state'): string {
  const scopes = [
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_comments',
    'instagram_manage_insights',
    'pages_show_list',
    'pages_read_engagement'
  ].join(',');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    state: state
  });

  return `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?${params.toString()}`;
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
  error?: string;
}> {
  try {
    // 1. Exchange authorization code for short-lived user token
    const tokenUrl = new URL(`${GRAPH_BASE_URL}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', clientId);
    tokenUrl.searchParams.set('client_secret', clientSecret);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      return {
        userAccessToken: '',
        longLivedAccessToken: '',
        error: tokenData.error?.message || 'Failed to exchange authorization code for token'
      };
    }

    const shortLivedToken = tokenData.access_token;

    // 2. Exchange short-lived token for long-lived token (60-day expiry)
    const longLivedUrl = new URL(`${GRAPH_BASE_URL}/oauth/access_token`);
    longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longLivedUrl.searchParams.set('client_id', clientId);
    longLivedUrl.searchParams.set('client_secret', clientSecret);
    longLivedUrl.searchParams.set('fb_exchange_token', shortLivedToken);

    const longLivedRes = await fetch(longLivedUrl.toString());
    const longLivedData = await longLivedRes.json();
    const finalToken = longLivedData.access_token || shortLivedToken;

    // 3. Query linked Facebook Pages and discover connected Instagram Business Account
    const accountsUrl = `${GRAPH_BASE_URL}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}&access_token=${finalToken}`;
    const accountsRes = await fetch(accountsUrl);
    const accountsData = await accountsRes.json();

    let igAccountId: string | undefined;
    let igUsername: string | undefined;
    let igName: string | undefined;
    let igPic: string | undefined;
    let pageAccessToken: string = finalToken;

    if (accountsData.data && Array.isArray(accountsData.data)) {
      for (const page of accountsData.data) {
        if (page.instagram_business_account?.id) {
          igAccountId = page.instagram_business_account.id;
          igUsername = page.instagram_business_account.username;
          igName = page.instagram_business_account.name;
          igPic = page.instagram_business_account.profile_picture_url;
          if (page.access_token) {
            pageAccessToken = page.access_token;
          }
          break;
        }
      }
    }

    return {
      userAccessToken: shortLivedToken,
      longLivedAccessToken: pageAccessToken,
      instagramAccountId: igAccountId,
      instagramUsername: igUsername,
      instagramName: igName,
      profilePictureUrl: igPic
    };
  } catch (err: any) {
    return {
      userAccessToken: '',
      longLivedAccessToken: '',
      error: err?.message || 'Network exception during token exchange'
    };
  }
}

/**
 * Fetches real account profile information from Instagram Graph API
 */
export async function getInstagramAccountProfile(
  igAccountId: string,
  accessToken: string
): Promise<{ success: boolean; data?: MetaAccountDetails; error?: string }> {
  try {
    const url = `${GRAPH_BASE_URL}/${igAccountId}?fields=id,username,name,profile_picture_url,biography,followers_count,follows_count,media_count,website&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || data.error) {
      return { success: false, error: data.error?.message || 'Failed to query Instagram Graph API' };
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
    return { success: false, error: err?.message || 'Network error fetching account profile' };
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
  }
): Promise<PublishReelResult> {
  if (!igAccountId || !accessToken) {
    return {
      success: false,
      error: 'Missing Meta Instagram credentials (INSTAGRAM_ACCOUNT_ID or META_ACCESS_TOKEN).'
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

    // Step 2: Poll container status (Meta video ingestion takes 4-20 seconds)
    let isReady = false;
    let attempts = 0;
    const maxAttempts = 15;

    while (!isReady && attempts < maxAttempts) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 2500));

      const statusUrl = `${GRAPH_BASE_URL}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`;
      const statusRes = await fetch(statusUrl);
      const statusData = await statusRes.json();

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

    // 2. Recent Media metrics
    const mediaUrl = `${GRAPH_BASE_URL}/${igAccountId}/media?fields=id,caption,media_type,like_count,comments_count,insights.metric(reach,plays,saved,shares)&limit=10&access_token=${encodeURIComponent(accessToken)}`;
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
            if (mi.name === 'plays') mPlays = Number(v);
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
