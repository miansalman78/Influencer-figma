const Order = require('../models/Order');
const Campaign = require('../models/Campaign');
const { successResponse, errorResponse, notFoundResponse, forbiddenResponse } = require('../utils/response');
const { applyPagination } = require('../utils/pagination');
const { sanitizeString } = require('../utils/helpers');
const { runInTransaction } = require('../utils/transactionWrapper');
const { createNotification } = require('../utils/notificationHelpers');

// Status-to-progress mapping (must match Order model virtual)
const STATUS_PROGRESS = {
  pending: 15,
  content_creation: 35,
  in_progress: 40,
  awaiting_approval: 75,
  revisions: 55,
  completed: 100,
  cancelled: 0,
  rejected: 0
};

/**
 * Normalize an order document for list responses so frontend always gets dueDate and progress.
 * Ensures timeline.dueDate is present (fallback to order.dueDate or timeline), and progress from virtual or status.
 */
const normalizeOrderForList = (order) => {
  const doc = order && typeof order.toObject === 'function' ? order.toObject({ virtuals: true }) : (order || {});
  const timeline = doc.timeline || {};
  let dueDate = timeline.dueDate || doc.dueDate || null;
  // Fallback for legacy orders that may lack timeline.dueDate
  if (!dueDate && doc.createdAt) {
    const created = new Date(doc.createdAt);
    created.setDate(created.getDate() + 7);
    dueDate = created;
  }
  let progress = doc.progress;
  if (progress === undefined || progress === null) {
    const s = (doc.status || '').toLowerCase();
    progress = STATUS_PROGRESS[s] !== undefined ? STATUS_PROGRESS[s] : 0;
  }
  return {
    ...doc,
    timeline: { ...timeline, dueDate: dueDate || timeline.dueDate },
    dueDate: dueDate,
    progress: typeof progress === 'number' ? progress : Number(progress) || 0
  };
};

