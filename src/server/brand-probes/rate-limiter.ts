type WindowEvent = {
  at: number;
  amount: number;
};

type RateLimiterSettings = {
  requestsPerMinute: number;
  probesPerMinute: number;
  tokensPerMinute: number;
  maxConcurrency: number;
};

export class RateLimiter {
  private running = 0;
  private readonly requestEvents: WindowEvent[] = [];
  private readonly probeEvents: WindowEvent[] = [];
  private readonly tokenEvents: WindowEvent[] = [];

  constructor(
    private settings: RateLimiterSettings,
  ) {}

  update(settings: Partial<RateLimiterSettings>) {
    this.settings = { ...this.settings, ...settings };
  }

  async schedule<T>(input: {
    probes: number;
    estimatedTokens: number;
    task: () => Promise<T>;
  }) {
    await this.acquire(input.probes, input.estimatedTokens);
    try {
      return await input.task();
    } finally {
      this.running = Math.max(0, this.running - 1);
    }
  }

  private async acquire(probes: number, tokens: number) {
    for (;;) {
      const delay = this.nextDelay(probes, tokens);
      if (delay <= 0) {
        this.running += 1;
        const now = Date.now();
        this.requestEvents.push({ at: now, amount: 1 });
        this.probeEvents.push({ at: now, amount: probes });
        this.tokenEvents.push({ at: now, amount: tokens });
        return;
      }
      await sleep(delay);
    }
  }

  private nextDelay(probes: number, tokens: number) {
    const now = Date.now();
    prune(this.requestEvents, now);
    prune(this.probeEvents, now);
    prune(this.tokenEvents, now);

    if (this.running >= this.settings.maxConcurrency) return 50;
    if (sum(this.requestEvents) + 1 > this.settings.requestsPerMinute) return millisUntilOldestExpires(this.requestEvents, now);
    if (sum(this.probeEvents) + probes > this.settings.probesPerMinute) return millisUntilOldestExpires(this.probeEvents, now);
    if (sum(this.tokenEvents) + tokens > this.settings.tokensPerMinute) return millisUntilOldestExpires(this.tokenEvents, now);
    return 0;
  }
}

function prune(events: WindowEvent[], now: number) {
  while (events[0] && now - events[0].at >= 60000) {
    events.shift();
  }
}

function sum(events: WindowEvent[]) {
  return events.reduce((total, event) => total + event.amount, 0);
}

function millisUntilOldestExpires(events: WindowEvent[], now: number) {
  return Math.max(50, 60000 - (now - (events[0]?.at ?? now)));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
