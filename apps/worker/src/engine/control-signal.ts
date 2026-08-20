import type { Redis as IORedis } from "ioredis";
import { botControlChannelFor, type BotControlAction } from "@job-app/shared";
import { createRedisConnection } from "../lib/redis.js";

/**
 * Pause/Resume/Stop for one BotRun. There is exactly one BullMQ job per
 * BotRun (see SYSTEM_DESIGN.md §8), so BullMQ's own pause primitive (which
 * operates on the queue, not an in-flight job) doesn't apply — control flows
 * through a dedicated Redis pub/sub channel instead, and the engine checks
 * it only at safe checkpoints (between applications), never mid-submission.
 */
export class ControlSignal {
  private readonly abortController = new AbortController();
  private paused = false;
  private stopped = false;
  private pauseWaiters: Array<() => void> = [];
  private readonly subscriber: IORedis;

  constructor(private readonly userId: string) {
    this.subscriber = createRedisConnection();
  }

  async start(): Promise<void> {
    await this.subscriber.subscribe(botControlChannelFor(this.userId));
    this.subscriber.on("message", (_channel, action) => {
      this.handle(action as BotControlAction);
    });
  }

  private handle(action: BotControlAction): void {
    if (action === "pause") {
      this.paused = true;
    } else if (action === "resume") {
      this.paused = false;
      this.releaseWaiters();
    } else if (action === "stop") {
      this.stopped = true;
      this.paused = false;
      this.abortController.abort();
      this.releaseWaiters();
    }
  }

  private releaseWaiters(): void {
    const waiters = this.pauseWaiters;
    this.pauseWaiters = [];
    for (const resolve of waiters) resolve();
  }

  /** Engine-triggered pause (e.g. session expired + re-auth failed) — same effect as a user-initiated pause, but not driven by the control channel. */
  forcePause(): void {
    this.paused = true;
  }

  get isPaused(): boolean {
    return this.paused;
  }
  get isStopped(): boolean {
    return this.stopped;
  }
  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  /** Called by the engine between applications. Resolves immediately unless paused, in which case it waits for resume or stop. */
  async checkpoint(onPause?: () => void): Promise<void> {
    if (this.stopped || !this.paused) return;
    onPause?.();
    await new Promise<void>((resolve) => this.pauseWaiters.push(resolve));
  }

  async dispose(): Promise<void> {
    this.releaseWaiters();
    await this.subscriber.quit().catch(() => undefined);
  }
}
