import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { db } from './database.js';

export interface StoragePruneCategories {
  reelsBytes: number;
  postsBytes: number;
  ttsBytes: number;
  stockVideosBytes: number;
  archivalCacheBytes: number;
  browserCacheBytes: number;
  tempComposedBytes: number;
  coversBytes: number;
  systemTempBytes: number;
}

export interface StoragePruneResult {
  reelsPruned: number;
  postsPruned: number;
  bytesFreed: number;
  details: string[];
  categories: StoragePruneCategories;
}

/**
 * Safely unlinks a file and returns its size in bytes, or 0 if unlinking fails.
 */
async function safeUnlink(filePath: string): Promise<number> {
  try {
    if (!fsSync.existsSync(filePath)) return 0;
    const stat = await fs.stat(filePath).catch(() => null);
    const size = stat?.size || 0;
    await fs.unlink(filePath).catch(() => {});
    return size;
  } catch {
    return 0;
  }
}

/**
 * Safely removes a directory and all its contents, returning total bytes freed.
 */
async function safeRmDir(dirPath: string): Promise<number> {
  try {
    if (!fsSync.existsSync(dirPath)) return 0;
    let bytes = 0;
    const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        bytes += await safeRmDir(fullPath);
      } else {
        const stat = await fs.stat(fullPath).catch(() => null);
        bytes += stat?.size || 0;
        await fs.unlink(fullPath).catch(() => {});
      }
    }
    await fs.rm(dirPath, { recursive: true, force: true }).catch(() => {});
    return bytes;
  } catch {
    return 0;
  }
}

/**
 * Recursively measures the total byte size of a directory.
 */
export async function getDirSizeBytes(dirPath: string): Promise<number> {
  try {
    if (!fsSync.existsSync(dirPath)) return 0;
    let bytes = 0;
    const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        bytes += await getDirSizeBytes(full);
      } else {
        const stat = await fs.stat(full).catch(() => null);
        bytes += stat?.size || 0;
      }
    }
    return bytes;
  } catch {
    return 0;
  }
}

/**
 * Automatically purges published reels older than maxAgeHours (default: 24h).
 * Removes the heavy physical MP4 file from VPS storage, clears scratch audio and covers,
 * and updates the database record (video_url = NULL) so cloud VPS storage stays lean
 * while preserving analytics, views, reach, caption, and Instagram/FB/YT permalinks.
 */
