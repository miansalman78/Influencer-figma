/**
 * Database Transaction Wrapper Utility
 * 
 * Provides a safe way to run operations within MongoDB transactions.
 * Ensures atomicity for financial operations.
 */

const mongoose = require('mongoose');

/**
 * Run an operation within a MongoDB transaction
 * 
 * @param {Function} operation - Async function that performs the operation
 * @param {Object} options - Optional configuration
 * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
 * @param {number} options.retryDelay - Delay between retries in ms (default: 100)
 * @returns {Promise} Result of the operation
 * 
 * @example
 * const result = await runInTransaction(async (session) => {
 *   const wallet = await Wallet.findOne({ userId }, { session });
 *   wallet.balances.NGN += 100;
 *   await wallet.save({ session });
 *   return wallet;
 * });
 */
const runInTransaction = async (operation, options = {}) => {
  const { maxRetries = 3, retryDelay = 100 } = options;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Run the operation with the session
      const result = await operation(session);

      // Commit the transaction
      await session.commitTransaction();
      
      return result;
    } catch (error) {
      // Abort the transaction on error
      await session.abortTransaction();
      lastError = error;

      // Check if error is retryable (transient transaction errors)
      const isRetryable = 
        error.errorLabels?.includes('TransientTransactionError') ||
        error.code === 251 || // WriteConflict
        error.code === 50;    // MaxTimeMSExpired

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
    } finally {
      session.endSession();
    }
  }

  throw lastError;
};

/**
 * Run multiple operations in a single transaction
 * 
 * @param {Array<Function>} operations - Array of async functions to run
 * @returns {Promise<Array>} Array of results from each operation
 * 
 * @example
 * const [wallet, transaction] = await runMultipleInTransaction([
 *   async (session) => {
 *     const w = await Wallet.findOne({ userId }, { session });
 *     w.balances.NGN += 100;
 *     await w.save({ session });
 *     return w;
 *   },
 *   async (session) => {
 *     return await Transaction.create([{...}], { session });
 *   }
 * ]);
 */
const runMultipleInTransaction = async (operations) => {
  return await runInTransaction(async (session) => {
    const results = [];
    for (const operation of operations) {
      const result = await operation(session);
      results.push(result);
    }
    return results;
  });
};

module.exports = {
  runInTransaction,
  runMultipleInTransaction
};

