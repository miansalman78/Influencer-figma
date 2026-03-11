/**
 * Type Definitions for API Responses (Declaration File)
 * 
 * This file provides type definitions that can be used with JSDoc
 * in JavaScript files for better IDE support and type checking
 */

/**
 * @typedef {Object} ApiResponse
 * @property {boolean} success
 * @property {string} [message]
 * @property {*} [data]
 * @property {string} [error]
 */

/**
 * @typedef {Object} User
 * @property {string} _id
 * @property {string} email
 * @property {string} [name]
 * @property {'brand'|'creator'|'influencer'} role
 * @property {'brand'|'creator'|'influencer'} [creatorRole]
 * @property {string} [avatar]
 */

/**
 * @typedef {Object} Wallet
 * @property {string} _id
 * @property {string} userId
 * @property {number} balance
 * @property {'USD'|'NGN'} currency
 */

/**
 * @typedef {Object} Transaction
 * @property {string} _id
 * @property {string} userId
 * @property {'credit'|'debit'|'pending'} type
 * @property {number} amount
 * @property {'USD'|'NGN'} currency
 * @property {string} [description]
 * @property {'completed'|'pending'|'failed'|'cancelled'} status
 */

