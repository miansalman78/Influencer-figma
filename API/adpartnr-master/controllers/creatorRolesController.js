const { successResponse } = require('../utils/response');
const { predefinedRoles } = require('../utils/creatorRoles');

// Get all creator roles
const getCreatorRoles = async (req, res) => {
  try {
    return successResponse(res, {
      roles: predefinedRoles
    }, 'Creator roles retrieved successfully');
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  getCreatorRoles
};

