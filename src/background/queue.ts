type Task<T> = () => Promise<T>;

export type QueueOptions = {
  maxConcurrent: number;
  minDelayMs: number;
  maxRetries: number;
};

export class ThrottleQueue {
  private active = 0;
  private lastStartAt = 0;
  private waiting: Array<() => void> = [];
  private inFlight = new Map<string, Promise<unknown>>();
  private circuitOpenUntil = 0;

  constructor(private opts: QueueOptions) {}

  isCircuitOpen(now: number = Date.now()): boolean {
    return now < this.circuitOpenUntil;
  }

  openCircuit(durationMs: number): void {
    this.circuitOpenUntil = Date.now() + durationMs;
  }

  async run<T>(key: string, task: Task<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;
    const p = this.execute(task).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, p);
    return p;
  }

  private async execute<T>(task: Task<T>): Promise<T> {
    await this.acquireSlot();
    try {
      return await this.withRetries(task);
    } finally {
      this.releaseSlot();
    }
  }

  private async acquireSlot(): Promise<void> {
    while (this.active >= this.opts.maxConcurrent) {
      await new Promise<void>(res => this.waiting.push(res));
    }
    const sinceLast = Date.now() - this.lastStartAt;
    if (sinceLast < this.opts.minDelayMs) {
      await new Promise(r => setTimeout(r, this.opts.minDelayMs - sinceLast));
    }
    this.active++;
    this.lastStartAt = Date.now();
  }

  private releaseSlot(): void {
    this.active--;
    const next = this.waiting.shift();
    if (next) next();
  }

  private async withRetries<T>(task: Task<T>): Promise<T> {
    let attempt = 0;
    let lastErr: unknown;
    while (attempt <= this.opts.maxRetries) {
      try {
        return await task();
      } catch (err) {
        lastErr = err;
        attempt++;
        if (attempt > this.opts.maxRetries) break;
        const backoff = 1000 * Math.pow(4, attempt - 1);  // 1s, 4s
        await new Promise(r => setTimeout(r, backoff));
      }
    }
    throw lastErr;
  }
}
