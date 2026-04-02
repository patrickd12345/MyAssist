/**
 * Returns `undefined` if `promise` does not settle within `ms`, or if it rejects.
 * The underlying promise is not cancelled.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } catch {
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
