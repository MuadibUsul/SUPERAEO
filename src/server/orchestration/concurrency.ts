export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number, laneIndex: number) => Promise<R>,
) {
  if (items.length === 0) {
    return [] as R[];
  }

  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: limit }, async (_, laneIndex) => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) {
          return;
        }
        results[index] = await worker(items[index], index, laneIndex);
      }
    }),
  );

  return results;
}
