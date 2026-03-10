const express = require('express');
const router = express.Router();
const { authenticate, authorizeBrand, authorizeCreator } = require('../middleware/auth');
const Notification = require('../models/Notification');
const { successResponse, errorResponse } = require('../utils/response');

// Creator recent activities (for dashboard "Recent Activity" section)
router.get('/creator/activities', authenticate, authorizeCreator, async (req, res) => {
  try {
    const userId = req.user._id;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 20);
    const activities = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return successResponse(res, { activities }, 'Recent activities retrieved');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Brand dashboard
router.get('/brand', authenticate, authorizeBrand, (req, res) => {
  try {
    const userId = req.user._id;
    
    // This would fetch brand-specific dashboard data
    const dashboardData = {
      totalCampaigns: 0,
      activeCampaigns: 0,
      totalSpent: 0,
      totalApplicants: 0,
      recentCampaigns: [],
      analytics: {
        views: 0,
        applications: 0,
        hires: 0
      }
    };
    
    res.json({
      success: true,
      message: 'Brand dashboard data retrieved successfully',
      data: dashboardData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch brand dashboard data',
      error: error.message
    });
  }
});

// Creator dashboard
router.get('/creator', authenticate, authorizeCreator, (req, res) => {
  try {
    const userId = req.user._id;
    
    // This would fetch creator-specific dashboard data
    const dashboardData = {
      totalOffers: 0,
      activeOffers: 0,
      totalEarnings: 0,
      totalOrders: 0,
      recentOffers: [],
      analytics: {
        views: 0,
        orders: 0,
        rating: 0
      }
    };
    
    res.json({
      success: true,
      message: 'Creator dashboard data retrieved successfully',
      data: dashboardData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch creator dashboard data',
      error: error.message
    });
  }
});

module.exports = router;
