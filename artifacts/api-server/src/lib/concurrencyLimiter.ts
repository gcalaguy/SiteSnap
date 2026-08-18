/**
 * Minimal semaphore for bounding concurrent async work that isn't naturally
 * an array to batch over (e.g. child_process calls triggered independently
 * by unrelated incoming requests). JS is single-threaded, so a plain counter
 * + FIFO queue of waiters is sufficient — no locking needed.
 */
export function createLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  function acquire(): Promise<void> {
    if (active < maxConcurrent) {
      active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => queue.push(resolve));
  }

  function release(): void {
    active--;
    const next = queue.shift();
    if (next) {
      active++;
      next();
    }
  }

  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    await acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

/**
 * Shared cap on concurrent native image/PDF conversion processes
 * (pdftoppm, ImageMagick `convert`) spawned via child_process across
 * pdfOcr.ts and imageConvert.ts — these are independently triggered by
 * unrelated requests (receipt OCR, estimate parsing, document analysis) and
 * previously had no bound, so a burst of uploads could fork unbounded
 * CPU-bound processes at once.
 */
export const runNativeImageTool = createLimiter(3);
