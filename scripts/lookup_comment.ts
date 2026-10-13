import dotenv from 'dotenv';
dotenv.config();

import { db } from '../server/database.js';
import { decryptSecret } from '../server/tokenVault.js';

async function main() {
  const account = db.prepare('SELECT * FROM account_connections WHERE id = ?').get('instagram_primary') as any;
  const token = decryptSecret(account.access_token);

  const commentRes = await fetch(`https://graph.instagram.com/v26.0/18179494576439599?fields=id,text,timestamp,from&access_token=${token}`);
  const commentData = await commentRes.json();
  console.log('Direct Comment with from:', JSON.stringify(commentData, null, 2));

  // Check the reply: 18091629263479357
  const replyRes = await fetch(`https://graph.instagram.com/v26.0/18091629263479357?fields=id,text,timestamp,from&access_token=${token}`);
  const replyData = await replyRes.json();
  console.log('Direct Reply with from:', JSON.stringify(replyData, null, 2));
}

main().catch(console.error);
