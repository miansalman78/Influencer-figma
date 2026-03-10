const { successResponse, errorResponse } = require('../utils/response');
const { scrapeFollowerCount, PLATFORMS } = require('../services/socialScraperService');

/**
 * POST /api/onboarding/scrape-followers
 * Body: { platform: 'instagram'|'facebook'|'tiktok'|'twitter', usernameOrUrl: string }
 * Returns: { success, data: { username, followers_count, verified, fetch_blocked?, engagement_rate? } }
 * engagement_rate: decimal 0–1 when from TikTok Datasets (e.g. 0.0256 = 2.56%). Show as (engagement_rate * 100).toFixed(2) + '%'.
 * When fetch_blocked is true (e.g. TikTok 403), frontend can show: "Couldn't fetch; add username and verify from profile."
 */
const scrapeFollowers = async (req, res) => {
  try {
    const { platform, usernameOrUrl } = req.body;

    if (!platform || !usernameOrUrl || typeof usernameOrUrl !== 'string') {
      return errorResponse(res, 'platform and usernameOrUrl are required', 400);
    }

    const normalizedPlatform = platform.toLowerCase().trim();
    if (!PLATFORMS.includes(normalizedPlatform)) {
      return errorResponse(res, `platform must be one of: ${PLATFORMS.join(', ')}`, 400);
    }

    const result = await scrapeFollowerCount(normalizedPlatform, usernameOrUrl);
    const data = {
      username: result.username,
      followers_count: result.followers != null ? result.followers : null,
      verified: false
    };
    if (result.fetch_blocked) data.fetch_blocked = true;
    if (result.engagement_rate != null) data.engagement_rate = result.engagement_rate;
    return successResponse(res, data, 'Follower count retrieved');
  } catch (err) {
    const message = err.message || 'Failed to fetch follower count';
    return errorResponse(res, message, 400);
  }
};

module.exports = { scrapeFollowers };
