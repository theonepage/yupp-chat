export const embeddingConfig = {
  // Enable/disable automatic embedding generation
  autoGenerate: process.env.AUTO_GENERATE_EMBEDDINGS !== 'false', // Default: true
  
  // Processing mode: 'realtime' | 'queue' | 'cron' | 'manual'
  mode: (process.env.EMBEDDING_MODE as 'realtime' | 'queue' | 'cron' | 'manual') || 'queue',
  
  // Batch size for processing
  batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || '10'),
  
  // Processing delay between batches (ms)
  processingDelay: parseInt(process.env.EMBEDDING_PROCESSING_DELAY || '100'),
  
  // Enable retry logic
  enableRetries: process.env.EMBEDDING_ENABLE_RETRIES !== 'false',
  
  // Maximum retries
  maxRetries: parseInt(process.env.EMBEDDING_MAX_RETRIES || '3'),
  
  // Cron job settings
  cron: {
    secret: process.env.CRON_SECRET,
    enabled: process.env.ENABLE_EMBEDDING_CRON === 'true',
  },
} as const;

export type EmbeddingMode = typeof embeddingConfig.mode;