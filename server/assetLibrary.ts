import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { db } from './database.js';

const execFileAsync = promisify(execFile);

export type AssetType = 'video' | 'image' | 'audio';

export interface MediaAsset {
  id: string;
  type: AssetType;
  filename: string;
  file_path: string;
  url: string;
  previewUrl: string;
  sizeBytes: number;
  category: string;
  tags: string[];
  duration: number | null;
  width: number | null;
  height: number | null;
  source: string;
  prompt: string | null;
  mood: string | null;
  camera: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  last_used_at: string | null;
  usage_count: number;
}

const ASSET_DIR = path.join(process.cwd(), 'data', 'media', 'assets');

function now() { return new Date().toISOString(); }

export async function ensureAssetDirectories() {
  await fs.mkdir(path.join(ASSET_DIR, 'video'), { recursive: true });
  await fs.mkdir(path.join(ASSET_DIR, 'image'), { recursive: true });
  await fs.mkdir(path.join(ASSET_DIR, 'audio'), { recursive: true });
}

/**
 * Probes video and audio dimensions and duration using ffprobe
 */
export async function probeMediaMetadata(filePath: string, type: AssetType): Promise<{
  duration: number | null;
  width: number | null;
  height: number | null;
}> {
  try {
    if (type === 'video') {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,duration',
        '-show_entries', 'format=duration',
        '-of', 'json',
        filePath
      ]);
      const data = JSON.parse(stdout);
      const stream = data.streams?.[0] || {};
      const duration = parseFloat(stream.duration || data.format?.duration || '0') || null;
      const width = parseInt(stream.width, 10) || null;
      const height = parseInt(stream.height, 10) || null;
      return { duration, width, height };
    } else if (type === 'audio') {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ]);
      const duration = parseFloat(stdout.trim()) || null;
      return { duration, width: null, height: null };
    }
  } catch (err) {
    console.warn(`[AssetLibrary] ffprobe could not probe ${filePath}:`, err);
  }
  return { duration: null, width: type === 'video' ? 1080 : null, height: type === 'video' ? 1920 : null };
}

/**
 * Processes an uploaded file from laptop/browser, moves to VPS storage, and registers in SQLite
 */
export async function saveUploadedAsset(file: {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}, options: {
  category?: string;
  tags?: string[];
  mood?: string;
}): Promise<MediaAsset> {
  await ensureAssetDirectories();

  const ext = path.extname(file.originalname).toLowerCase();
  let type: AssetType = 'image';
  if (/video|mp4|mov|webm|mkv|avi|m4v/i.test(file.mimetype) || /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(ext)) {
    type = 'video';
  } else if (/audio|mp3|wav|m4a|aac|ogg|flac/i.test(file.mimetype) || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(ext)) {
    type = 'audio';
  } else if (/image|jpeg|jpg|png|webp|gif/i.test(file.mimetype) || /\.(jpg|jpeg|png|webp|gif)$/i.test(ext)) {
    type = 'image';
  }

  const id = `asset-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const cleanOriginalName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const filename = `${id}-${cleanOriginalName}`;
  const targetPath = path.join(ASSET_DIR, type, filename);

  await fs.copyFile(file.path, targetPath);
  await fs.unlink(file.path).catch(() => {});

  const probed = await probeMediaMetadata(targetPath, type);

  const createdAt = now();
  const category = options.category || 'custom-background';
  const userTags = Array.isArray(options.tags) ? options.tags : [];
  const tags = [...new Set(['user-upload', type, category, ...userTags])];

  db.prepare(`
    INSERT INTO media_assets
      (id,type,filename,file_path,category,tags_json,duration,width,height,source,prompt,mood,camera,metadata_json,created_at,last_used_at,usage_count)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,0)
  `).run(
    id, type, filename, targetPath, category, JSON.stringify(tags),
    probed.duration, probed.width, probed.height, 'user-upload',
    options.category || 'Uploaded Background Asset', options.mood || null, null,
    JSON.stringify({
      sizeBytes: file.size,
      originalFilename: file.originalname,
      uploadedAt: createdAt,
      mimeType: file.mimetype
    }),
    createdAt
  );

  console.log(`[AssetLibrary] ✅ Saved uploaded ${type} asset to VPS: "${filename}" (${file.size} bytes).`);
  return getAsset(id)!;
}

/**
 * Robust cross-platform path resolver for media assets.
 * Handles migration between Windows host and Linux VPS/Docker containers.
 */
export function resolveAssetDiskPath(row: { type: string; filename: string; file_path?: string }): string | null {
  // 1. Direct path check
  if (row.file_path && fsSync.existsSync(row.file_path)) {
    return row.file_path;
  }
  // 2. Relative to current process working directory (standard in Docker/VPS: /app/data/media/assets/...)
  const relativeTarget = path.join(process.cwd(), 'data', 'media', 'assets', row.type, row.filename);
  if (fsSync.existsSync(relativeTarget)) {
    return relativeTarget;
  }
  // 3. Basename in ASSET_DIR
  const assetDirTarget = path.join(ASSET_DIR, row.type, row.filename);
  if (fsSync.existsSync(assetDirTarget)) {
    return assetDirTarget;
  }
  return null;
}

export async function registerAsset(input: {
  type: AssetType;
  sourcePath: string;
  category: string;
  tags?: string[];
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  source?: string;
  prompt?: string | null;
  mood?: string | null;
  camera?: string | null;
  metadata?: Record<string, unknown>;
  id?: string;
}): Promise<MediaAsset> {
  await ensureAssetDirectories();
  const id = input.id || `asset-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const ext = path.extname(input.sourcePath) || (input.type === 'audio' ? '.mp3' : input.type === 'image' ? '.jpg' : '.mp4');
  const filename = `${id}${ext.toLowerCase()}`;
  const target = path.join(ASSET_DIR, input.type, filename);
  await fs.copyFile(input.sourcePath, target);
  const createdAt = now();
  db.prepare(`
    INSERT INTO media_assets
      (id,type,filename,file_path,category,tags_json,duration,width,height,source,prompt,mood,camera,metadata_json,created_at,last_used_at,usage_count)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,0)
  `).run(
    id, input.type, filename, target, input.category, JSON.stringify(input.tags || []),
    input.duration ?? null, input.width ?? null, input.height ?? null, input.source || 'manual',
    input.prompt ?? null, input.mood ?? null, input.camera ?? null, JSON.stringify(input.metadata || {}), createdAt
  );
  return getAsset(id)!;
}

