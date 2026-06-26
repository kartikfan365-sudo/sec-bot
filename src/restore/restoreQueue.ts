import { logger } from '../utils/logger';

export type QueueTask = {
  name: string;
  fn: () => Promise<any>;
  retries?: number;
};

export class RestoreQueue {
  private queue: QueueTask[] = [];
  private isProcessing = false;
  private maxRetries = 5;
  private delayBetweenTasksMs = 250; // Rate limit mitigation delay

  // Progress tracking callbacks
  public onProgress?: (completed: number, total: number, currentTaskName: string) => void;
  public onComplete?: () => void;
  public onError?: (error: Error) => void;

  private totalTasks = 0;
  private completedTasks = 0;

  /**
   * Adds a task to the restore queue.
   */
  public addTask(name: string, fn: () => Promise<any>): void {
    this.queue.push({ name, fn, retries: 0 });
    this.totalTasks++;
    this.startProcessing();
  }

  /**
   * Bulk adds tasks.
   */
  public addTasks(tasks: { name: string; fn: () => Promise<any> }[]): void {
    for (const task of tasks) {
      this.queue.push({ ...task, retries: 0 });
    }
    this.totalTasks += tasks.length;
    this.startProcessing();
  }

  /**
   * Resets the queue state.
   */
  public clear(): void {
    this.queue = [];
    this.isProcessing = false;
    this.totalTasks = 0;
    this.completedTasks = 0;
  }

  /**
   * Starts processing if not already doing so.
   */
  private async startProcessing(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      
      try {
        if (this.onProgress) {
          this.onProgress(this.completedTasks, this.totalTasks, task.name);
        }

        logger.info(`[RestoreQueue] Processing task: ${task.name} (${this.queue.length} left)`);
        await task.fn();
        this.completedTasks++;

        // Add defensive delay between API calls to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, this.delayBetweenTasksMs));

      } catch (error: any) {
        logger.error(`[RestoreQueue] Task failed: ${task.name}. Error: ${error.message}`);

        // Handle Discord Rate Limits (429)
        if (error.status === 429 || (error.message && error.message.includes('rate limit'))) {
          const retryAfter = error.retryAfter ? error.retryAfter * 1000 : 5000;
          logger.warn(`[RestoreQueue] Rate limited! Halted. Waiting ${retryAfter}ms before retrying.`);
          
          // Re-insert task at the front of the queue
          this.queue.unshift(task);
          
          // Wait for rate limit to reset
          await new Promise(resolve => setTimeout(resolve, retryAfter));
          continue;
        }

        // Retry other temporary failures
        if (task.retries! < this.maxRetries) {
          task.retries!++;
          const backoff = Math.pow(2, task.retries!) * 500;
          logger.warn(`[RestoreQueue] Retrying task "${task.name}" in ${backoff}ms (Attempt ${task.retries}/${this.maxRetries})`);
          
          this.queue.unshift(task);
          await new Promise(resolve => setTimeout(resolve, backoff));
        } else {
          logger.error(`[RestoreQueue] Task "${task.name}" exceeded maximum retries. Skipping.`);
          if (this.onError) {
            this.onError(new Error(`Task ${task.name} failed: ${error.message}`));
          }
        }
      }
    }

    this.isProcessing = false;
    if (this.onComplete) {
      logger.info('[RestoreQueue] Completed all tasks.');
      this.onComplete();
    }
  }

  public getProgress(): { completed: number; total: number } {
    return { completed: this.completedTasks, total: this.totalTasks };
  }
}
