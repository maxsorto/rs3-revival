# Deploying

## Where the live site runs

- Hosting: Vercel, project `rs3-revival` on the DapperLogic team (`dapper-logic`).
- Live URL: https://rs3-revival.vercel.app
- Source: this GitHub repository, `main` branch, connected through the Vercel Git integration.
- Project settings: Root Directory `web`, Framework `Vite`, build `npm run build` (runs `tsc && vite build`), output `dist`.

## The pipeline

Every push to `main` makes Vercel clone the repo, run `npm install` and `npm run build` inside `web/`, and publish `web/dist` to the production URL. Pushes to other branches and pull requests get preview deployments.

The repository contains no game data, so the build output has no `data/` or `setups/` folder. The app does not expect them there either: `web/src/paths.ts` prefixes every fetch of `/data/...` and `/setups/...` with the `VITE_DATA_BASE` environment variable, which is set on the Vercel project.

## Where the game data lives

A Vercel Blob store named `rs3-data` (public access, region iad1) on the same team holds exactly the files the app fetches, under the same paths the app requests, with no random suffixes:

- `data/Tracks0.mfd` ... `data/Tracks16.mfd` (no track 3 in the game)
- `data/TxTr0.mfd` ... `data/TxTr16.mfd`
- `data/TxTrkCom.mfd`, `data/TxCars.mfd`, `data/MechaCar.mfd`, `data/Sound.mfd`
- `setups/<id>.json` (193 files decoded from MechaCar.mfd by `tools/bsp.py`)

That is 36 archives (266 MB) plus the setups (19 MB), about 285 MB in total. The full DataBin is 373 MB; the rest is menus, intro videos, animations and the other things the port does not use yet.

Public base URL: `https://q3rbsepk5nkybqh6.public.blob.vercel-storage.com`

The store answers with `access-control-allow-origin: *`, so the vercel.app origin can fetch it directly. Blobs are uploaded with `cache-control: public, max-age=31536000` because the game data never changes.

`VITE_DATA_BASE` is set to that base URL for the Production and Preview targets on the Vercel project (not Development, so `vercel env pull` keeps local dev on local files). Vite inlines it at build time, so changing it requires a redeploy.

## Re-uploading the data

Needs the store's read-write token. From the repo root:

```sh
cd web && npx vercel@latest link --project rs3-revival --scope dapper-logic && npx vercel@latest env pull && cd ..
cd scripts && npm install && cd ..
node scripts/upload-data.mjs /path/to/DataBin /path/to/setups
```

The script uploads only the needed archives, skips files already present with the same size, and prints the public base URL at the end. If you ever need to replace a file, the CDN may keep serving the old copy for up to a year because of the cache header; upload under a new path or change the cache age in the script.

## Redeploying

- Normal: push to `main`. Vercel builds and publishes.
- Manual, from a laptop: `cd web && npx vercel@latest deploy --prod --scope dapper-logic`. The root `.vercelignore` keeps the game data out of the upload.
- The `vercel` binary from Homebrew is currently broken on this Mac (missing `libllhttp`); `npx vercel@latest` works.

## Checking a deployment

```sh
curl -sI https://rs3-revival.vercel.app | head -1                                  # 200
curl -sI https://q3rbsepk5nkybqh6.public.blob.vercel-storage.com/data/Tracks0.mfd | grep -iE "^HTTP|content-length"   # 200, ~6.7 MB
```

## Local development

Local dev does not use the bucket. `web/public/data` and `web/public/setups` are symlinks (gitignored) to the game's DataBin folder and the decoded setups, served by Vite from the same origin. To test against the bucket locally, put `VITE_DATA_BASE=https://q3rbsepk5nkybqh6.public.blob.vercel-storage.com` in `web/.env.local`.
