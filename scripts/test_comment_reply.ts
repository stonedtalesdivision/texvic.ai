import dotenv from 'dotenv';
dotenv.config();

import { db } from '../server/database.js';
import { decryptSecret } from '../server/tokenVault.js';

async function main() {
  const account = db.prepare('SELECT * FROM account_connections WHERE id = ?').get('instagram_primary') as any;
  const token = decryptSecret(account.access_token);

  // Let's test if we can fetch any public media by shortcode or ID
  // e.g., reel shortcode 'C8qV7X0sL9A' or another real media id
  // In Instagram Graph API: GET /v26.0/{media-id}
  console.log('--- Testing Graph API capabilities on media & comments ---');

  // Let's test fetching comments on our own media where we just commented
  const ownMediaComments = await fetch(`https://graph.instagram.com/v26.0/18022131059712156/comments?fields=id,text,timestamp,username&access_token=${token}`);
  const ownData = await ownMediaComments.json();
  console.log('Our live reel comments:', JSON.stringify(ownData, null, 2));

  // Let's test replying to that comment!
  const commentId = '18179494576439599';
  const replyRes = await fetch(`https://graph.instagram.com/v26.0/${commentId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      message: 'Self-tuning weights reduce inference latency by up to 40% across distributed edge workers.',
      access_token: token
    }).toString()
  });
  const replyData = await replyRes.json();
  console.log('Reply to comment result:', replyData);
}

main().catch(console.error);
