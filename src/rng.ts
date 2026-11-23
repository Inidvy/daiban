// Seeded random numbers so a simulation run can be replayed exactly.
// mulberry32 by Tommy Ettinger (public domain): https://gist.github.com/tommyettinger/46a874533244883189143505d203312c

export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick from an empty list');
  return items[Math.floor(rng() * items.length)];
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}
