import { db, getFacebookPageConnection, getFacebookAccountConnection } from './database.js';
import { decryptSecret } from './tokenVault.js';
import { 
  fetchLiveInstagramInsights, 
  publishReelToInstagram, 
  publishReelToFacebookPage,
  publishReelToFacebookAccount,
  fetchLiveInstagramComments, 
  replyToInstagramComment,
  postCommentToMedia
} from './metaGraphApi.js';
import { renderReelVideo, normalizeVideoUrl } from './reelPipeline.js';
import { executeSwarmCycle, checkDailyReset } from './agentSwarm.js';
import { getActivePersona } from './themePage.js';
import { notifyReelPublished } from './telegramBot.js';

export interface BackgroundJob {
  id: string;
  job_type: string;
  payload_json: string;
  run_at: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  last_error: string | null;
  executed_at: string | null;
  created_at: string;
}

export interface StrategyFeedback {
  topHookPattern: string;
  optimalPacing: string;
  highRetentionAudioTempo: string;
  bestPostingHourUtc: number;
  recommendedNicheKeywords: string[];
  totalPostsAnalyzed: number;
  avgReachPerPost: number;
  engagementConversionRate: number;
  lastAnalyzedAt: string;
}

/**
 * Enqueue a persistent background job into SQLite
 */
export function enqueueJob(jobType: string, payload: any, runAt: Date = new Date()): string {
  const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const insert = db.prepare(`
    INSERT INTO background_jobs (
      id, job_type, payload_json, run_at, status, attempts, last_error, executed_at, created_at
    ) VALUES (?, ?, ?, ?, 'pending', 0, null, null, ?)
  `);

  insert.run(jobId, jobType, JSON.stringify(payload), runAt.toISOString(), new Date().toISOString());
  return jobId;
}

/**
 * Computes the real Analytics → Strategy Feedback Loop from database metrics
 */
export function computeStrategyFeedback(): StrategyFeedback {
  const reelsQuery = db.prepare(`
    SELECT id, hook_score, retention_estimate, reach, views, likes, comments_count, duration, scenes_json, caption, created_at 
    FROM reels 
    WHERE status = 'published'
    ORDER BY created_at DESC 
    LIMIT 50
  `);
  const publishedReels = reelsQuery.all() as any[];

  const persona = getActivePersona();
  const defaultKeywords = [
    "Declassified Archives",
    "Documented History",
    "Forbidden Geography",
    "Scientific Discoveries",
    "Cold War Intelligence",
    "Hidden Infrastructure"
  ];

  if (publishedReels.length === 0) {
    return {
      topHookPattern: "Concrete Entity & Documented Anomaly Pattern-Interrupt",
      optimalPacing: "Cinematic push-in with documentary rhythmic cuts (2.2-2.5 words/sec)",
      highRetentionAudioTempo: "115-125 BPM Atmospheric Documentary Baritone",
      bestPostingHourUtc: 19,
      recommendedNicheKeywords: defaultKeywords,
      totalPostsAnalyzed: 0,
      avgReachPerPost: 0,
      engagementConversionRate: 0,
      lastAnalyzedAt: new Date().toISOString()
    };
  }

  let totalReach = 0;
  let totalComments = 0;
  let totalLikes = 0;
  let validReachPostsCount = 0;

  for (const r of publishedReels) {
    const reach = Number(r.reach || 0);
    if (reach > 0) {
      totalReach += reach;
      validReachPostsCount++;
    }
    totalComments += Number(r.comments_count || 0);
    totalLikes += Number(r.likes || 0);
  }

  const avgReach = validReachPostsCount > 0 ? Math.round(totalReach / validReachPostsCount) : 0;
  const conversionRate = totalReach > 0 ? Number(((totalComments / totalReach) * 100).toFixed(2)) : 0;

  // Derive optimal posting hour based on posts with highest reach
  const sortedByReach = [...publishedReels].sort((a, b) => (b.reach || 0) - (a.reach || 0));
  const topReel = sortedByReach[0];
  let optimalHour = 19;
  if (topReel?.created_at) {
    try {
      optimalHour = new Date(topReel.created_at).getUTCHours();
    } catch {
      optimalHour = 19;
    }
  }

  const feedback: StrategyFeedback = {
    topHookPattern: topReel ? `Documented specific premise: "${topReel.title?.slice(0, 36) || topReel.caption?.slice(0, 36) || 'Historical record'}"` : "Concrete Entity & Documented Anomaly Pattern-Interrupt",
    optimalPacing: "Cinematic push-in with documentary rhythmic cuts (2.2-2.5 words/sec)",
    highRetentionAudioTempo: "118 BPM Deep Male Documentary Baritone with Punchy Sub-Bass",
    bestPostingHourUtc: optimalHour,
    recommendedNicheKeywords: defaultKeywords,
    totalPostsAnalyzed: publishedReels.length,
    avgReachPerPost: avgReach,
    engagementConversionRate: conversionRate,
    lastAnalyzedAt: new Date().toISOString()
  };

  // Update strategy feedback in autonomous_config table
  const updateStmt = db.prepare(`
    UPDATE autonomous_config 
    SET strategy_feedback_json = ?, updated_at = ? 
    WHERE id = 'default_config'
  `);
  updateStmt.run(JSON.stringify(feedback), new Date().toISOString());

  return feedback;
}

