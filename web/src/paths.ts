// Where the game archives are served from. Empty = same origin (/data/..., /setups/...). Set VITE_DATA_BASE for a bucket/CDN.
export const DATA_BASE: string = ((import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_DATA_BASE ?? '').replace(/\/$/, '');
export const dataUrl = (p: string): string => DATA_BASE + p;
