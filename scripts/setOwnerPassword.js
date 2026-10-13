import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

async function resolvePassword() {
  if (process.env.NEW_PASSWORD) {
    return process.env.NEW_PASSWORD.trim();
  }
  if (process.argv[2]) {
    console.warn("⚠️  Warning: Passing passwords as command-line arguments can expose them in process tables (e.g. ps/Process Explorer).");
    console.warn("    Preferred alternative: NEW_PASSWORD=\"yourpassword\" node scripts/setOwnerPassword.js\n");
    return process.argv[2].trim();
  }
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise((resolve) => {
      rl.question('Enter new owner password: ', (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    });
  }
  console.error("Usage: NEW_PASSWORD=\"...\" node scripts/setOwnerPassword.js OR node scripts/setOwnerPassword.js");
  process.exit(1);
}

async function main() {
  const password = await resolvePassword();
  if (!password) {
    console.error("Error: Password cannot be empty.");
    process.exit(1);
  }

  const N = 16384;
  const r = 8;
  const p = 1;
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32, { N, r, p });
  const encoded = `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${hash.toString('hex')}`;

  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.error(".env file not found.");
    process.exit(1);
  }

  let content = fs.readFileSync(envPath, 'utf8');
  if (content.includes('TEXVIC_OWNER_PASSWORD_HASH=')) {
    content = content.replace(/TEXVIC_OWNER_PASSWORD_HASH=.*/, `TEXVIC_OWNER_PASSWORD_HASH="${encoded}"`);
  } else {
    content += `\nTEXVIC_OWNER_PASSWORD_HASH="${encoded}"\n`;
  }

  fs.writeFileSync(envPath, content, 'utf8');
  console.log(`✅ Successfully updated TEXVIC_OWNER_PASSWORD_HASH in .env! Password is now set.`);
}

main().catch((err) => {
  console.error("Error setting owner password:", err);
  process.exit(1);
});
