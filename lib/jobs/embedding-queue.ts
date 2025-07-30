import 'server-only';

import { embeddingProcessor } from './embedding-processor';

interface EmbeddingJob {
  messageId: string;
  priority?: 'high' | 'normal' | 'low';
  retries?: number;
}

class EmbeddingQueue {
  private queue: EmbeddingJob[] = [];
  private processing = false;
  private readonly maxRetries = 3;
  private readonly processingDelay = 100; // ms between jobs

  // Add message to queue for embedding processing
  enqueue(messageId: string, priority: 'high' | 'normal' | 'low' = 'normal') {
    const job: EmbeddingJob = {
      messageId,
      priority,
      retries: 0,
    };

    // Insert based on priority
    if (priority === 'high') {
      this.queue.unshift(job);
    } else {
      this.queue.push(job);
    }

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }
  }

  // Process jobs in the queue
  private async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) continue;

      try {
        console.log(`Processing embedding for message: ${job.messageId}`);
        await embeddingProcessor.processMessageEmbedding(job.messageId);
        console.log(`Successfully processed embedding for message: ${job.messageId}`);
      } catch (error) {
        console.error(`Failed to process embedding for message ${job.messageId}:`, error);
        
        // Retry logic
        if (job.retries! < this.maxRetries) {
          job.retries! += 1;
          this.queue.push(job); // Add back to end of queue for retry
          console.log(`Retrying embedding for message ${job.messageId} (attempt ${job.retries})`);
        } else {
          console.error(`Max retries exceeded for message ${job.messageId}`);
        }
      }

      // Small delay between processing jobs to avoid overwhelming the API
      if (this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.processingDelay));
      }
    }

    this.processing = false;
  }

  // Get queue status
  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      nextJob: this.queue[0]?.messageId || null,
    };
  }

  // Clear the queue (for testing/debugging)
  clear() {
    this.queue = [];
    this.processing = false;
  }
}

// Export singleton instance
export const embeddingQueue = new EmbeddingQueue();