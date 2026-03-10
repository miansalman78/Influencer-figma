const cron = require('node-cron');
const { syncAllUsersSocialAccounts } = require('../utils/socialSyncHelpers');

// Schedule: Run every 3 hours at minute 0 (improved from 6 hours)
// Format: minute hour day month day-of-week
// '0 */3 * * *' = every 3 hours
// Can be overridden with SOCIAL_SYNC_SCHEDULE environment variable
const schedule = process.env.SOCIAL_SYNC_SCHEDULE || '0 */3 * * *';

let jobRunning = false;

const runSyncJob = async () => {
  if (jobRunning) {
    console.log('Social sync job already running, skipping...');
    return;
  }
  
  jobRunning = true;
  console.log(`[${new Date().toISOString()}] Starting social media sync job...`);
  
  try {
    const results = await syncAllUsersSocialAccounts();
    console.log(`[${new Date().toISOString()}] Social sync job completed:`, {
      total: results.total,
      synced: results.synced,
      failed: results.failed
    });
    
    if (results.errors.length > 0) {
      console.error('Sync errors:', results.errors.slice(0, 10)); // Log first 10 errors
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Social sync job failed:`, error.message);
  } finally {
    jobRunning = false;
  }
};

// Start the scheduled job
const startSocialSyncJob = () => {
  console.log(`Social media sync job scheduled: ${schedule}`);
  cron.schedule(schedule, runSyncJob, {
    scheduled: true,
    timezone: 'UTC'
  });
  
  // Run immediately on startup (optional - comment out if not needed)
  // runSyncJob();
};

// Manual trigger (for testing)
const triggerSyncJob = async () => {
  await runSyncJob();
};

module.exports = {
  startSocialSyncJob,
  triggerSyncJob,
  runSyncJob
};