export async function pruneExpiredPublishedReels(maxAgeHours = 24): Promise<{ count: number; bytesFreed: number; details: string[] }> {
  const cutoffMs = Date.now() - maxAgeHours * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  const expiredReels = db.prepare(`
    SELECT id, title, video_url, cover_path, publish_timestamp, updated_at 
    FROM reels 
    WHERE status = 'published' 
      AND (
        (publish_timestamp IS NOT NULL AND publish_timestamp <= ?)
        OR (publish_timestamp IS NULL AND updated_at <= ?)
      )
  `).all(cutoffIso, cutoffIso) as any[];

  let count = 0;
  let bytesFreed = 0;
  const details: string[] = [];

  for (const reel of expiredReels) {
    try {
      let reelBytes = 0;

      // 1. Delete finished MP4 video file from data/media/reels/
      if (reel.video_url) {
        const match = reel.video_url.match(/\/media\/reels\/([^?#]+)/);
        const filename = match ? match[1] : path.basename(reel.video_url);
        const filePath = path.join(process.cwd(), 'data', 'media', 'reels', filename);
        reelBytes += await safeUnlink(filePath);
      }

      // 2. Delete concatenated master TTS audio if present
      const ttsMasters = [
        path.join(process.cwd(), 'data', 'media', 'tts', `master-${reel.id}.mp3`),
        path.join(process.cwd(), 'data', 'media', 'tts', `master-reel-${reel.id}.mp3`)
      ];
      for (const m of ttsMasters) {
        reelBytes += await safeUnlink(m);
      }

      // 3. Delete cover image if present
      if (reel.cover_path && fsSync.existsSync(reel.cover_path)) {
        reelBytes += await safeUnlink(reel.cover_path);
      }
      const genericCover = path.join(process.cwd(), 'data', 'media', 'covers', `${reel.id}-cover.jpg`);
      reelBytes += await safeUnlink(genericCover);

      // 4. Delete composer fragments in data/media/composed and data/composer
      const composerDirs = [
        path.join(process.cwd(), 'data', 'media', 'composed'),
        path.join(process.cwd(), 'data', 'composer')
      ];
      for (const compDir of composerDirs) {
        if (fsSync.existsSync(compDir)) {
          const files = await fs.readdir(compDir).catch(() => []);
          for (const file of files) {
            if (file.includes(reel.id)) {
              const fullPath = path.join(compDir, file);
              const stat = await fs.stat(fullPath).catch(() => null);
              if (stat?.isDirectory()) {
                reelBytes += await safeRmDir(fullPath);
              } else {
                reelBytes += await safeUnlink(fullPath);
              }
            }
          }
        }
      }

      // 5. Update database record: clear physical video_url without deleting the reel row
      // This preserves Instagram analytics, view counts, likes, and permalinks in the dashboard!
      db.prepare(`
        UPDATE reels 
        SET video_url = NULL, cover_path = NULL, updated_at = ? 
        WHERE id = ?
      `).run(new Date().toISOString(), reel.id);

      db.prepare(`
        DELETE FROM background_jobs 
        WHERE json_extract(payload_json, '$.reelId') = ?
      `).run(reel.id);

      bytesFreed += reelBytes;
      count++;
      const mb = (reelBytes / (1024 * 1024)).toFixed(1);
      details.push(`Pruned 24h-old published reel "${reel.title}" (${reel.id}) — freed ${mb} MB`);
      console.log(`[Storage Retention] 🗑️ Pruned 24h-old published reel "${reel.title}" (${reel.id}) — freed ${mb} MB`);
    } catch (err: any) {
      console.warn(`[Storage Retention] Failed to prune reel ${reel.id}:`, err?.message || err);
    }
  }

  return { count, bytesFreed, details };
}

/**
 * Prunes orphaned or failed video files from data/media/reels/ older than maxAgeHours.
 * Catches leftover files from failed renders, crashes, or deleted records.
 */
export async function pruneOrphanedAndFailedReels(maxAgeHours = 24): Promise<{ count: number; bytesFreed: number; details: string[] }> {
  const cutoffMs = Date.now() - maxAgeHours * 60 * 60 * 1000;
  const reelsDir = path.join(process.cwd(), 'data', 'media', 'reels');

  let count = 0;
  let bytesFreed = 0;
  const details: string[] = [];

  if (!fsSync.existsSync(reelsDir)) {
    return { count, bytesFreed, details };
  }

  // Active unposted reels whose video files MUST be preserved
  const activeRows = db.prepare(`
    SELECT video_url FROM reels 
    WHERE status NOT IN ('published', 'failed', 'video_failed') 
      AND video_url IS NOT NULL
  `).all() as any[];

  const activeFilenames = new Set<string>();
  for (const r of activeRows) {
    if (r.video_url) {
      const match = r.video_url.match(/\/media\/reels\/([^?#]+)/);
      if (match) activeFilenames.add(decodeURIComponent(match[1]));
      activeFilenames.add(path.basename(r.video_url));
    }
  }

  const files = await fs.readdir(reelsDir).catch(() => []);
  for (const file of files) {
    if (activeFilenames.has(file)) continue;

    const fullPath = path.join(reelsDir, file);
    const stat = await fs.stat(fullPath).catch(() => null);
    if (stat && stat.mtimeMs <= cutoffMs) {
      const size = stat.size;
      await fs.unlink(fullPath).catch(() => {});
      bytesFreed += size;
      count++;
      const mb = (size / (1024 * 1024)).toFixed(1);
      details.push(`Pruned orphaned/stale reel video "${file}" — freed ${mb} MB`);
      console.log(`[Storage Retention] 🗑️ Pruned orphaned/stale reel video "${file}" — freed ${mb} MB`);
    }
  }

  return { count, bytesFreed, details };
}

/**
 * Automatically purges published carousel post slide images older than maxAgeHours (default: 24h).
 */
export async function pruneExpiredPublishedPosts(maxAgeHours = 24): Promise<{ count: number; bytesFreed: number; details: string[] }> {
  const cutoffMs = Date.now() - maxAgeHours * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  const expiredPosts = db.prepare(`
    SELECT id, title, slides_json, updated_at 
    FROM posts 
    WHERE status = 'published' AND updated_at <= ?
  `).all(cutoffIso) as any[];

  let count = 0;
  let bytesFreed = 0;
  const details: string[] = [];

  for (const post of expiredPosts) {
    try {
      let postBytes = 0;
      let slides: any[] = [];
      try {
        slides = JSON.parse(post.slides_json || '[]');
      } catch {}

      for (const slide of slides) {
        if (slide?.imageUrl && slide.imageUrl.includes('/media/posts/')) {
          const match = slide.imageUrl.match(/\/media\/posts\/([^?#]+)/);
          const filename = match ? match[1] : path.basename(slide.imageUrl);
          const filePath = path.join(process.cwd(), 'data', 'media', 'posts', filename);
          postBytes += await safeUnlink(filePath);
        }
      }

      // Mark slides cleaned without destroying post analytics
      db.prepare('UPDATE posts SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), post.id);

      bytesFreed += postBytes;
      count++;
      const mb = (postBytes / (1024 * 1024)).toFixed(1);
      details.push(`Pruned published carousel slides "${post.title}" (${post.id}) — freed ${mb} MB`);
    } catch (err: any) {
      console.warn(`[Storage Retention] Failed to prune post ${post.id}:`, err?.message || err);
    }
  }

  return { count, bytesFreed, details };
}

/**
 * Prunes intermediate composer renders, scene fragments, temp folders, and subtitles.
 * default maxAgeHours: 2 hours.
 */
export async function pruneComposedAndIntermediateMedia(maxAgeHours = 2): Promise<{ bytesFreed: number; details: string[] }> {
  const cutoffMs = Date.now() - maxAgeHours * 60 * 60 * 1000;
  let bytesFreed = 0;
  const details: string[] = [];

  const intermediateDirs = [
    path.join(process.cwd(), 'data', 'media', 'composed'),
    path.join(process.cwd(), 'data', 'composer'),
    path.join(process.cwd(), 'data', 'media', 'hyperframes-work'),
    path.join(process.cwd(), 'data', 'media', 'generated-scenes'),
    path.join(process.cwd(), 'data', 'media', 'temp'),
    path.join(process.cwd(), 'data', 'media', 'subtitles')
  ];

  for (const dir of intermediateDirs) {
    if (!fsSync.existsSync(dir)) continue;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const stat = await fs.stat(fullPath).catch(() => null);
        if (!stat || stat.mtimeMs > cutoffMs) continue;

        if (entry.isDirectory()) {
          const freed = await safeRmDir(fullPath);
          bytesFreed += freed;
          if (freed > 0) {
            details.push(`Pruned temp work directory "${entry.name}" (${(freed / 1024 / 1024).toFixed(1)} MB)`);
          }
        } else {
          const freed = await safeUnlink(fullPath);
          bytesFreed += freed;
        }
      }
    } catch (err: any) {
      console.warn(`[Storage Retention] Error sweeping intermediate dir ${dir}:`, err?.message || err);
    }
  }

  return { bytesFreed, details };
}

/**
 * Prunes all stale TTS audio clips and master files older than maxAgeHours (default: 2h).
 * Matches all .mp3, .wav, .pcm, .l16, and manifest files.
 */
export async function pruneTtsMedia(maxAgeHours = 2): Promise<{ bytesFreed: number; details: string[] }> {
  const cutoffMs = Date.now() - maxAgeHours * 60 * 60 * 1000;
  let bytesFreed = 0;
  const details: string[] = [];

  const ttsDir = path.join(process.cwd(), 'data', 'media', 'tts');
  if (!fsSync.existsSync(ttsDir)) return { bytesFreed, details };

  try {
    const files = await fs.readdir(ttsDir).catch(() => []);
    for (const f of files) {
      const fullPath = path.join(ttsDir, f);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (!stat || stat.mtimeMs > cutoffMs) continue;

      // Clean all audio/text artifacts older than cutoff
      if (
        f.endsWith('.mp3') ||
        f.endsWith('.wav') ||
        f.endsWith('.pcm') ||
        f.endsWith('.l16') ||
        f.endsWith('.txt')
      ) {
        const freed = await safeUnlink(fullPath);
        bytesFreed += freed;
      }
    }
  } catch (err: any) {
    console.warn('[Storage Retention] Error sweeping TTS directory:', err?.message || err);
  }

  return { bytesFreed, details };
}

/**
 * Prunes downloaded stock videos, archival images, and preview caches by age and size budget.
 */
export async function pruneStockAndArchivalCaches(
  maxAgeHours = 24,
  maxStockMb = 300,
  maxArchivalMb = 200,
  maxStockCacheMb = 150
): Promise<{ stockVideosBytes: number; archivalCacheBytes: number; details: string[] }> {
  const cutoffMs = Date.now() - maxAgeHours * 60 * 60 * 1000;
  let stockVideosBytes = 0;
  let archivalCacheBytes = 0;
  const details: string[] = [];

  // 1. Stock Videos (data/media/stock-videos)
  const stockDir = path.join(process.cwd(), 'data', 'media', 'stock-videos');
  if (fsSync.existsSync(stockDir)) {
    try {
      const files = await fs.readdir(stockDir).catch(() => []);
      const fileStats: { name: string; path: string; size: number; mtimeMs: number }[] = [];

      for (const f of files) {
        const fPath = path.join(stockDir, f);
        const stat = await fs.stat(fPath).catch(() => null);
        if (stat) {
          if (stat.mtimeMs <= cutoffMs) {
            stockVideosBytes += await safeUnlink(fPath);
          } else {
            fileStats.push({ name: f, path: fPath, size: stat.size, mtimeMs: stat.mtimeMs });
          }
        }
      }

      // Enforce total budget: if remaining size > maxStockMb, delete oldest first
      let currentTotal = fileStats.reduce((acc, f) => acc + f.size, 0);
      const targetBudget = maxStockMb * 1024 * 1024;
      if (currentTotal > targetBudget) {
        fileStats.sort((a, b) => a.mtimeMs - b.mtimeMs); // oldest first
        for (const item of fileStats) {
          if (currentTotal <= targetBudget * 0.7) break;
          const freed = await safeUnlink(item.path);
          stockVideosBytes += freed;
          currentTotal -= freed;
        }
      }
    } catch {}
  }

  // 2. Archival Historical Media Cache (data/media/archival-cache)
  const archivalDir = path.join(process.cwd(), 'data', 'media', 'archival-cache');
  if (fsSync.existsSync(archivalDir)) {
    try {
      const files = await fs.readdir(archivalDir).catch(() => []);
      const fileStats: { name: string; path: string; size: number; mtimeMs: number }[] = [];

      for (const f of files) {
        const fPath = path.join(archivalDir, f);
        const stat = await fs.stat(fPath).catch(() => null);
        if (stat) {
          if (stat.mtimeMs <= cutoffMs * 2) { // 48h for archival
            archivalCacheBytes += await safeUnlink(fPath);
          } else {
            fileStats.push({ name: f, path: fPath, size: stat.size, mtimeMs: stat.mtimeMs });
          }
        }
      }

      let currentTotal = fileStats.reduce((acc, f) => acc + f.size, 0);
      const targetBudget = maxArchivalMb * 1024 * 1024;
      if (currentTotal > targetBudget) {
        fileStats.sort((a, b) => a.mtimeMs - b.mtimeMs);
        for (const item of fileStats) {
          if (currentTotal <= targetBudget * 0.7) break;
          const freed = await safeUnlink(item.path);
          archivalCacheBytes += freed;
          currentTotal -= freed;
        }
      }
    } catch {}
  }

  // 3. Stock Images Cache (data/media/stock-cache) & Image Cache (data/media/imageCache)
  const imageCacheDirs = [
    path.join(process.cwd(), 'data', 'media', 'stock-cache'),
    path.join(process.cwd(), 'data', 'media', 'imageCache')
  ];
  for (const dir of imageCacheDirs) {
    if (!fsSync.existsSync(dir)) continue;
    try {
      const files = await fs.readdir(dir).catch(() => []);
      for (const f of files) {
        const fPath = path.join(dir, f);
        const stat = await fs.stat(fPath).catch(() => null);
        if (stat && stat.mtimeMs <= cutoffMs) {
          archivalCacheBytes += await safeUnlink(fPath);
        }
      }
    } catch {}
  }

  return { stockVideosBytes, archivalCacheBytes, details };
}

/**
 * Prunes browser screenshots and ephemeral Chromium profile caches.
 * Explicitly guards and preserves user logins, cookies, preferences, and storage_state.json.
 */
export async function pruneBrowserArtifacts(maxAgeHours = 6): Promise<{ bytesFreed: number; details: string[] }> {
  const cutoffMs = Date.now() - maxAgeHours * 60 * 60 * 1000;
  let bytesFreed = 0;
  const details: string[] = [];

  // 1. Browser Screenshots (data/media/browser_screenshots)
  const shotsDir = path.join(process.cwd(), 'data', 'media', 'browser_screenshots');
  if (fsSync.existsSync(shotsDir)) {
    try {
      const files = await fs.readdir(shotsDir).catch(() => []);
      for (const f of files) {
        if (f === 'latest_status.jpg') continue; // keep active status image for UI telemetry
        const fPath = path.join(shotsDir, f);
        const stat = await fs.stat(fPath).catch(() => null);
        if (stat && stat.mtimeMs <= cutoffMs) {
          bytesFreed += await safeUnlink(fPath);
        }
      }
    } catch {}
  }

  // 2. Ephemeral Chromium Cache Directories
  // ONLY safe, disposable disk caches are cleaned — NEVER cookies or storage state!
  const browserDir = path.join(process.cwd(), 'data', 'browser_profile');
  if (fsSync.existsSync(browserDir)) {
    const disposableCacheSubdirs = [
      path.join(browserDir, 'Default', 'Cache'),
      path.join(browserDir, 'Default', 'Code Cache'),
      path.join(browserDir, 'Default', 'DawnWebGPUCache'),
      path.join(browserDir, 'Default', 'DawnGraphiteCache'),
      path.join(browserDir, 'Default', 'GPUCache'),
      path.join(browserDir, 'GrShaderCache'),
      path.join(browserDir, 'ShaderCache'),
      path.join(browserDir, 'optimization_guide_model_store'),
      path.join(browserDir, 'Crashpad', 'reports'),
      path.join(browserDir, 'Crashpad', 'attachments')
    ];

    for (const cDir of disposableCacheSubdirs) {
      if (fsSync.existsSync(cDir)) {
        try {
          const freed = await safeRmDir(cDir);
          bytesFreed += freed;
        } catch {}
      }
    }
  }

  return { bytesFreed, details };
}

/**
 * Prunes stale OS temp files (/tmp or os.tmpdir()) created by ffmpeg, fonts, and hyperframes.
 */
export async function pruneSystemTemp(maxAgeHours = 4): Promise<{ bytesFreed: number }> {
  const cutoffMs = Date.now() - maxAgeHours * 60 * 60 * 1000;
  let bytesFreed = 0;
  const tmpDir = os.tmpdir();

  try {
    const files = await fs.readdir(tmpDir).catch(() => []);
    for (const f of files) {
      if (
        f.startsWith('texvic-') ||
        f.startsWith('hyperframes-') ||
        f.startsWith('ffmpeg-') ||
        f.startsWith('playwright-')
      ) {
        const fPath = path.join(tmpDir, f);
        const stat = await fs.stat(fPath).catch(() => null);
        if (stat && stat.mtimeMs <= cutoffMs) {
          if (stat.isDirectory()) {
            bytesFreed += await safeRmDir(fPath);
          } else {
            bytesFreed += await safeUnlink(fPath);
          }
        }
      }
    }
  } catch {}

  return { bytesFreed };
}

/**
 * Performs SQLite maintenance: WAL truncation and log aging.
 */
export function maintainDatabase(): void {
  try {
    // Checkpoint and truncate the WAL file to prevent sarlx_growth.db-wal from expanding
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');

    // Clean old autonomous activity logs older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`DELETE FROM autonomous_logs WHERE timestamp < ?`).run(thirtyDaysAgo);
    db.prepare(`DELETE FROM agent_activity_logs WHERE created_at < ?`).run(thirtyDaysAgo);
    db.prepare(`DELETE FROM background_jobs WHERE status IN ('completed', 'failed') AND (executed_at < ? OR (executed_at IS NULL AND created_at < ?))`).run(thirtyDaysAgo, thirtyDaysAgo);
  } catch (err: any) {
    console.warn('[Storage Retention] Database maintenance warning:', err?.message || err);
  }
}

/**
 * Comprehensive Storage Sweep (Automatic VPS Retention Engine):
 * 1. Purges 24h-old published reels' heavy MP4 files, covers, & master audios (preserving DB analytics)
 * 2. Purges orphaned and failed video files in data/media/reels/ older than 24h
 * 3. Purges 24h-old carousel slide images
 * 4. Cleans intermediate composed videos, scene fragments, temp renders, & subtitles older than 2h
 * 5. Cleans all temporary TTS audio files (*.mp3, *.wav, etc.) older than 2h
 * 6. Cleans downloaded stock video cache and Wikipedia archival image caches older than 24-48h or exceeding budget
 * 7. Safely purges ephemeral Chromium browser caches while preserving cookies and authentication
 * 8. Cleans stale system /tmp ffmpeg and hyperframes renders
 * 9. Checkpoints and truncates SQLite WAL to keep the database lean
 */
export async function runStorageSweep(): Promise<StoragePruneResult> {
  const reelsRes = await pruneExpiredPublishedReels(24);
  const orphanRes = await pruneOrphanedAndFailedReels(24);
  const postsRes = await pruneExpiredPublishedPosts(24);
  const intermediateRes = await pruneComposedAndIntermediateMedia(2);
  const ttsRes = await pruneTtsMedia(2);
  const stockArchivalRes = await pruneStockAndArchivalCaches(24, 300, 200, 150);
  const browserRes = await pruneBrowserArtifacts(6);
  const sysTmpRes = await pruneSystemTemp(4);

  maintainDatabase();

  const categories: StoragePruneCategories = {
    reelsBytes: reelsRes.bytesFreed + orphanRes.bytesFreed,
    postsBytes: postsRes.bytesFreed,
    ttsBytes: ttsRes.bytesFreed,
    stockVideosBytes: stockArchivalRes.stockVideosBytes,
    archivalCacheBytes: stockArchivalRes.archivalCacheBytes,
    browserCacheBytes: browserRes.bytesFreed,
    tempComposedBytes: intermediateRes.bytesFreed,
    coversBytes: 0,
    systemTempBytes: sysTmpRes.bytesFreed
  };

  const totalBytes =
    categories.reelsBytes +
    categories.postsBytes +
    categories.ttsBytes +
    categories.stockVideosBytes +
    categories.archivalCacheBytes +
    categories.browserCacheBytes +
    categories.tempComposedBytes +
    categories.systemTempBytes;

  if (totalBytes > 0) {
    const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
    console.log(`[Storage Retention] 🧹 Sweep complete: freed ${totalMb} MB total VPS disk storage across all engines.`);
  }

  const allDetails = [
    ...reelsRes.details,
    ...orphanRes.details,
    ...postsRes.details,
    ...intermediateRes.details
  ];

  return {
    reelsPruned: reelsRes.count + orphanRes.count,
    postsPruned: postsRes.count,
    bytesFreed: totalBytes,
    details: allDetails,
    categories
  };
}
