import fs from 'fs';

const envLocal = fs.readFileSync('.env.local', 'utf-8');
const lines = envLocal.split('\n');
let url = '';
let token = '';

for (const line of lines) {
  if (line.startsWith('UPSTASH_REDIS_REST_URL=')) {
    url = line.replace('UPSTASH_REDIS_REST_URL=', '').trim().replace(/^["']|["']$/g, '');
  }
  if (line.startsWith('UPSTASH_REDIS_REST_TOKEN=')) {
    token = line.replace('UPSTASH_REDIS_REST_TOKEN=', '').trim().replace(/^["']|["']$/g, '');
  }
}

async function check() {
  const res = await fetch(`${url}/keys/*`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  console.log('Upstash Redis keys in DB:', data.result);
}

check().catch(console.error);
