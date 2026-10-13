import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from './database.js';

export type AssetType = 'video' | 'image' | 'audio';
export interface MediaAsset {
  id: string;
  type: AssetType;
  filename: string;
  file_path: string;
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
  if (row.file_path && !fsSync.existsSync(row.file_path)) {
    // Disk file was removed, auto-prune
    try {
      db.prepare('DELETE FROM asset_usage WHERE asset_id = ?').run(id);
      db.prepare('DELETE FROM media_assets WHERE id = ?').run(id);
    } catch {}
    return null;
  }
  return normalizeAsset(row);
}

export async function deleteAsset(id: string): Promise<boolean> {
  const row = db.prepare('SELECT * FROM media_assets WHERE id = ?').get(id) as any;
  if (!row) return false;
  if (row.file_path && fsSync.existsSync(row.file_path)) {
    try {
      await fs.unlink(row.file_path);
    } catch (e) {
      console.warn(`[AssetLibrary] Could not remove file ${row.file_path}:`, e);
    }
  }
  db.prepare('DELETE FROM asset_usage WHERE asset_id = ?').run(id);
  db.prepare('DELETE FROM media_assets WHERE id = ?').run(id);
  return true;
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

  // Auto-prune ghost assets if file was deleted from disk in Windows Explorer
  const validAssets: MediaAsset[] = [];
  const pruneIds: string[] = [];

  for (const row of rows) {
    if (row.file_path && !fsSync.existsSync(row.file_path)) {
      pruneIds.push(row.id);
    } else {
      validAssets.push(normalizeAsset(row));
    }
  }

  if (pruneIds.length > 0) {
    try {
      const placeholders = pruneIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM asset_usage WHERE asset_id IN (${placeholders})`).run(...pruneIds);
      db.prepare(`DELETE FROM media_assets WHERE id IN (${placeholders})`).run(...pruneIds);
      console.log(`[AssetLibrary] Auto-pruned ${pruneIds.length} orphaned asset record(s) whose files were deleted from disk.`);
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

function normalizeAsset(row: any): MediaAsset {
  return {
    ...row,
    tags: JSON.parse(row.tags_json || '[]'),
    metadata: JSON.parse(row.metadata_json || '{}'),
  };
}

export { ASSET_DIR };
