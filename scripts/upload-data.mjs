// Upload the game archives the web app fetches to the Vercel Blob store that backs the live site.
// Usage (from repo root, after `cd scripts && npm install`):
//   BLOB_READ_WRITE_TOKEN=... node scripts/upload-data.mjs [dataDir] [setupsDir]
// Defaults: dataDir = web/public/data, setupsDir = web/public/setups. The token is also read from web/.env.local.
// Only the archives listed in NEEDED are uploaded (about 285 MB), under the same paths the app requests
// (/data/<file>.mfd and /setups/<id>.json), with no random suffix. Files already present with the same
// size are skipped, so re-running is cheap. See DEPLOY.md.
import { put, list } from '@vercel/blob';
import { readFileSync, readdirSync, statSync, existsSync, createReadStream } from 'node:fs';
import { join, basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = resolve(process.argv[2] ?? join(root, 'web/public/data'));
const setupsDir = resolve(process.argv[3] ?? join(root, 'web/public/setups'));

let token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  const envFile = join(root, 'web/.env.local');
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, 'utf8').match(/^BLOB_READ_WRITE_TOKEN="?([^"\n]+)"?/m);
    if (m) token = m[1];
  }
}
if (!token) { console.error('BLOB_READ_WRITE_TOKEN not set (env or web/.env.local). Run `npx vercel@latest env pull` in web/ first.'); process.exit(1); }

const NEEDED = /^(Tracks\d+|TxTr\d+|TxTrkCom|TxCars|MechaCar|Sound)\.mfd$/;
const jobs = [];
for (const f of readdirSync(dataDir)) if (NEEDED.test(f)) jobs.push({ file: join(dataDir, f), path: `data/${f}`, type: 'application/octet-stream' });
for (const f of readdirSync(setupsDir)) if (f.endsWith('.json')) jobs.push({ file: join(setupsDir, f), path: `setups/${f}`, type: 'application/json' });

// Index what is already in the store so unchanged files are skipped.
const existing = new Map();
for (const prefix of ['data/', 'setups/']) {
  let cursor;
  do {
    const page = await list({ token, prefix, cursor, limit: 1000 });
    for (const b of page.blobs) existing.set(b.pathname, b.size);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}

let total = 0, uploaded = 0, skipped = 0;
for (const j of jobs) total += statSync(j.file).size;
console.log(`${jobs.length} files, ${(total / 1e6).toFixed(0)} MB total; ${existing.size} already in store`);

const CONCURRENCY = 4;
let i = 0;
async function worker() {
  while (i < jobs.length) {
    const j = jobs[i++];
    const size = statSync(j.file).size;
    if (existing.get(j.path) === size) { skipped++; continue; }
    const t0 = Date.now();
    const r = await put(j.path, createReadStream(j.file), {
      access: 'public', token, addRandomSuffix: false, allowOverwrite: true,
      contentType: j.type, cacheControlMaxAge: 31536000, multipart: size > 20e6,
    });
    uploaded++;
    console.log(`${j.path}  ${(size / 1e6).toFixed(1)} MB  ${((Date.now() - t0) / 1000).toFixed(1)}s  -> ${r.url}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`done: ${uploaded} uploaded, ${skipped} skipped (unchanged)`);
console.log('Public base URL (set as VITE_DATA_BASE on the Vercel project):');
const sample = await list({ token, prefix: 'setups/', limit: 1 });
if (sample.blobs[0]) console.log(new URL(sample.blobs[0].url).origin);
