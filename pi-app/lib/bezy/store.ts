"use client";

import { pi } from "@/lib/pi";

type Build = () => Record<string, unknown>;

/**
 * Debounced, rate-limit-aware writer around the Pi user-state storage.
 * - Per-key debounce so rapid edits collapse into one write.
 * - Respects the storage rate limits (roughly 1 write / 5s per key, 1 write / 2s overall).
 * - On rejection it keeps the latest snapshot and retries with exponential backoff, so the
 *   user's data is never lost; a non-blocking notice is surfaced through onTrouble.
 */
export class KeyWriter {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private pending = new Map<string, Build>();
  private inFlight = new Set<string>();
  private backoff = new Map<string, number>();
  private lastWrite = new Map<string, number>();
  private static lastAny = 0;
  private onTrouble?: (trouble: boolean) => void;

  private readonly DEBOUNCE = 900;
  private readonly MIN_PER_KEY = 5200;
  private readonly MIN_ACROSS = 1100;

  constructor(onTrouble?: (trouble: boolean) => void) {
    this.onTrouble = onTrouble;
  }

  schedule(key: string, build: Build, immediate = false) {
    this.pending.set(key, build);
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => this.flush(key), immediate ? 0 : this.DEBOUNCE);
    this.timers.set(key, t);
  }

  private async flush(key: string) {
    const build = this.pending.get(key);
    if (!build) return;
    if (this.inFlight.has(key)) {
      this.reschedule(key, 400);
      return;
    }
    const now = Date.now();
    const perKeyWait = (this.lastWrite.get(key) ?? 0) + this.MIN_PER_KEY - now;
    const acrossWait = KeyWriter.lastAny + this.MIN_ACROSS - now;
    const wait = Math.max(perKeyWait, acrossWait, 0);
    if (wait > 0) {
      this.reschedule(key, wait);
      return;
    }

    this.pending.delete(key);
    const timer = this.timers.get(key);
    if (timer) clearTimeout(timer);
    this.timers.delete(key);
    this.inFlight.add(key);

    const blob = build();
    try {
      await pi.userState.set(key, blob);
      this.lastWrite.set(key, Date.now());
      KeyWriter.lastAny = Date.now();
      this.backoff.delete(key);
      this.onTrouble?.(false);
    } catch {
      const next = Math.min((this.backoff.get(key) ?? 3000) * 1.8, 30000);
      this.backoff.set(key, next);
      // Keep the latest builder so nothing is lost, retry later.
      if (!this.pending.has(key)) this.pending.set(key, build);
      this.reschedule(key, next);
      this.onTrouble?.(true);
    } finally {
      this.inFlight.delete(key);
    }
  }

  private reschedule(key: string, delay: number) {
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => this.flush(key), delay);
    this.timers.set(key, t);
  }

  async flushNow() {
    const keys = Array.from(this.pending.keys());
    await Promise.all(
      keys.map(async (key) => {
        const build = this.pending.get(key);
        if (!build) return;
        this.pending.delete(key);
        const t = this.timers.get(key);
        if (t) clearTimeout(t);
        this.timers.delete(key);
        try {
          await pi.userState.set(key, build());
        } catch {
          /* best effort on unload */
        }
      }),
    );
  }
}
