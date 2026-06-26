export class SlidingWindowRateLimiter {
  private tracker: Map<string, number[]> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(cleanupPeriodMs = 60000) {
    // Run cleanup periodically to prevent memory leaks
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupPeriodMs);
  }

  /**
   * Checks if an action by a specific user in a guild exceeds the rate limit.
   * @param guildId The ID of the guild
   * @param userId The ID of the user performing the action
   * @param action The name of the action (e.g., 'channelDelete')
   * @param limit The maximum number of actions allowed
   * @param windowSeconds The sliding window duration in seconds
   * @returns true if the action is rate limited, false otherwise
   */
  public isRateLimited(
    guildId: string,
    userId: string,
    action: string,
    limit: number,
    windowSeconds: number
  ): boolean {
    const key = `${guildId}:${userId}:${action}`;
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const threshold = now - windowMs;

    let timestamps = this.tracker.get(key) || [];
    // Remove timestamps outside the sliding window
    timestamps = timestamps.filter(ts => ts > threshold);

    // Record the current action
    timestamps.push(now);
    this.tracker.set(key, timestamps);

    // If the count exceeds the limit, they are rate limited
    return timestamps.length > limit;
  }

  /**
   * Resets the rate limit tracker for a specific user action in a guild.
   */
  public reset(guildId: string, userId: string, action: string): void {
    const key = `${guildId}:${userId}:${action}`;
    this.tracker.delete(key);
  }

  /**
   * Cleans up keys that have no active timestamps in their window.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, timestamps] of this.tracker.entries()) {
      // We don't know the exact window for each key here, so we assume a max window of 60 seconds
      const activeTimestamps = timestamps.filter(ts => ts > now - 60000);
      if (activeTimestamps.length === 0) {
        this.tracker.delete(key);
      } else {
        this.tracker.set(key, activeTimestamps);
      }
    }
  }

  /**
   * Destroy the rate limiter interval
   */
  public destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

// Export a singleton instance
export const rateLimiter = new SlidingWindowRateLimiter();
