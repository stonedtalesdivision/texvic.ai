import dotenv from 'dotenv';
dotenv.config();

import { db } from '../server/database.js';
import { decryptSecret } from '../server/tokenVault.js';

async function main() {
  const account = db.prepare('SELECT * FROM account_connections WHERE id = ?').get('instagram_primary') as any;
  const token = decryptSecret(account.access_token);

  console.log('Testing Meta Graph API capabilities for third-party media and hashtag search:');

  // 1. Can we search hashtags?
  // GET /v26.0/ig_hashtag_search?user_id={user-id}&q={hashtag-name}
  const hashRes = await fetch(`https://graph.instagram.com/v26.0/ig_hashtag_search?user_id=${account.account_id}&q=coding&access_token=${token}`);
  const hashData = await hashRes.json();
  console.log('Hashtag search result:', hashData);

  // 2. Can we discover media via hashtag or mention?
  // Let's check /v26.0/me/tags or /v26.0/{user_id}/tags
  const tagsRes = await fetch(`https://graph.instagram.com/v26.0/${account.account_id}/tags?access_token=${token}`);
  const tagsData = await tagsRes.json();
  console.log('User tags result:', tagsData);

  // 3. Can we fetch media from any other Instagram ID?
  const otherRes = await fetch(`https://graph.instagram.com/v26.0/17841400000000000?fields=id,caption&access_token=${token}`);
  const otherData = await otherRes.json();
  console.log('Other media test:', otherData);
}

main().catch(console.error);
