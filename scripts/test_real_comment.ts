import dotenv from 'dotenv';
dotenv.config();

import { db } from '../server/database.js';
import { decryptSecret } from '../server/tokenVault.js';
import { postCommentToMedia } from '../server/metaGraphApi.js';

async function main() {
  const account = db.prepare('SELECT * FROM account_connections WHERE id = ?').get('instagram_primary') as any;
  const token = decryptSecret(account.access_token);

  // Test 1: Post a real comment on one of our real reels: 18022131059712156 (permalink: https://www.instagram.com/reel/DeLxA9QCtKo/)
  const mediaId = '18022131059712156';
  console.log('Testing postCommentToMedia on mediaId:', mediaId);
  const commentRes = await postCommentToMedia(mediaId, 'Automated weight adaptation and continuous RL is transforming AI inference architectures in 2026.', token);
  console.log('Comment Result:', commentRes);

  // Test 2: Can we like via Graph API?
  // Let's test POST /{media-id}/likes
  const likeRes = await fetch(`https://graph.instagram.com/v26.0/${mediaId}/likes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: token }).toString()
  });
  const likeData = await likeRes.json();
  console.log('Like Result:', likeData);
}

main().catch(console.error);
