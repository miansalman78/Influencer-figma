const Connection = require('../models/Connection');
const User = require('../models/User');
const { successResponse, errorResponse, createdResponse } = require('../utils/response');
const { createNotification } = require('../utils/notificationHelpers');
const mongoose = require('mongoose');

/**
 * Brand sends a connect request to a creator.
 * Creates connection, notifies creator "You are connected with [Brand]", returns conversationId for app to open chat.
 * Body: { creatorId, message? }
 */
const sendConnect = async (req, res) => {
  try {
    const brandId = req.user._id;
    const { creatorId: rawCreatorId, message } = req.body || {};

    if (!rawCreatorId) {
      return errorResponse(res, 'creatorId is required', 400);
    }

    const creatorId = mongoose.Types.ObjectId.isValid(rawCreatorId)
      ? new mongoose.Types.ObjectId(rawCreatorId)
      : null;
    if (!creatorId) {
      return errorResponse(res, 'Invalid creatorId', 400);
    }

    const creator = await User.findById(creatorId).select('name role');
    if (!creator) {
      return errorResponse(res, 'Creator not found', 404);
    }

    const role = (creator.role || '').toLowerCase();
    if (role !== 'creator' && role !== 'influencer') {
      return errorResponse(res, 'User is not a creator', 400);
    }

    const brand = await User.findById(brandId).select('name companyName');
    const brandName = brand?.companyName || brand?.name || 'A brand';

    let connection = await Connection.findOne({ brandId, creatorId });
    if (connection) {
      return successResponse(res, {
        connection,
        alreadyConnected: true,
        message: 'Already connected',
      }, 'Already connected');
    }

    connection = await Connection.create({
      brandId,
      creatorId,
      status: 'connected',
      initialMessage: message ? String(message).trim().slice(0, 1000) : undefined,
    });

    await createNotification({
      userId: creatorId,
      type: 'brand_connected',
      title: 'You are connected',
      body: message
        ? `${brandName} connected with you: "${String(message).slice(0, 100)}${String(message).length > 100 ? '...' : ''}"`
        : `${brandName} connected with you. Start a conversation in Messages.`,
      data: { brandId: brandId.toString(), connectionId: connection._id.toString() },
      actorId: brandId,
      dedupeData: { connectionId: connection._id },
    });

    return createdResponse(res, {
      connection: {
        _id: connection._id,
        brandId: connection.brandId,
        creatorId: connection.creatorId,
        status: connection.status,
        initialMessage: connection.initialMessage,
      },
      brandName,
      creatorName: creator.name,
    }, 'Connected successfully');
  } catch (error) {
    if (error.code === 11000) {
      return successResponse(res, { alreadyConnected: true }, 'Already connected');
    }
    return errorResponse(res, error.message || 'Failed to connect', 500);
  }
};

/**
 * List connections for current user (brand: creators I'm connected to; creator: brands connected to me).
 */
const listConnections = async (req, res) => {
  try {
    const userId = req.user._id;
    const role = (req.user.role || '').toLowerCase();
    const isBrand = role === 'brand';

    const query = isBrand ? { brandId: userId } : { creatorId: userId };
    const connections = await Connection.find(query)
      .populate(isBrand ? 'creatorId' : 'brandId', 'name email profileImage companyName')
      .sort({ createdAt: -1 })
      .lean();

    return successResponse(res, { connections }, 'Connections retrieved');
  } catch (error) {
    return errorResponse(res, error.message || 'Failed to list connections', 500);
  }
};

/**
 * Get creator IDs connected to a brand (for notifying on new campaign/offer).
 */
const getConnectedCreatorIds = async (brandId) => {
  const docs = await Connection.find({ brandId, status: 'connected' }).select('creatorId').lean();
  return docs.map((d) => d.creatorId);
};

/**
 * Get brand IDs connected to a creator (for notifying on new public offer).
 */
const getConnectedBrandIds = async (creatorId) => {
  const docs = await Connection.find({ creatorId, status: 'connected' }).select('brandId').lean();
  return docs.map((d) => d.brandId);
};

/**
 * Check if current user is connected with another user (brand checks with creatorId, creator with brandId).
 * Query: ?userId=<other user id>
 */
const checkConnection = async (req, res) => {
  try {
    const userId = req.user._id;
    const otherUserId = req.query.userId;
    if (!otherUserId) {
      return errorResponse(res, 'userId query is required', 400);
    }
    const otherId = mongoose.Types.ObjectId.isValid(otherUserId) ? new mongoose.Types.ObjectId(otherUserId) : null;
    if (!otherId) {
      return errorResponse(res, 'Invalid userId', 400);
    }
    const role = (req.user.role || '').toLowerCase();
    const isBrand = role === 'brand';
    const query = isBrand
      ? { brandId: userId, creatorId: otherId, status: 'connected' }
      : { brandId: otherId, creatorId: userId, status: 'connected' };
    const connection = await Connection.findOne(query).select('_id').lean();
    return successResponse(res, {
      connected: !!connection,
      connectionId: connection?._id?.toString(),
    }, 'OK');
  } catch (error) {
    return errorResponse(res, error.message || 'Failed to check connection', 500);
  }
};

/**
 * Disconnect: remove connection. Current user must be either the brand or the creator.
 * Body: { connectionId } or { creatorId } (brand disconnecting from creator) or { brandId } (creator disconnecting from brand).
 */
const disconnect = async (req, res) => {
  try {
    const userId = req.user._id;
    const { connectionId, creatorId: rawCreatorId, brandId: rawBrandId } = req.body || {};

    let connection;
    if (connectionId && mongoose.Types.ObjectId.isValid(connectionId)) {
      connection = await Connection.findById(connectionId);
    } else if (rawCreatorId && mongoose.Types.ObjectId.isValid(rawCreatorId)) {
      connection = await Connection.findOne({ brandId: userId, creatorId: rawCreatorId });
    } else if (rawBrandId && mongoose.Types.ObjectId.isValid(rawBrandId)) {
      connection = await Connection.findOne({ creatorId: userId, brandId: rawBrandId });
    }

    if (!connection) {
      return errorResponse(res, 'Connection not found or you are not part of it', 404);
    }

    const isPartOf = connection.brandId.toString() === userId.toString() || connection.creatorId.toString() === userId.toString();
    if (!isPartOf) {
      return errorResponse(res, 'Not authorized to remove this connection', 403);
    }

    await Connection.findByIdAndDelete(connection._id);
    return successResponse(res, { disconnected: true }, 'Disconnected successfully');
  } catch (error) {
    return errorResponse(res, error.message || 'Failed to disconnect', 500);
  }
};

module.exports = {
  sendConnect,
  listConnections,
  getConnectedCreatorIds,
  getConnectedBrandIds,
  checkConnection,
  disconnect,
};
