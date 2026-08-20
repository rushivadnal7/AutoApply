/**
 * Abortable delay used for the pacing gap between applications (requirement
 * §24: rate-control to avoid hammering a portal). If `signal` aborts mid-wait
 * (Stop was requested) we resolve immediately rather than making Stop wait
 * out the remaining delay.
 */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
