/**
 * Replay-Schutz. Jede Anfrage traegt Zeitstempel und Nonce; beides wird geprueft,
 * die Nonce anschliessend fuer die doppelte Toleranzzeit gemerkt.
 *
 * Der Speicher ist austauschbar: in Produktion Redis, in Tests eine Map.
 */
export interface NonceStore {
  /** true, wenn die Nonce neu war und gespeichert wurde. */
  claim(nonce: string, ttlSeconds: number): Promise<boolean>;
}

export class MemoryNonceStore implements NonceStore {
  readonly #seen = new Map<string, number>();
  #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  async claim(nonce: string, ttlSeconds: number): Promise<boolean> {
    const now = this.#now();
    for (const [key, expiry] of this.#seen) {
      if (expiry <= now) this.#seen.delete(key);
    }
    if (this.#seen.has(nonce)) return false;
    this.#seen.set(nonce, now + ttlSeconds * 1000);
    return true;
  }
}

export const CLOCK_TOLERANCE_SECONDS = 300;

export type ReplayResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: 'LIC_CLOCK_SKEW' | 'LIC_REPLAY' | 'LIC_NONCE_WEAK' };

export async function checkReplay(
  store: NonceStore,
  nonce: string,
  timestampIso: string,
  nowMs: number,
): Promise<ReplayResult> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(nonce)) {
    return { ok: false, code: 'LIC_NONCE_WEAK' };
  }
  const ts = Date.parse(timestampIso);
  if (Number.isNaN(ts) || Math.abs(nowMs - ts) > CLOCK_TOLERANCE_SECONDS * 1000) {
    return { ok: false, code: 'LIC_CLOCK_SKEW' };
  }
  const fresh = await store.claim(nonce, CLOCK_TOLERANCE_SECONDS * 2);
  return fresh ? { ok: true } : { ok: false, code: 'LIC_REPLAY' };
}
