export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return clamp01(dot / Math.sqrt(leftMagnitude * rightMagnitude));
}

export function histogramIntersection(left: readonly number[], right: readonly number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0;
  let intersection = 0;
  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = Math.max(0, left[index] ?? 0);
    const rightValue = Math.max(0, right[index] ?? 0);
    intersection += Math.min(leftValue, rightValue);
    total += Math.max(leftValue, rightValue);
  }
  return total === 0 ? 0 : clamp01(intersection / total);
}

export function hammingSimilarity(left: string, right: string): number {
  if (left.length !== right.length || !/^[0-9a-f]+$/i.test(left) || !/^[0-9a-f]+$/i.test(right)) return 0;
  let differences = 0;
  for (let index = 0; index < left.length; index += 1) {
    let xor = Number.parseInt(left[index] ?? "0", 16) ^ Number.parseInt(right[index] ?? "0", 16);
    while (xor !== 0) {
      differences += xor & 1;
      xor >>>= 1;
    }
  }
  return clamp01(1 - differences / (left.length * 4));
}

export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

export function normalizeVector(vector: readonly number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return magnitude === 0 ? vector.map(() => 0) : vector.map((value) => value / magnitude);
}
