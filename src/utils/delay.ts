/**
 * Generates a random delay between min and max milliseconds
 */
export function randomDelay(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Human-like delay with some randomness
 */
export function humanDelay(baseMs: number = 1000, variance: number = 0.3): Promise<void> {
  const varianceAmount = baseMs * variance;
  const min = baseMs - varianceAmount;
  const max = baseMs + varianceAmount;
  return randomDelay(min, max);
}