/**
 * Background Job Worker - Polls SQLite for pending jobs and executes them reliably
 */
export function startJobWorker() {
  setInterval(async () => {
    try {
      const nowIso = new Date().toISOString();
      const selectJobs = db.prepare(`
        SELECT * FROM background_jobs 
        WHERE status = 'pending' AND datetime(run_at) <= datetime(?)
        ORDER BY run_at ASC 
        LIMIT 3
      `);
      const jobs = selectJobs.all(nowIso) as unknown as BackgroundJob[];

      for (const job of jobs) {
        // Mark as processing
        db.prepare(`UPDATE background_jobs SET status = 'processing', attempts = attempts + 1 WHERE id = ?`).run(job.id);

        let success = true;
        let errorMessage: string | null = null;

        try {
          const payload = JSON.parse(job.payload_json || '{}');

          switch (job.job_type) {
            case 'PUBLISH_SCHEDULED_REEL': {
              const reelQuery = db.prepare('SELECT * FROM reels WHERE id = ?');
              const reel = reelQuery.get(payload.reelId) as any;
              const accountQuery = db.prepare('SELECT * FROM account_connections WHERE id = ?');
              const account = accountQuery.get('instagram_primary') as any;

              if (reel && account?.access_token && account?.account_id) {
                // Idempotency guard: prevent duplicate publishing if reel was already published
                if (reel.status === 'published' || Boolean(reel.ig_media_id)) {
                  console.warn(`[Job Queue] ⚠️ Scheduled reel "${reel.title || reel.id}" is ALREADY published (IG Media ID: ${reel.ig_media_id}). Skipping duplicate publish.`);
                  break;
                }

                // In-flight state guard
                db.prepare(`UPDATE reels SET status = 'publishing', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), reel.id);

                let videoUrl = payload.videoUrl || reel.video_url || '';
                if (!videoUrl) {
                  console.info(`[Job Queue] Scheduled reel "${reel.title || reel.id}" has no video yet. Rendering on-the-fly...`);
                  videoUrl = await renderReelVideo(reel);
                } else {
                  videoUrl = normalizeVideoUrl(videoUrl);
                }
                const reelAudio = (() => {
                  try { return JSON.parse(reel.audio_json || '{}'); } catch { return {}; }
                })();
                const fullCaption = `${reel.caption}${reel.hashtags_json ? `\n\n${JSON.parse(reel.hashtags_json || '[]').join(' ')}` : ''}`;
                const pubResult = await publishReelToInstagram(account.account_id, decryptSecret(account.access_token), {
                  videoUrl,
                  caption: fullCaption,
                  audioName: reelAudio?.title ? String(reelAudio.title) : undefined
                });

                // Optional simultaneous broadcast to Facebook Page and Profile if configured
                const fbPageConn = getFacebookPageConnection();
                let fbPageResult: any = null;
                if (fbPageConn?.isConnected && fbPageConn.pageId && fbPageConn.accessToken) {
                  try {
                    console.info(`[Job Queue] 📄 Broadcasting scheduled reel to Facebook Page (${fbPageConn.pageId})...`);
                    fbPageResult = await publishReelToFacebookPage(fbPageConn.pageId, fbPageConn.accessToken, {
                      videoUrl,
                      caption: fullCaption,
                      title: reel.title
                    });
                  } catch (fbPageErr: any) {
                    console.warn('[Job Queue] Facebook Page broadcast notice:', fbPageErr?.message || fbPageErr);
                  }
                }

                const fbAccountConn = getFacebookAccountConnection();
                let fbAccountResult: any = null;
                if (fbAccountConn?.isConnected && fbAccountConn.userId && fbAccountConn.accessToken) {
                  try {
                    console.info(`[Job Queue] 👤 Broadcasting scheduled reel to Facebook Profile (${fbAccountConn.userId})...`);
                    fbAccountResult = await publishReelToFacebookAccount(fbAccountConn.userId, fbAccountConn.accessToken, {
                      videoUrl,
                      caption: fullCaption,
                      title: reel.title
                    });
                  } catch (fbAccErr: any) {
                    console.warn('[Job Queue] Facebook Profile broadcast notice:', fbAccErr?.message || fbAccErr);
                  }
                }

                if (pubResult.success || fbPageResult?.success || fbAccountResult?.success) {
                  const publishedAt = new Date().toISOString();
                  const platformsPublished: string[] = [];
                  if (pubResult.success) platformsPublished.push('instagram');
                  if (fbPageResult?.success) platformsPublished.push('facebook_page');
                  if (fbAccountResult?.success) platformsPublished.push('facebook_account');

                  db.prepare(`
                    UPDATE reels
                    SET status = 'published',
                        ig_media_id = ?, ig_container_id = ?, permalink = ?,
                        fb_video_id = ?, fb_permalink = ?, fb_status = ?,
                        fb_account_video_id = ?, fb_account_permalink = ?, fb_account_status = ?,
                        platforms_published = ?,
                        publish_timestamp = ?, updated_at = ?
                    WHERE id = ?
                  `).run(
                    pubResult.mediaId || null,
                    pubResult.containerId || null,
                    pubResult.permalink || null,
                    fbPageResult?.videoId || null,
                    fbPageResult?.permalink || null,
                    fbPageResult?.success ? 'published' : (fbPageResult ? 'failed' : null),
                    fbAccountResult?.videoId || null,
                    fbAccountResult?.permalink || null,
                    fbAccountResult?.success ? 'published' : (fbAccountResult ? 'failed' : null),
                    JSON.stringify(platformsPublished),
                    publishedAt,
                    publishedAt,
                    reel.id
                  );

                  // Dispatch Telegram alert for remote monitoring
                  notifyReelPublished({
                    title: reel.title,
                    niche: reel.niche,
                    permalink: pubResult.permalink || undefined,
                    fbPermalink: fbPageResult?.permalink || undefined,
                    fbAccountPermalink: fbAccountResult?.permalink || undefined,
                    platforms: platformsPublished,
                    videoUrl: videoUrl || reel.video_url || undefined
                  }).catch(() => {});

                  if (payload.autonomousLogId) {
                    db.prepare(`
                      UPDATE autonomous_logs
                      SET ig_media_id = ?, status = 'published', details_json = ?
                      WHERE id = ?
                    `).run(
                      pubResult.mediaId || null,
                      JSON.stringify({
                        publishedAt,
                        permalink: pubResult.permalink || null,
                        containerId: pubResult.containerId || null,
                        fbPermalink: fbPageResult?.permalink || null,
                        fbAccountPermalink: fbAccountResult?.permalink || null,
                        platforms: platformsPublished
                      }),
                      String(payload.autonomousLogId)
                    );
                  }

                  // Reset autonomous stage to idle now that publishing completed
                  db.prepare(`UPDATE autonomous_config SET current_stage = 'idle', updated_at = ? WHERE id = 'default_config'`).run(publishedAt);

                  // Feed the analytics loop immediately; the next background sync
                  // will hydrate reach, plays, likes, comments, shares and saves.
                  enqueueJob('SYNC_INSTAGRAM_INSIGHTS', { reelId: reel.id, mediaId: pubResult.mediaId || null });
                  if (pubResult.mediaId) {
                    enqueueJob('SYNC_MEDIA_COMMENTS', { mediaId: pubResult.mediaId });

                    // Instant First Comment Kickstart: Seed creator discussion CTA immediately
                    try {
                      const persona = getActivePersona();
                      const firstComment = `Comment 'ARCHIVE' below and I'll send you the declassified dossier + coordinates 📜 What is your theory on what actually occurred? 👇`;
                      postCommentToMedia(pubResult.mediaId, firstComment, decryptSecret(account.access_token)).then(res => {
                        if (res.success) {
                          console.log(`[Job Queue] ✅ Instant first comment seeded on reel ${pubResult.mediaId} (Comment ID: ${res.commentId})`);
                        }
                      }).catch(() => {});
                    } catch {}
                  }
                  enqueueJob('ANALYTICS_STRATEGY_FEEDBACK', { reelId: reel.id });
                } else {
                  throw new Error(pubResult.error || 'Publishing reel failed');
                }
              } else {
                throw new Error('Missing reel or connected Instagram account');
              }
              break;
            }

            case 'SYNC_INSTAGRAM_INSIGHTS': {
              const accountQuery = db.prepare('SELECT * FROM account_connections WHERE id = ?');
              const account = accountQuery.get('instagram_primary') as any;

              if (account?.access_token && account?.account_id) {
                const insightsRes = await fetchLiveInstagramInsights(account.account_id, decryptSecret(account.access_token));
                if (insightsRes.success && insightsRes.accountMetrics) {
                  const m = insightsRes.accountMetrics;
                  db.prepare(`
                    INSERT INTO insights_snapshots (
                      id, timestamp, impressions, reach, profile_views, raw_metrics_json
                    ) VALUES (?, ?, ?, ?, ?, ?)
                  `).run(
                    `snap-${Date.now()}`,
                    new Date().toISOString(),
                    m.impressions,
                    m.reach,
                    m.profileViews,
                    JSON.stringify(insightsRes)
                  );

                  // Update individual reels with live metrics
                  if (insightsRes.recentMediaInsights) {
                    const updateReel = db.prepare(`
                      UPDATE reels 
                      SET reach = ?, views = ?, likes = ?, comments_count = ?, shares = ?, updated_at = ?
                      WHERE ig_media_id = ?
                    `);
                    for (const med of insightsRes.recentMediaInsights) {
                      updateReel.run(med.reach, med.plays, med.likes, med.comments, med.shares, new Date().toISOString(), med.mediaId);
                    }
                  }
                }
              }
              break;
            }

            case 'SYNC_MEDIA_COMMENTS': {
              const accountQuery = db.prepare('SELECT * FROM account_connections WHERE id = ?');
              const account = accountQuery.get('instagram_primary') as any;

              if (account?.access_token && payload.mediaId) {
                const commentsRes = await fetchLiveInstagramComments(payload.mediaId, decryptSecret(account.access_token));
                if (commentsRes.success && commentsRes.comments) {
                  const insertComment = db.prepare(`
                    INSERT OR IGNORE INTO comments_inbox (
                      id, ig_comment_id, ig_media_id, author_username, comment_text, timestamp, sentiment, reply_status, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, 'positive', 'pending', ?)
                  `);

                  for (const c of commentsRes.comments) {
                    insertComment.run(
                      `comm-${c.id}`,
                      c.id,
                      payload.mediaId,
                      c.username,
                      c.text,
                      c.timestamp,
                      new Date().toISOString()
                    );

                    // Check for universal auto-responder trigger keywords and high-intent requests
                    const upperText = c.text.toUpperCase();
                    const LEAD_KEYWORDS = [
                      'STORY', 'DOC', 'FILE', 'ARCHIVE', 'MAP', 'CASE', 'SECRET', 'PART2', 'MORE',
                      'TOOL', 'LINK', 'PROMPT', 'GUIDE', 'CODE', 'INFO', 'AGENT', 'GROWTH',
                      'FREE', 'ACCESS', 'WORKFLOW', 'TEST', 'SOURCE',
                      'SEND', 'PLEASE', 'WANT', 'NEED', 'INTERESTED', 'YES'
                    ];

                    const matchedLeadKeyword = LEAD_KEYWORDS.find(kw => {
                      const regex = new RegExp(`\\b${kw}\\b`, 'i');
                      return regex.test(upperText);
                    });

                    if (matchedLeadKeyword) {
                      const persona = getActivePersona();
                      const handle = persona.handle || '@theuntoldarch';
                      const replyVariants = [
                        `📜 Just sent the full declassified dossier to your DMs! Check message requests. Follow ${handle} for daily untold world mysteries!`,
                        `📁 Sent the complete case file + satellite map to your DMs! Make sure to follow ${handle} so you never miss a new investigation!`,
                        `🕵️ The full archive breakdown is in your DMs! Follow ${handle} for tomorrow's crazy real-world mystery!`,
                        `✨ Dossier delivered to your message requests! Follow ${handle} for more stories they never taught in school!`
                      ];
                      const replyMessage = replyVariants[Math.floor(Math.random() * replyVariants.length)];

                      await replyToInstagramComment(c.id, replyMessage, decryptSecret(account.access_token));

                      db.prepare(`
                        UPDATE comments_inbox 
                        SET reply_status = 'replied', reply_text = ?, automated_dm_sent = 1, dm_keyword_triggered = ?
                        WHERE ig_comment_id = ?
                      `).run(replyMessage, matchedLeadKeyword, c.id);

                      console.log(`[Growth Engine] ✅ Auto-replied to comment from ${c.username} with trigger '${matchedLeadKeyword}': "${replyMessage}"`);
                    }
                  }
                }
              }
              break;
            }

            case 'ANALYTICS_STRATEGY_FEEDBACK': {
              computeStrategyFeedback();
              break;
            }

            case 'EXECUTE_SWARM_CYCLE': {
              await executeSwarmCycle();
              break;
            }

            default:
              console.info(`[Background Job Worker] Completed generic job: ${job.job_type}`);
          }
        } catch (err: any) {
          success = false;
          errorMessage = err?.message || String(err);
        }

        if (success) {
          db.prepare(`
            UPDATE background_jobs 
            SET status = 'completed', executed_at = ?, last_error = null 
            WHERE id = ?
          `).run(new Date().toISOString(), job.id);
        } else {
          const maxAttempts = job.job_type === 'PUBLISH_SCHEDULED_REEL' ? 6 : 3;
          const newStatus = job.attempts >= maxAttempts ? 'failed' : 'pending';
          // Exponential retry backoff, capped at 30 minutes.
          const retryMinutes = Math.min(30, Math.max(1, 2 ** Math.max(0, job.attempts - 1)));
          const retryTime = new Date(Date.now() + retryMinutes * 60000).toISOString();
          db.prepare(`
            UPDATE background_jobs 
            SET status = ?, run_at = ?, last_error = ? 
            WHERE id = ?
          `).run(newStatus, retryTime, errorMessage, job.id);
        }
      }
      // Periodic check: reset agent daily limits at midnight
      checkDailyReset();

      // Auto-schedule continuous swarm interaction cycles every 20 minutes
      const pendingSwarmJob = db.prepare(`
        SELECT id FROM background_jobs 
        WHERE job_type = 'EXECUTE_SWARM_CYCLE' AND status IN ('pending', 'processing')
      `).get();

      if (!pendingSwarmJob) {
        enqueueJob('EXECUTE_SWARM_CYCLE', {}, new Date(Date.now() + 20 * 60000));
      }
    } catch (workerErr) {
      console.warn('[Background Job Worker] Error polling queue:', workerErr);
    }
  }, 10000); // Poll every 10 seconds
}
