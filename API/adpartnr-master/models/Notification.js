const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  type: {
    type: String,
    required: true,
    enum: [
      'proposal_submitted',
      'proposal_accepted',
      'proposal_rejected',
      'order_created',
      'order_paid',
      'order_completed',
      'order_deliverables_submitted',
      'order_revisions_requested',
      'order_rejected',
      'order_cancelled',
      'message_new',
      'payment_received',
      'payment_released',
      'campaign_new_applicant',
      'campaign_deadline_reminder',
      'campaign_new_from_connection',
      'offer_new_from_connection',
      'review_received',
      'offer_purchased',
      'offer_sent',
      'brand_connected',
      'general',
    ],
    default: 'general',
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  body: {
    type: String,
    trim: true,
    maxlength: 500,
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  read: {
    type: Boolean,
    default: false,
    index: true,
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });
// Dedupe: one notification per (userId, type, entity id)
notificationSchema.index({ userId: 1, type: 1, 'data.orderId': 1 });
notificationSchema.index({ userId: 1, type: 1, 'data.proposalId': 1 });
notificationSchema.index({ userId: 1, type: 1, 'data.campaignId': 1 });
notificationSchema.index({ userId: 1, type: 1, 'data.conversationId': 1 });
// One message_new per (user, conversation, messageId) - prevents duplicate even with multiple server instances
notificationSchema.index(
  { userId: 1, type: 1, 'data.conversationId': 1, 'data.messageId': 1 },
  { unique: true, sparse: true }
);
notificationSchema.index({ userId: 1, type: 1, 'data.offerId': 1 });
notificationSchema.index({ userId: 1, type: 1, 'data.connectionId': 1 });

const Notification = mongoose.model('Notification', notificationSchema);
module.exports = Notification;
