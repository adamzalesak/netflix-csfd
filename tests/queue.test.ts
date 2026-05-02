import { describe, it, expect, vi } from "vitest";
import { ThrottleQueue } from "../src/background/queue";

describe("ThrottleQueue", () => {
  it("limits concurrent executions", async () => {
    const q = new ThrottleQueue({ maxConcurrent: 2, minDelayMs: 0, maxRetries: 0 });
    let inFlight = 0;
    let maxObserved = 0;
    const task = async () => {
      inFlight++;
      maxObserved = Math.max(maxObserved, inFlight);
      await new Promise(r => setTimeout(r, 10));
      inFlight--;
      return 1;
    };
    await Promise.all([q.run("a", task), q.run("b", task), q.run("c", task), q.run("d", task)]);
    expect(maxObserved).toBeLessThanOrEqual(2);
  });

  it("dedups same key", async () => {
    const q = new ThrottleQueue({ maxConcurrent: 4, minDelayMs: 0, maxRetries: 0 });
    const fn = vi.fn(async () => 42);
    const [a, b, c] = await Promise.all([
      q.run("samekey", fn),
      q.run("samekey", fn),
      q.run("samekey", fn),
    ]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect([a, b, c]).toEqual([42, 42, 42]);
  });

  it("retries on failure with backoff", async () => {
    const q = new ThrottleQueue({ maxConcurrent: 1, minDelayMs: 0, maxRetries: 2 });
    let calls = 0;
    const fn = async () => { calls++; if (calls < 3) throw new Error("nope"); return "ok"; };
    const result = await q.run("k", fn);
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  }, 10000);

  it("propagates failure after max retries", async () => {
    const q = new ThrottleQueue({ maxConcurrent: 1, minDelayMs: 0, maxRetries: 1 });
    const fn = async () => { throw new Error("permanent"); };
    await expect(q.run("k", fn)).rejects.toThrow("permanent");
  });
});
