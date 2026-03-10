// Calculate pagination parameters
const getPaginationParams = (page = 1, limit = 10) => {
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 10;
  
  // Ensure limits
  const maxLimit = 100;
  const finalLimit = Math.min(limitNum, maxLimit);
  const finalPage = Math.max(pageNum, 1);
  
  const skip = (finalPage - 1) * finalLimit;
  
  return {
    page: finalPage,
    limit: finalLimit,
    skip
  };
};

// Create pagination metadata
const createPaginationMeta = (page, limit, total, data) => {
  // Ensure all values are numbers and valid
  const safePage = typeof page === 'number' && !isNaN(page) ? page : 1;
  const safeLimit = typeof limit === 'number' && !isNaN(limit) && limit > 0 ? limit : 10;
  const safeTotal = typeof total === 'number' && !isNaN(total) ? total : 0;
  const safeData = Array.isArray(data) ? data : [];

  // Calculate total pages (avoid division by zero)
  const totalPages = safeLimit > 0 ? Math.ceil(safeTotal / safeLimit) : 0;
  const hasNextPage = safePage < totalPages;
  const hasPrevPage = safePage > 1;
  
  return {
    currentPage: safePage,
    totalPages,
    totalItems: safeTotal,
    itemsPerPage: safeLimit,
    hasNextPage,
    hasPrevPage,
    nextPage: hasNextPage ? safePage + 1 : null,
    prevPage: hasPrevPage ? safePage - 1 : null,
    totalResults: safeData.length
  };
};

// Apply pagination to query
const applyPagination = async (query, page = 1, limit = 10) => {
  const { skip, limit: finalLimit } = getPaginationParams(page, limit);
  
  try {
    // Clone the query for counting - need to get query conditions first
    const queryConditions = query.getQuery();
    
    // Get the model - try multiple ways to access it
    let Model = null;
    if (query.model) {
      Model = query.model;
    } else if (query.constructor && query.constructor.model) {
      Model = query.constructor.model;
    } else {
      // Try to get from the query's constructor
      const Query = query.constructor;
      if (Query && Query.model) {
        Model = Query.model;
      }
    }
    
    if (!Model) {
      // Last resort: execute query and estimate from results
      const data = await query.clone().skip(skip).limit(finalLimit).exec();
      const total = data ? data.length : 0;
      
      const pagination = createPaginationMeta(page, finalLimit, total, data || []);
      return { data: data || [], pagination };
    }
    
    // Create separate count query - clone the original query first
    // Use the model directly with the same conditions
    const countQuery = Model.find(queryConditions);
    
    // Execute both queries in parallel
    const results = await Promise.all([
      query.clone().skip(skip).limit(finalLimit).exec(),
      countQuery.countDocuments().exec()
    ]);
    
    const data = results[0] || [];
    const total = results[1] || 0;
    
    // Ensure data is an array
    const safeData = Array.isArray(data) ? data : [];
    
    const pagination = createPaginationMeta(page, finalLimit, total, safeData);
    
    return { data: safeData, pagination };
  } catch (error) {
    // Final fallback: try to execute the query without counting
    try {
      const data = await query.clone().skip(skip).limit(finalLimit).exec();
      const safeData = Array.isArray(data) ? data : [];
      const total = safeData.length;
      
      const pagination = createPaginationMeta(page, finalLimit, total, safeData);
      return { data: safeData, pagination };
    } catch (fallbackError) {
      // If even the fallback fails, return empty results
      const pagination = createPaginationMeta(page, finalLimit, 0, []);
      return { data: [], pagination };
    }
  }
};

// Create pagination links
const createPaginationLinks = (req, pagination) => {
  const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`;
  const query = { ...req.query };
  
  const links = {};
  
  if (pagination.hasPrevPage) {
    query.page = pagination.prevPage;
    links.prev = `${baseUrl}?${new URLSearchParams(query).toString()}`;
  }
  
  if (pagination.hasNextPage) {
    query.page = pagination.nextPage;
    links.next = `${baseUrl}?${new URLSearchParams(query).toString()}`;
  }
  
  return links;
};

// Validate pagination parameters
const validatePagination = (page, limit) => {
  const errors = [];
  
  if (page && (isNaN(page) || page < 1)) {
    errors.push('Page must be a positive integer');
  }
  
  if (limit && (isNaN(limit) || limit < 1 || limit > 100)) {
    errors.push('Limit must be between 1 and 100');
  }
  
  return errors;
};

module.exports = {
  getPaginationParams,
  createPaginationMeta,
  applyPagination,
  createPaginationLinks,
  validatePagination
};
