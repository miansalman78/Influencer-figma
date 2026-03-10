const { categories, categoryLabels } = require('../utils/categories');
const { successResponse, errorResponse } = require('../utils/response');

const getCategories = async (req, res) => {
  try {
    const data = categories.map((value) => ({
      value,
      label: categoryLabels[value] || value
    }));

    return successResponse(res, { categories: data }, 'Categories retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

module.exports = { getCategories };