export function getAsset(id: string): MediaAsset | null {
  const row = db.prepare('SELECT * FROM media_assets WHERE id = ?').get(id) as any;
  if (!row) return null;

  const validPath = resolveAssetDiskPath(row);
  if (!validPath) {
    // Disk file was genuinely removed
    try {
      db.prepare('DELETE FROM asset_usage WHERE asset_id = ?').run(id);
      db.prepare('DELETE FROM media_assets WHERE id = ?').run(id);
    } catch {}
    return null;
  }

  if (row.file_path !== validPath) {
    try {
      db.prepare('UPDATE media_assets SET file_path = ? WHERE id = ?').run(validPath, id);
      row.file_path = validPath;
    } catch {}
  }

  return normalizeAsset(row);
}

export async function deleteAsset(id: string): Promise<boolean> {
  const row = db.prepare('SELECT * FROM media_assets WHERE id = ?').get(id) as any;
  if (!row) return false;

  const validPath = resolveAssetDiskPath(row);
  if (validPath && fsSync.existsSync(validPath)) {
    try {
      await fs.unlink(validPath);
      console.log(`[AssetLibrary] 🗑️ Deleted asset file from VPS storage: ${validPath}`);
    } catch (e) {
      console.warn(`[AssetLibrary] Could not remove file ${validPath}:`, e);
    }
  }

  db.prepare('DELETE FROM asset_usage WHERE asset_id = ?').run(id);
  db.prepare('DELETE FROM media_assets WHERE id = ?').run(id);
  return true;
}

/**
 * Scans VPS disk storage directories and synchronizes any discovered media assets into SQLite
 */
export async function syncAssetsFromDisk(): Promise<{ synced: number; pruned: number }> {
  await ensureAssetDirectories();
  const types: AssetType[] = ['video', 'image', 'audio'];
  let synced = 0;

  for (const type of types) {
    const dir = path.join(ASSET_DIR, type);
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (file.startsWith('.')) continue;
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath).catch(() => null);
        if (!stat || !stat.isFile()) continue;

        const existing = db.prepare('SELECT id FROM media_assets WHERE filename = ?').get(file) as any;
        if (!existing) {
          const id = file.replace(/\.[^/.]+$/, '');
          const createdAt = stat.birthtime ? stat.birthtime.toISOString() : now();
          const ext = path.extname(file).toLowerCase();
          const isPortrait = ext === '.mp4';
          
          db.prepare(`
            INSERT INTO media_assets
              (id,type,filename,file_path,category,tags_json,duration,width,height,source,prompt,mood,camera,metadata_json,created_at,last_used_at,usage_count)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,0)
          `).run(
            id, type, file, filePath, 'autonomous-engine',
            JSON.stringify([type, 'autonomous-visual', 'reusable']),
            type === 'video' ? 8.0 : null,
            isPortrait ? 1080 : null,
            isPortrait ? 1920 : null,
            'autonomous-asset-generator',
            null, null, null,
            JSON.stringify({ sizeBytes: stat.size, originalFilename: file }),
            createdAt
          );
          synced++;
        }
      }
    } catch (err) {
      console.warn(`[AssetLibrary] Sync disk scan failed for ${type}:`, err);
    }
  }

  return { synced, pruned: 0 };
}

