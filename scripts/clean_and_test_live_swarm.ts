import dotenv from 'dotenv';
dotenv.config();

import { db } from '../server/database.js';
import { executeSwarmCycle, getActivityLogs } from '../server/agentSwarm.js';

async function main() {
  console.log('1. Cleaning up old broken placeholder logs from SQLite...');
  const del = db.prepare(`
    DELETE FROM agent_activity_logs 
    WHERE target_media_url LIKE '%C8qV7X%' 
       OR target_media_url LIKE '%C9aP3%' 
       OR target_media_url LIKE '%C7mZ8%' 
       OR target_media_url LIKE '%C6yN9%' 
       OR target_media_url LIKE '%C5tK2%' 
       OR target_media_url LIKE '%C4xR7%'
       OR payload_text LIKE '%Sentences:%'
       OR target_author = '@sarlx_ai'
  `).run();
  console.log(`Removed ${del.changes} legacy dummy / self-targeted logs.`);

  db.prepare(`
    UPDATE interaction_agents 
    SET role = 'Engagement & Discussion Booster',
        description = 'Sparks high-retention conversation questions and discussion hooks under reels to drive algorithmic reach, comment velocity, and reciprocal profile visits to @sarlx_ai.'
    WHERE id = 'agent_pulse'
  `).run();
  console.log('Updated agent_pulse role and description in database.');

  console.log('\n2. Executing a live swarm cycle with REAL Instagram Meta Graph API calls...');
  const cycle = await executeSwarmCycle();
  console.log(`Executed: ${cycle.executed} actions.`);

  console.log('\n3. Reviewing latest activity logs in database:');
  const logs = getActivityLogs(5);
  for (const log of logs) {
    console.log(`[${log.agentName} - ${log.actionType}]`);
    console.log(`- Target URL: ${log.targetMediaUrl}`);
    console.log(`- Status: ${log.status} (Live Published: ${log.details?.livePublished})`);
    console.log(`- Instagram Comment ID: ${log.details?.instagramCommentId || 'N/A'}`);
    console.log(`- Payload: ${log.payloadText}`);
    console.log(`- Manager Sign-off: ${log.managerNotes}`);
    console.log('');
  }
}

main().catch(console.error);
