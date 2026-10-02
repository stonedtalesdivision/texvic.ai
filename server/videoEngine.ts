import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from './database.js';

export type VideoJobStatus =
  | 'QUEUED'
  | 'GENERATING'
  | 'DOWNLOADING'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED';

export interface VideoJob {
  id: string;
  reel_id: string;
  provider: string;
  status: VideoJobStatus;
  prompt: string;
  source_url: string | null;
  output_url: string | null;
  output_path: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

const MEDIA_DIR = path.join(process.cwd(), 'data', 'media', 'reels');

function mediaSigningKey(): string {
  const key = process.env.MEDIA_SIGNING_KEY || '';
  if (key.length < 32) throw new Error('MEDIA_SIGNING_KEY must be configured with at least 32 characters.');
  return key;
}

export function createMediaSignature(filename: string): string {
  return crypto.createHmac('sha256', mediaSigningKey()).update(filename).digest('hex');
}

export function verifyMediaSignature(filename: string, signature: string): boolean {
  if (!signature || signature.length !== 64) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(createMediaSignature(filename)), Buffer.from(signature));
  } catch {
    return false;
  }
}

function now() {
  return new Date().toISOString();
}

function workerToken() {
  const token = process.env.VIDEO_WORKER_TOKEN || '';
  if (token.length < 32) {
    throw new Error('VIDEO_WORKER_TOKEN must be configured with at least 32 characters.');
  }
  return token;
}

export function verifyVideoWorkerToken(value: string | undefined): boolean {
  if (!value) return false;
  const expected = process.env.VIDEO_WORKER_TOKEN || '';
  if (expected.length < 32 || value.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

export function createVideoJob(input: {
  reelId: string;
  prompt: string;
  provider?: string;
}): VideoJob {
  const id = `video-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const timestamp = now();

  db.prepare(`
    INSERT INTO video_jobs (
      id, reel_id, provider, status, prompt, source_url, output_url, output_path, error, created_at, updated_at
    ) VALUES (?, ?, ?, 'QUEUED', ?, null, null, null, null, ?, ?)
  `).run(
    id,
    input.reelId,
    input.provider || process.env.VIDEO_PROVIDER || 'ltx23-hf',
    input.prompt,
    timestamp,
    timestamp
  );

  return getVideoJob(id)!;
}

export function getVideoJob(id: string): VideoJob | null {
  return (db.prepare('SELECT * FROM video_jobs WHERE id = ?').get(id) as VideoJob | undefined) || null;
}

export function listVideoJobs(limit = 20): VideoJob[] {
  return db.prepare('SELECT * FROM video_jobs ORDER BY created_at DESC LIMIT ?').all(limit) as unknown as VideoJob[];
}

export function claimNextVideoJob(): VideoJob | null {
  const job = db.prepare(`
    SELECT * FROM video_jobs
    WHERE status = 'QUEUED'
    ORDER BY created_at ASC
    LIMIT 1
  `).get() as VideoJob | undefined;

  if (!job) return null;

  const timestamp = now();
  const result = db.prepare(`
    UPDATE video_jobs
    SET status = 'GENERATING', updated_at = ?
    WHERE id = ? AND status = 'QUEUED'
  `).run(timestamp, job.id);

  return result.changes ? getVideoJob(job.id) : null;
}

export function updateVideoJob(
  id: string,
  update: Partial<Pick<VideoJob, 'status' | 'source_url' | 'output_url' | 'output_path' | 'error'>>
): VideoJob | null {
  const current = getVideoJob(id);
  if (!current) return null;

  const next = {
    status: update.status ?? current.status,
    source_url: update.source_url ?? current.source_url,
    output_url: update.output_url ?? current.output_url,
    output_path: update.output_path ?? current.output_path,
    error: update.error ?? current.error,
  };

  db.prepare(`
    UPDATE video_jobs
    SET status = ?, source_url = ?, output_url = ?, output_path = ?, error = ?, updated_at = ?
    WHERE id = ?
  `).run(next.status, next.source_url, next.output_url, next.output_path, next.error, now(), id);

  return getVideoJob(id);
}

export async function saveVideoOutput(id: string, body: Buffer, extension = 'mp4'): Promise<VideoJob | null> {
  const job = getVideoJob(id);
  if (!job) return null;
  if (body.length < 1024) throw new Error('Video output is empty or too small.');

  await fs.mkdir(MEDIA_DIR, { recursive: true });
  const safeExtension = extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'mp4';
  const filename = `${job.reel_id}-${id}.${safeExtension}`;
  const outputPath = path.join(MEDIA_DIR, filename);
  await fs.writeFile(outputPath, body);

  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  if (!appUrl) throw new Error('APP_URL is required for video output URLs.');

  return updateVideoJob(id, {
    status: 'READY',
    output_path: outputPath,
    output_url: `${appUrl}/media/reels/${encodeURIComponent(filename)}?token=${createMediaSignature(filename)}`,
    error: null,
  });
}

export function getVideoWorkerContract() {
  return {
    provider: process.env.VIDEO_PROVIDER || 'ltx23-hf',
    workerProtocol: 'texvic-video-worker-v1',
    output: {
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      width: 1080,
      height: 1920,
      fps: 30,
      aspectRatio: '9:16',
    },
    workerTokenConfigured: (() => {
      try { workerToken(); return true; } catch { return false; }
    })(),
  };
}
