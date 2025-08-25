export const SKIP_RATING = -1;
export const DEFAULT_RATING = 50; // 0–100 scale baseline

export type Outcome = 0 | 0.5 | 1; // score for "a"

export interface EloEvent {
    t: number; // timestamp
    a: string; // id of item a (e.g., file path)
    b: string; // id of item b
    s: Outcome; // outcome for a (1 win, 0 loss, 0.5 draw)
}

export interface StoreV1 {
    version: 1;
    events: EloEvent[]; // append-only
}

export function clamp(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n));
}

// Map common "rating" properties to a 0–100 score
export function toScore100(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    if (value < 0) return null;
    if (value <= 5) return Math.round(value * 20); // 0–5 stars -> 0–100
    if (value <= 10) return Math.round(value * 10); // 0–10 -> 0–100
    if (value <= 100) return Math.round(value); // already 0–100
    // Values above 100 are probably not a simple "rating".
    // Clamp to 100 to avoid blowing up the scale.
    return 100;
}

function expectedScore(rA100: number, rB100: number, scale = 12): number {
    // Work on a 0–100 face value, but convert to ~Elo-like range internally.
    const a = rA100 * scale;
    const b = rB100 * scale;
    return 1 / (1 + Math.pow(10, (b - a) / 400));
}

// General update for a pair (works for wins/losses/draws)
export function eloUpdate(
    rA100: number,
    rB100: number,
    sA: Outcome,
    k = 3
): readonly [number, number] {
    const eA = expectedScore(rA100, rB100);
    const eB = 1 - eA;
    const newA = Math.round(clamp(rA100 + k * (sA - eA), 0, 100));
    const newB = Math.round(clamp(rB100 + k * ((1 - sA) - eB), 0, 100));
    return [newA, newB] as const;
}