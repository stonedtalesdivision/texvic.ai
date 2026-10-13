import dotenv from 'dotenv';
dotenv.config();

import { db } from '../server/database.js';
import { decryptSecret } from '../server/tokenVault.js';

async function main() {
  const account = db.prepare('SELECT * FROM account_connections WHERE id = ?').get('instagram_primary') as any;
  if (!account) {
    console.log('No account_connections row found!');
    return;
  }
  console.log('Account Name:', account.account_name);
  console.log('Account ID:', account.account_id);
  console.log('Is Connected:', account.is_connected);

  const token = decryptSecret(account.access_token);
  console.log('Token exists:', Boolean(token), 'length:', token?.length);

  // Check what permissions the token has via Graph API
  const profileRes = await fetch(`https://graph.instagram.com/v26.0/${account.account_id}?fields=id,username,name,media_count,followers_count&access_token=${token}`);
  const profile = await profileRes.json();
  console.log('Profile Response:', profile);

  // Fetch media on this account
  const mediaRes = await fetch(`https://graph.instagram.com/v26.0/${account.account_id}/media?fields=id,caption,media_type,permalink,timestamp,comments_count,like_count&access_token=${token}`);
  const mediaData = await mediaRes.json();
  console.log('Media count:', mediaData?.data?.length || 0);
  console.log('Media items:', JSON.stringify(mediaData, null, 2));

  // Check /me/permissions
  const permsRes = await fetch(`https://graph.instagram.com/v26.0/me/permissions?access_token=${token}`);
  const perms = await permsRes.json();
  console.log('Permissions:', perms);
}

main().catch(console.error);
