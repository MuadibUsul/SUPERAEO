export type MicroBatchItem<T> = {
  id: string;
  payload: T;
};

export function buildMicroBatches<T>(items: MicroBatchItem<T>[], batchSize: number) {
  const size = Math.max(1, Math.floor(batchSize));
  const batches: MicroBatchItem<T>[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
