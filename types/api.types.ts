/**
 * API Response Type Definitions
 * 
 * TypeScript type definitions for API responses
 * These types can be used with JSDoc for better IDE support
 * even in JavaScript files
 */

/**
 * Standard API Response Structure
 */
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

/**
 * Paginated API Response
 */
export interface PaginatedResponse<T = any> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * User Role Types
 */
export type UserRole = 'brand' | 'creator' | 'influencer';

/**
 * User Object
 */
export interface User {
  _id: string;
  email: string;
  name?: string;
  role: UserRole;
  creatorRole?: UserRole;
  avatar?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Authentication Response
 */
export interface AuthResponse {
  user: User;
  token: string;
}

/**
 * Wallet Data
 */
export interface Wallet {
  _id: string;
  userId: string;
  balance: number;
  currency: 'USD' | 'NGN';
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Transaction Types
 */
export type TransactionType = 'credit' | 'debit' | 'pending';

/**
 * Transaction Status
 */
export type TransactionStatus = 'completed' | 'pending' | 'failed' | 'cancelled';

/**
 * Transaction
 */
export interface Transaction {
  _id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  currency: 'USD' | 'NGN';
  description?: string;
  status: TransactionStatus;
  paymentMethodId?: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Payment Method Types
 */
export type PaymentMethodType = 'bank_account' | 'paypal' | 'stripe' | 'paystack';

/**
 * Payment Method
 */
export interface PaymentMethod {
  _id: string;
  userId: string;
  type: PaymentMethodType;
  currency: 'USD' | 'NGN';
  isDefault?: boolean;
  details?: {
    accountNumber?: string;
    accountName?: string;
    bankName?: string;
    email?: string;
    [key: string]: any;
  };
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Campaign Status
 */
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';

/**
 * Campaign
 */
export interface Campaign {
  _id: string;
  brandId: string;
  title: string;
  description?: string;
  budget: number;
  currency: 'USD' | 'NGN';
  status: CampaignStatus;
  startDate?: string;
  endDate?: string;
  requirements?: string[];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Offer Status
 */
export type OfferStatus = 'active' | 'inactive' | 'sold_out';

/**
 * Offer
 */
export interface Offer {
  _id: string;
  creatorId: string;
  title: string;
  description?: string;
  price: number;
  currency: 'USD' | 'NGN';
  serviceType?: string;
  status: OfferStatus;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Order Status
 */
export type OrderStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

/**
 * Order
 */
export interface Order {
  _id: string;
  brandId: string;
  creatorId: string;
  campaignId?: string;
  offerId?: string;
  amount: number;
  currency: 'USD' | 'NGN';
  status: OrderStatus;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Proposal Status
 */
export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

/**
 * Proposal
 */
export interface Proposal {
  _id: string;
  campaignId: string;
  creatorId: string;
  message?: string;
  price: number;
  currency: 'USD' | 'NGN';
  status: ProposalStatus;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Review
 */
export interface Review {
  _id: string;
  reviewerId: string;
  revieweeId: string;
  orderId?: string;
  rating: number;
  comment?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Payment Response
 */
export interface PaymentResponse {
  _id: string;
  orderId?: string;
  offerId?: string;
  amount: number;
  currency: 'USD' | 'NGN';
  status: TransactionStatus;
  paymentMethodId: string;
  createdAt?: string;
}

/**
 * Error Response
 */
export interface ErrorResponse {
  success: false;
  message: string;
  error?: string;
  statusCode?: number;
}

