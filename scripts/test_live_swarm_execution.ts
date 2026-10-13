import dotenv from 'dotenv';
dotenv.config();

import { db } from '../server/database.js';
import { decryptSecret } from '../server/tokenVault.js';
import { postCommentToMedia } from '../server/metaGraphApi.js';

async function main() {
  const account = db.prepare('SELECT * FROM account_connections WHERE id = ?').get('instagram_primary') as any;
  const token = decryptSecret(account.access_token);

  const mediaRes = await fetch(`https://graph.instagram.com/v26.0/${account.account_id}/media?fields=id,caption,media_type,permalink,timestamp,comments_count,like_count&access_token=${token}`);
  const mediaData = await mediaRes.json();
  console.log(`Fetched ${mediaData?.data?.length || 0} live reels from @sarlx_ai`);

  if (mediaData?.data?.length > 0) {
    const firstReel = mediaData.data[0];
    console.log(`Testing comment on first reel: ${firstReel.permalink} (ID: ${firstReel.id})`);
    const commentRes = await postCommentToMedia(firstReel.id, 'Self-improving neural weights and live checkpoint streaming tested via SARLX Swarm Engine.', token);
    console.log('Publish result:', commentRes);
  }
}

main().catch(console.error);