// Get active orders (for both brand and creator)
const getActiveOrders = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit, status } = req.query;

    let query = Order.find({
      $or: [
        { brandId: userId },
        { creatorId: userId }
      ]
    })
      .populate('campaignId', 'name')
      .populate('brandId', 'name email profileImage')
      .populate('creatorId', 'name email profileImage')
      .sort({ createdAt: -1 });

    if (status) {
      query = query.where({ status });
    }

    // Active = not completed, cancelled, or rejected (same for brand and creator)
    query = query.where({ status: { $nin: ['completed', 'cancelled', 'rejected'] } });

    const { data, pagination } = await applyPagination(query, page, limit);
    const normalizedOrders = (data || []).map(normalizeOrderForList);
    return successResponse(res, { orders: normalizedOrders, pagination }, 'Active orders retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Get all orders (including completed)
const getOrders = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit, status } = req.query;

    let query = Order.find({
      $or: [
        { brandId: userId },
        { creatorId: userId }
      ]
    })
      .populate('campaignId', 'name')
      .populate('brandId', 'name email profileImage')
      .populate('creatorId', 'name email profileImage')
      .sort({ createdAt: -1 });

    if (status) {
      query = query.where({ status });
    }

    const { data, pagination } = await applyPagination(query, page, limit);
    const normalizedOrders = (data || []).map(normalizeOrderForList);
    return successResponse(res, { orders: normalizedOrders, pagination }, 'Orders retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Get order by ID
const getOrderById = async (req, res) => {
  try {
    const userId = req.user._id;
    const order = await Order.findById(req.params.id)
      .populate('campaignId')
      .populate('brandId', 'name email profileImage')
      .populate('creatorId', 'name email profileImage ratings totalReviews')
      .populate('proposalId');
    
    if (!order) {
      return notFoundResponse(res, 'Order not found');
    }

    // Check authorization
    const orderBrandId = order.brandId._id ? order.brandId._id.toString() : order.brandId.toString();
    const orderCreatorId = order.creatorId._id ? order.creatorId._id.toString() : order.creatorId.toString();
    
    if (orderBrandId !== userId.toString() && orderCreatorId !== userId.toString()) {
      return forbiddenResponse(res, 'Not authorized to view this order');
    }

    return successResponse(res, order, 'Order retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Submit deliverables (creator only)
const submitDeliverables = async (req, res) => {
  try {
    const { id } = req.params;
    const creatorId = req.user._id;
    const { deliverables } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return notFoundResponse(res, 'Order not found');
    }

    if (order.creatorId.toString() !== creatorId.toString()) {
      return forbiddenResponse(res, 'Not authorized to submit deliverables for this order');
    }

    if (!deliverables || !Array.isArray(deliverables)) {
      return errorResponse(res, 'Deliverables array is required', 400);
    }

    // Add submissions
    order.deliverablesSubmissions.push(...deliverables.map(d => ({
      url: d.url,
      type: d.type,
      platform: d.platform,
      submittedAt: new Date()
    })));

    order.status = 'awaiting_approval';
    order.timeline.submittedAt = new Date();
    await order.save();

    await createNotification({
      userId: order.brandId,
      type: 'order_deliverables_submitted',
      title: 'Deliverables submitted',
      body: `Creator submitted deliverables for order "${order.title}".`,
      data: { orderId: order._id },
      actorId: creatorId,
      dedupeData: { orderId: order._id },
    });

    return successResponse(res, order, 'Deliverables submitted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Approve deliverables (brand only)
const approveDeliverables = async (req, res) => {
  try {
    const { id } = req.params;
    const brandId = req.user._id;

    const order = await Order.findById(id);
    if (!order) {
      return notFoundResponse(res, 'Order not found');
    }

    if (order.brandId.toString() !== brandId.toString()) {
      return forbiddenResponse(res, 'Not authorized to approve deliverables for this order');
    }

    if (order.status !== 'awaiting_approval') {
      return errorResponse(res, 'Order is not awaiting approval', 400);
    }

    // Check if transaction already exists to prevent duplicates
    const { hasEarningTransaction } = require('../utils/transactionHelpers');
    if (await hasEarningTransaction(order._id, order.creatorId)) {
      // Transaction already exists, just update order status
      order.deliverablesSubmissions.forEach(submission => {
        submission.approved = true;
      });
      order.status = 'completed';
      order.timeline.approvedAt = new Date();
      order.timeline.completedAt = new Date();
      order.payment.status = 'completed';
      order.payment.paidAt = new Date();
      order.creatorPaid = {
        status: 'pending'
      };
      await order.save();
      await createNotification({
        userId: order.creatorId,
        type: 'order_completed',
        title: 'Order completed',
        body: `Your deliverables for "${order.title}" were approved.`,
        data: { orderId: order._id },
        actorId: brandId,
        dedupeData: { orderId: order._id },
      });
      return successResponse(res, order, 'Deliverables approved and order completed');
    }

    // Run order completion in transaction to ensure atomicity
    // Order update + earning transaction + wallet update must all succeed or fail together
    await runInTransaction(async (session) => {
      // Reload order with session to ensure we have the latest version
      const orderWithSession = await Order.findById(order._id).session(session);
      if (!orderWithSession) {
        throw new Error('Order not found');
      }

      // Mark all submissions as approved
      orderWithSession.deliverablesSubmissions.forEach(submission => {
        submission.approved = true;
      });

      // Update order with session
      orderWithSession.timeline.approvedAt = new Date();
      orderWithSession.timeline.completedAt = new Date();
      orderWithSession.payment.status = 'completed';
      orderWithSession.payment.paidAt = new Date();
      
      if (!orderWithSession.creatorPaid || orderWithSession.creatorPaid.status !== 'completed') {
        orderWithSession.creatorPaid = {
          status: 'pending'
        };
      }

      orderWithSession.status = 'completed';
      await orderWithSession.save({ session });

      // Create earning transaction for creator (pass session to avoid nested transaction)
      const { createEarningTransaction } = require('./transactionController');
      const currency = orderWithSession.payment?.currency || 'NGN';
      await createEarningTransaction(
        orderWithSession._id,
        orderWithSession.creatorId,
        orderWithSession.brandId,
        orderWithSession.payment.amount,
        orderWithSession.title,
        currency,
        session // Pass session to use the same transaction
      );
    });

    await createNotification({
      userId: order.creatorId,
      type: 'order_completed',
      title: 'Order completed',
      body: `Your deliverables for "${order.title}" were approved. Payment will be released per terms.`,
      data: { orderId: order._id },
      actorId: brandId,
      dedupeData: { orderId: order._id },
    });

    // Reload order to get updated data
    const updatedOrder = await Order.findById(id)
      .populate('creatorId', 'name email profileImage ratings totalReviews')
      .populate('brandId', 'name email profileImage');

    // Update campaign status (outside transaction - less critical)
    const campaign = await Campaign.findById(order.campaignId);
    if (campaign) {
      const allOrders = await Order.find({ campaignId: campaign._id });
      const allCompleted = allOrders.every(o => o.status === 'completed' || o._id.toString() === order._id.toString());
      if (allCompleted) {
        campaign.status = 'completed';
        await campaign.save();
      }
    }

    return successResponse(res, updatedOrder, 'Deliverables approved and order completed');
  } catch (error) {
    console.error('Error approving deliverables:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Request revisions (brand only)
const requestRevisions = async (req, res) => {
  try {
    const { id } = req.params;
    const brandId = req.user._id;
    const { notes } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return notFoundResponse(res, 'Order not found');
    }

    if (order.brandId.toString() !== brandId.toString()) {
      return forbiddenResponse(res, 'Not authorized to request revisions for this order');
    }

    if (order.status !== 'awaiting_approval') {
      return errorResponse(res, 'Can only request revisions for submitted deliverables', 400);
    }

    if (order.revisions.requested >= order.revisions.maxAllowed) {
      return errorResponse(res, 'Maximum revision requests reached', 400);
    }

    order.revisions.requested += 1;
    order.revisions.notes.push({
      note: sanitizeString(notes || ''),
      createdAt: new Date()
    });

    // Mark submissions as needing revision
    order.deliverablesSubmissions.forEach(submission => {
      if (!submission.approved) {
        submission.revisionNotes = sanitizeString(notes || '');
      }
    });

    order.status = 'revisions';
    await order.save();

    await createNotification({
      userId: order.creatorId,
      type: 'order_revisions_requested',
      title: 'Revisions requested',
      body: `Brand requested revisions for order "${order.title}". ${notes ? 'Check the revision notes for details.' : ''}`,
      data: { orderId: order._id },
      actorId: brandId,
      dedupeData: { orderId: order._id },
    });

    return successResponse(res, order, 'Revision requested successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Update order (brand and creator can update different fields)
const updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { status, endDate, dueDate, brief, rejectionReason } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return notFoundResponse(res, 'Order not found');
    }

    // Check authorization
    const orderBrandId = order.brandId.toString();
    const orderCreatorId = order.creatorId.toString();
    const isBrand = orderBrandId === userId.toString();
    const isCreator = orderCreatorId === userId.toString();

    if (!isBrand && !isCreator) {
      return forbiddenResponse(res, 'Not authorized to update this order');
    }

    const updates = {};
    const timelineUpdates = {};

    // Status updates with validation
    if (status !== undefined) {
      const validStatuses = ['pending', 'content_creation', 'awaiting_approval', 'revisions', 'in_progress', 'completed', 'cancelled', 'rejected'];
      
      if (!validStatuses.includes(status)) {
        return errorResponse(res, 'Invalid status', 400);
      }

      if (status === order.status) {
        return errorResponse(res, 'Status is already set to this value', 400);
      }

      if (isBrand) {
        const brandAllowedTransitions = {
          'awaiting_approval': ['revisions', 'completed', 'rejected'],
          'revisions': ['awaiting_approval'],
          'content_creation': ['completed', 'cancelled'],
          'in_progress': ['completed', 'cancelled'],
          'pending': ['cancelled']
        };
        
        if (!brandAllowedTransitions[order.status] || !brandAllowedTransitions[order.status].includes(status)) {
          return errorResponse(res, `Invalid status transition from ${order.status} to ${status}`, 400);
        }

        // Handle status-specific logic
        if (status === 'completed') {
          // Run order completion in transaction to ensure atomicity
          // Order update + earning transaction + wallet update must all succeed or fail together
          try {
            await runInTransaction(async (session) => {
              // Reload order with session to ensure we have the latest version
              const orderWithSession = await Order.findById(order._id).session(session);
              if (!orderWithSession) {
                throw new Error('Order not found');
              }

              // Update order with session
              orderWithSession.timeline.approvedAt = new Date();
              orderWithSession.timeline.completedAt = new Date();
              orderWithSession.payment.status = 'completed';
              orderWithSession.payment.paidAt = new Date();
              
              // Mark all submissions as approved
              orderWithSession.deliverablesSubmissions.forEach(submission => {
                submission.approved = true;
              });

              if (!orderWithSession.creatorPaid || orderWithSession.creatorPaid.status !== 'completed') {
                orderWithSession.creatorPaid = {
                  status: 'pending'
                };
              }

              orderWithSession.status = 'completed';
              await orderWithSession.save({ session });

      // Create earning transaction for creator (pass session to avoid nested transaction)
      const { createEarningTransaction } = require('./transactionController');
      const currency = orderWithSession.payment?.currency || 'NGN';
      await createEarningTransaction(
        orderWithSession._id,
        orderWithSession.creatorId,
        orderWithSession.brandId,
        orderWithSession.payment.amount,
        orderWithSession.title,
        currency,
        session // Pass session to use the same transaction
      );

              // Update campaign status if all orders completed (outside transaction for now)
              // This is less critical and can be done separately
            });

            // Update campaign status (outside transaction - less critical)
            const campaign = await Campaign.findById(order.campaignId);
            if (campaign) {
              const allOrders = await Order.find({ campaignId: campaign._id });
              const allCompleted = allOrders.every(o => o.status === 'completed' || o._id.toString() === order._id.toString());
              if (allCompleted) {
                campaign.status = 'completed';
                await campaign.save();
              }
            }

            // Update the order object for response
            order.status = 'completed';
            order.timeline.approvedAt = new Date();
            order.timeline.completedAt = new Date();
            order.payment.status = 'completed';
            order.payment.paidAt = new Date();
          } catch (error) {
            console.error('Error completing order:', error);
            // Re-throw to let the error handler catch it
            throw error;
          }
        }
      } else if (isCreator) {
        const creatorAllowedTransitions = {
          'revisions': ['content_creation'],
          'content_creation': ['awaiting_approval'],
          'pending': ['content_creation']
        };

        if (!creatorAllowedTransitions[order.status] || !creatorAllowedTransitions[order.status].includes(status)) {
          return errorResponse(res, `Invalid status transition from ${order.status} to ${status}`, 400);
        }

        // Handle creator status updates
        if (status === 'content_creation' && order.status === 'revisions') {
          // Clear revision notes when creator starts working on revisions
          order.deliverablesSubmissions.forEach(submission => {
            if (submission.revisionNotes) {
              submission.revisionNotes = undefined;
            }
          });
        }

        if (status === 'awaiting_approval') {
          order.timeline.submittedAt = new Date();
        }
      }

      updates.status = status;
      if (status === 'rejected' && rejectionReason !== undefined) {
        updates.rejectionReason = sanitizeString(String(rejectionReason));
      }
    }

    // Update due date / end date (both can update, but creator needs brand approval for extending)
    const newDueDate = endDate || dueDate;
    if (newDueDate) {
      const parsedDate = new Date(newDueDate);
      if (isNaN(parsedDate.getTime())) {
        return errorResponse(res, 'Invalid date format', 400);
      }

      // Validate date is in the future (unless already past due)
      const now = new Date();
      if (parsedDate < now && status !== 'completed') {
        return errorResponse(res, 'Due date cannot be in the past', 400);
      }

      timelineUpdates.dueDate = parsedDate;
      updates.timeline = { ...order.timeline.toObject(), ...timelineUpdates };
    }

    // Update brief (brand only)
    if (brief !== undefined) {
      if (!isBrand) {
        return forbiddenResponse(res, 'Only brand can update brief', 403);
      }
      if (typeof brief !== 'string' || brief.length > 2000) {
        return errorResponse(res, 'Brief must be a string and cannot exceed 2000 characters', 400);
      }
      updates.brief = sanitizeString(brief);
    }

    // Apply updates
    Object.keys(updates).forEach(key => {
      if (key === 'timeline') {
        order.timeline = { ...order.timeline, ...updates.timeline };
      } else {
        order[key] = updates[key];
      }
    });

    await order.save();

    // Notifications for status changes (run in parallel so all status updates notify the other party)
    const statusChangeNotifications = [];
    if (status !== undefined) {
      if (status === 'rejected') {
        statusChangeNotifications.push(
          createNotification({
            userId: order.creatorId,
            type: 'order_rejected',
            title: 'Order rejected',
            body: `Brand rejected deliverables for order "${order.title}".${order.rejectionReason ? ` Reason: ${order.rejectionReason}` : ''}`,
            data: { orderId: order._id },
            actorId: req.user._id,
            dedupeData: { orderId: order._id },
          })
        );
      } else if (status === 'cancelled') {
        const recipientId = isBrand ? order.creatorId : order.brandId;
        statusChangeNotifications.push(
          createNotification({
            userId: recipientId,
            type: 'order_cancelled',
            title: 'Order cancelled',
            body: `Order "${order.title}" was cancelled.`,
            data: { orderId: order._id },
            actorId: req.user._id,
            dedupeData: { orderId: order._id },
          })
        );
      } else if (status === 'completed') {
        statusChangeNotifications.push(
          createNotification({
            userId: order.creatorId,
            type: 'order_completed',
            title: 'Order completed',
            body: `Order "${order.title}" was marked completed.`,
            data: { orderId: order._id },
            actorId: req.user._id,
            dedupeData: { orderId: order._id },
          })
        );
      }
    }
    await Promise.all(statusChangeNotifications);

    const updatedOrder = await Order.findById(id)
      .populate('campaignId', 'name')
      .populate('brandId', 'name email profileImage')
      .populate('creatorId', 'name email profileImage ratings totalReviews')
      .populate('proposalId');

    return successResponse(res, updatedOrder, 'Order updated successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

module.exports = {
  getActiveOrders,
  getOrders,
  getOrderById,
  submitDeliverables,
  approveDeliverables,
  requestRevisions,
  updateOrder
};

