import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { db } from './database.js';

export interface StoragePruneResult {
  reelsPruned: number;
  postsPruned: number;
  bytesFreed: number;
  details: string[];
}

/**
 * Automatically purges published reels older than 24 hours (1 day).
 * Deletes the physical MP4 video file from VPS storage, clears scratch TTS audio,
 * and removes the database record so cloud VPS storage never fills up.
 */
export async function pruneExpiredPublishedReels(maxAgeHours = 24): Promise<{ count: number; bytesFreed: number; details: string[] }> {
  const cutoffMs = Date.now() - maxAgeHours * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  // Find all reels with status = 'published' published or updated before cutoff
  const expiredReels = db.prepare(`
    SELECT id, title, video_url, publish_timestamp, updated_at 
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
        if (fsSync.existsSync(filePath)) {
          const stat = await fs.stat(filePath).catch(() => null);
          if (stat) reelBytes += stat.size;
          await fs.unlink(filePath).catch(() => {});
        }
      }

      // 2. Delete concatenated master TTS audio if present
      const ttsMaster = path.join(process.cwd(), 'data', 'media', 'tts', `master-${reel.id}.mp3`);
      if (fsSync.existsSync(ttsMaster)) {
        const stat = await fs.stat(ttsMaster).catch(() => null);
        if (stat) reelBytes += stat.size;
        await fs.unlink(ttsMaster).catch(() => {});
      }

      // 3. Delete any intermediate composer fragments in data/composer/
      const composerDir = path.join(process.cwd(), 'data', 'composer');
      if (fsSync.existsSync(composerDir)) {
        const composerFiles = await fs.readdir(composerDir).catch(() => []);
        for (const file of composerFiles) {
          if (file.includes(reel.id)) {
            const cPath = path.join(composerDir, file);
            const stat = await fs.stat(cPath).catch(() => null);
            if (stat) reelBytes += stat.size;
            await fs.unlink(cPath).catch(() => {});
          }
        }
      }

      // 4. Delete database records
      db.prepare('DELETE FROM reels WHERE id = ?').run(reel.id);
      db.prepare(`
        DELETE FROM background_jobs 
        WHERE json_extract(payload_json, '$.reelId') = ?
      `).run(reel.id);

      bytesFreed += reelBytes;
      count++;
      const mb = (reelBytes / (1024 * 1024)).toFixed(1);
      details.push(`Pruned published reel "${reel.title}" (${reel.id}) — freed ${mb} MB`);
      console.log(`[Storage Retention] 🗑️ Pruned 24h-old published reel "${reel.title}" (${reel.id}) — freed ${mb} MB`);
    } catch (err: any) {
      console.warn(`[Storage Retention] Failed to prune reel ${reel.id}:`, err?.message || err);
    }
  }

  return { count, bytesFreed, details };
}

/**
 * Automatically purges published carousel post slides older than 24 hours (1 day).
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
          if (fsSync.existsSync(filePath)) {
            const stat = await fs.stat(filePath).catch(() => null);
            if (stat) postBytes += stat.size;
            await fs.unlink(filePath).catch(() => {});
          }
        }
      }

      db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
      bytesFreed += postBytes;
      count++;
      const mb = (postBytes / (1024 * 1024)).toFixed(1);
      details.push(`Pruned published carousel "${post.title}" (${post.id}) — freed ${mb} MB`);
      console.log(`[Storage Retention] 🗑️ Pruned 24h-old published post "${post.title}" (${post.id}) — freed ${mb} MB`);
    } catch (err: any) {
      console.warn(`[Storage Retention] Failed to prune post ${post.id}:`, err?.message || err);
    }
  }

  return { count, bytesFreed, details };
}

/**
 * Comprehensive storage sweep:
 * 1. Purges published reels older than 24 hours
 * 2. Purges published carousel posts older than 24 hours
 * 3. Cleans orphaned temp files in data/composer and data/media/tts older than 6 hours
 */
export async function runStorageSweep(): Promise<StoragePruneResult> {
  const reelsRes = await pruneExpiredPublishedReels(24);
  const postsRes = await pruneExpiredPublishedPosts(24);

  // Clean stale temp audio/composer files older than 6 hours
  let orphanBytes = 0;
  const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;

  const tempDirs = [
    path.join(process.cwd(), 'data', 'composer'),
    path.join(process.cwd(), 'data', 'media', 'tts')
  ];

  for (const dir of tempDirs) {
    try {
      if (fsSync.existsSync(dir)) {
        const files = await fs.readdir(dir);
        for (const f of files) {
          if (f.startsWith('tts-text-') || f.startsWith('concat-') || f.startsWith('padded-') || f.endsWith('.wav')) {
            const fPath = path.join(dir, f);
            const stat = await fs.stat(fPath).catch(() => null);
            if (stat && stat.mtimeMs < sixHoursAgo) {
              orphanBytes += stat.size;
              await fs.unlink(fPath).catch(() => {});
            }
          }
        }
      }
    } catch {}
  }

  const totalBytes = reelsRes.bytesFreed + postsRes.bytesFreed + orphanBytes;
  if (totalBytes > 0) {
    const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
    console.log(`[Storage Retention] Sweep complete: freed ${totalMb} MB total VPS disk storage.`);
  }

  return {
    reelsPruned: reelsRes.count,
    postsPruned: postsRes.count,
    bytesFreed: totalBytes,
    details: [...reelsRes.details, ...postsRes.details]
  };
}
