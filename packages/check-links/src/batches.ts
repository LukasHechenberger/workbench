/** Maps `items` with at most `concurrency` parallel `fn` calls, one batch after the other */
export async function mapInBatches<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    // oxlint-disable-next-line no-await-in-loop -- one batch after the other, on purpose
    results.push(...(await Promise.all(items.slice(i, i + concurrency).map(fn))));
  }
  return results;
}
