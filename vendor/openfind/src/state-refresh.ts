// Coalesce refreshes and respect server backoff without retrying user mutations.
export function retryDelay(value: string | null, status: number, now = Date.now()): number {
  if (!value?.trim()) return status === 429 ? 30000 : 0;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) && delay >= 0 ? delay : status === 429 ? 30000 : 0;
}

export function createStateRefresh<T>({load, onSuccess, onError, now = Date.now}: {
  load: () => Promise<T>;
  onSuccess: (value: T) => void;
  onError: (error: unknown) => void;
  now?: () => number;
}) {
  let inFlight: Promise<void> | null = null;
  let retryAt = 0;
  return function refresh(): Promise<void> {
    if (inFlight) return inFlight;
    if (now() < retryAt) return Promise.resolve();
    inFlight = Promise.resolve().then(load).then(value => {
      retryAt = 0;
      onSuccess(value);
    }, error => {
      const delay = Number(error?.retryAfterMs);
      if (Number.isFinite(delay) && delay > 0) retryAt = now() + delay;
      onError(error);
    }).finally(() => { inFlight = null; });
    return inFlight;
  };
}
