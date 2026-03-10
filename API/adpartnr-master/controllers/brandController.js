const User = require('../models/User');
const { successResponse, errorResponse, notFoundResponse } = require('../utils/response');
const { applyPagination } = require('../utils/pagination');

// Get all brands
const getBrands = async (req, res) => {
    try {
        const { page, limit, q, industry, country } = req.query;

        // Base query for brands (exclude explicitly deactivated)
        const query = { role: 'brand', $or: [{ isActive: true }, { isActive: { $exists: false } }] };

        // Search by name or company name
        if (q) {
            const regex = new RegExp(q, 'i');
            query.$or = [
                { name: regex },
                { companyName: regex },
                { brandTagline: regex }
            ];
        }

        // Filter by industry
        if (industry) {
            query.industry = new RegExp(industry, 'i');
        }

        // Filter by location (country)
        if (country) {
            query['location.country'] = new RegExp(country, 'i');
        }

        // Select fields to return
        const selectFields = 'name email profileImage ratings totalReviews companyName brandTagline industry website location createdAt';

        const dbQuery = User.find(query).select(selectFields).sort({ createdAt: -1 });

        const { data, pagination } = await applyPagination(dbQuery, page, limit);

        return successResponse(res, { brands: data, pagination }, 'Brands retrieved successfully');
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
};

// Get brand by ID
const getBrandById = async (req, res) => {
    try {
        const brandId = req.params.id;

        const brand = await User.findOne({ _id: brandId, role: 'brand' })
            .select('-password -__v -passwordResetToken -passwordResetExpires -oauthProvider -googleId -appleId');

        if (!brand) {
            return notFoundResponse(res, 'Brand not found');
        }

        return successResponse(res, brand, 'Brand details retrieved successfully');
    } catch (error) {
        return errorResponse(res, error.message, 500);
    }
};

module.exports = {
    getBrands,
    getBrandById
};
