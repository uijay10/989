const BASE_MS    = new Date("2026-05-11T00:00:00Z").getTime();
const BASE_COUNT = 2006;

export function getMemberCount(): number {
  const days = Math.max(0, Math.floor((Date.now() - BASE_MS) / 86_400_000));
  let count = BASE_COUNT;
  for (let i = 0; i < days; i++) {
    const seed = (i + 1) * 1103515245 + 12345;
    const r    = Math.abs(seed);
    if (i < 14)      count += 25  + (r % 56);
    else if (i < 26) count += 80  + (r % 189);
    else             count += 350 + (r % 351);
  }
  return count;
}
