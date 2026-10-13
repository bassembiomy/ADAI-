import type { Page } from '@playwright/test';

export type FreezeWorkload = 'vlab' | 'xbridges' | 'sysml' | 'doe' | 'hil';

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runFreezeWorkload(page: Page, workload: FreezeWorkload): Promise<void> {
  // Ensure the page bundle and freeze workloads are mounted
  await page.waitForFunction(() => Boolean((window as any).__adia_freeze_workloads), { timeout: 10000 });

  // Record start marker in browser context
  await page.evaluate((w) => {
    (window as any).__adia_workload_markers = (window as any).__adia_workload_markers || [];
    (window as any).__adia_workload_markers.push({ workload: w, status: 'started', timestamp: performance.now() });
  }, workload);

  // Execute workload with bounded timeout
  const runPromise = page.evaluate(async (w) => {
    const workloads = (window as any).__adia_freeze_workloads;
    if (!workloads || typeof workloads[w] !== 'function') {
      throw new Error(`Freeze workload handler not registered for module: ${w}`);
    }
    const result = await workloads[w]();
    (window as any).__adia_workload_markers.push({
      workload: w,
      status: 'completed',
      timestamp: performance.now(),
      result,
    });
    return result;
  }, workload);

  await withTimeout(runPromise, 5000, `Freeze workload for ${workload}`);
}