export function listAssets(options: {
  type?: AssetType;
  category?: string;
  tags?: string[];
  limit?: number;
} = {}): MediaAsset[] {
  const limit = Math.min(Math.max(options.limit || 50, 1), 500);
  const clauses: string[] = [];
  const args: any[] = [];
  if (options.type) { clauses.push('type = ?'); args.push(options.type); }
  if (options.category) { clauses.push('category = ?'); args.push(options.category); }
  const sql = `SELECT * FROM media_assets ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ?`;
  args.push(limit);
  const rows = db.prepare(sql).all(...args) as any[];

  const validAssets: MediaAsset[] = [];
  const pruneIds: string[] = [];

  for (const row of rows) {
    const validPath = resolveAssetDiskPath(row);
    if (!validPath) {
      pruneIds.push(row.id);
    } else {
      if (row.file_path !== validPath) {
        try {
          db.prepare('UPDATE media_assets SET file_path = ? WHERE id = ?').run(validPath, row.id);
          row.file_path = validPath;
        } catch {}
      }
      validAssets.push(normalizeAsset(row));
    }
  }

  if (pruneIds.length > 0) {
    try {
      const placeholders = pruneIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM asset_usage WHERE asset_id IN (${placeholders})`).run(...pruneIds);
      db.prepare(`DELETE FROM media_assets WHERE id IN (${placeholders})`).run(...pruneIds);
      console.log(`[AssetLibrary] Auto-pruned ${pruneIds.length} missing asset record(s) from DB.`);
    } catch (e) {
      console.warn('[AssetLibrary] Failed to prune missing assets from DB:', e);
    }
  }

  return validAssets.filter(asset =>
    !options.tags?.length || options.tags.every(tag => asset.tags.includes(tag))
  );
}

export function selectAssets(input: {
  type?: AssetType;
  category?: string;
  tags?: string[];
  limit?: number;
  excludeIds?: string[];
  avoidRecentlyUsedDays?: number;
} = {}): MediaAsset[] {
  const limit = Math.min(Math.max(input.limit || 10, 1), 100);
  const candidates = listAssets({ type: input.type || 'video', category: input.category, tags: input.tags });
  const excluded = new Set(input.excludeIds || []);
  const cutoff = input.avoidRecentlyUsedDays ? Date.now() - input.avoidRecentlyUsedDays * 86400000 : 0;
  return candidates
    .filter(asset => !excluded.has(asset.id))
    .filter(asset => !cutoff || !asset.last_used_at || Date.parse(asset.last_used_at) < cutoff)
    .sort((a, b) => a.usage_count - b.usage_count || Date.parse(a.last_used_at || '1970-01-01') - Date.parse(b.last_used_at || '1970-01-01'))
    .slice(0, limit);
}

export function markAssetUsed(assetId: string, reelId: string, sceneNumber: number, transform: Record<string, unknown> = {}) {
  const timestamp = now();
  db.prepare('UPDATE media_assets SET last_used_at = ?, usage_count = usage_count + 1 WHERE id = ?').run(timestamp, assetId);
  db.prepare(`
    INSERT INTO asset_usage (id, asset_id, reel_id, scene_number, transform_json, used_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(`usage-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, assetId, reelId, sceneNumber, JSON.stringify(transform), timestamp);
}

export async function getStorageStats() {
  const assets = listAssets({ limit: 500 });
  let totalAssetBytes = 0;
  let videoBytes = 0;
  let imageBytes = 0;
  let audioBytes = 0;

  for (const asset of assets) {
    totalAssetBytes += asset.sizeBytes;
    if (asset.type === 'video') videoBytes += asset.sizeBytes;
    else if (asset.type === 'image') imageBytes += asset.sizeBytes;
    else if (asset.type === 'audio') audioBytes += asset.sizeBytes;
  }

  // Calculate reel storage
  const reelsDir = path.join(process.cwd(), 'data', 'media', 'reels');
  let totalReelsBytes = 0;
  let reelsFileCount = 0;
  try {
    if (fsSync.existsSync(reelsDir)) {
      const files = await fs.readdir(reelsDir);
      for (const f of files) {
        const stat = await fs.stat(path.join(reelsDir, f)).catch(() => null);
        if (stat) {
          totalReelsBytes += stat.size;
          reelsFileCount++;
        }
      }
    }
  } catch {}

  const publishedRow = db.prepare("SELECT count(*) as c FROM reels WHERE status = 'published'").get() as any;
  const publishedReelsCount = publishedRow?.c || 0;

  return {
    totalAssetCount: assets.length,
    totalAssetBytes,
    videoBytes,
    imageBytes,
    audioBytes,
    totalReelsBytes,
    reelsFileCount,
    publishedReelsCount,
    totalStorageBytes: totalAssetBytes + totalReelsBytes
  };
}

function normalizeAsset(row: any): MediaAsset {
  const url = `/media/assets/${row.type}/${row.filename}`;
  let sizeBytes = 0;
  
  if (row.file_path && fsSync.existsSync(row.file_path)) {
    try {
      sizeBytes = fsSync.statSync(row.file_path).size;
    } catch {}
  }

  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(row.metadata_json || '{}');
  } catch {}

  if (!sizeBytes && typeof metadata.sizeBytes === 'number') {
    sizeBytes = metadata.sizeBytes;
  }

  return {
    ...row,
    url,
    previewUrl: url,
    sizeBytes,
    tags: JSON.parse(row.tags_json || '[]'),
    metadata,
  };
}

export { ASSET_DIR };
