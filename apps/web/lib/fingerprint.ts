export interface FingerprintPoint {
  id: number;
  x: number;
  y: number;
  radius: number;
  opacity: number;
  group: number;
}

function hashSeed(input: string): number {
  let seed = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    seed ^= input.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function random(seed: number): [number, number] {
  let next = seed + 0x6d2b79f5;
  next = Math.imul(next ^ (next >>> 15), next | 1);
  next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
  return [
    ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296,
    (seed + 0x6d2b79f5) >>> 0,
  ];
}

export function fingerprintPoints(
  hash: string,
  count = 54,
): FingerprintPoint[] {
  let seed = hashSeed(hash.toLowerCase());
  return Array.from({ length: count }, (_, id) => {
    let value: number;
    [value, seed] = random(seed);
    const angle = value * Math.PI * 2;
    [value, seed] = random(seed);
    const distance = Math.sqrt(value) * 42;
    [value, seed] = random(seed);
    const wobble = (value - 0.5) * 8;
    [value, seed] = random(seed);
    const radius = 0.8 + value * 2;
    [value, seed] = random(seed);
    return {
      id,
      x: 50 + Math.cos(angle) * distance + wobble,
      y: 50 + Math.sin(angle) * distance + wobble * 0.6,
      radius,
      opacity: 0.35 + value * 0.65,
      group: id % 6,
    };
  });
}

export function fingerprintLinks(
  points: FingerprintPoint[],
  maxDistance = 15,
): Array<[number, number]> {
  const links: Array<[number, number]> = [];
  points.forEach((point, index) => {
    let nearestIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let candidate = index + 1; candidate < points.length; candidate += 1) {
      const other = points[candidate];
      if (!other) continue;
      const distance = Math.hypot(point.x - other.x, point.y - other.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = candidate;
      }
    }
    if (nearestIndex >= 0 && nearestDistance <= maxDistance)
      links.push([index, nearestIndex]);
  });
  return links;
}
