/**
 * Bright Data clients for social scraping.
 *
 * - getProxyAxios(): Super Proxy (Instagram, Facebook; Twitter when dataset not used).
 * - fetchTikTokProfileFromDatasets(): Datasets API for TikTok profiles.
 * - fetchTwitterProfileFromDatasets(): Datasets API for X/Twitter profiles.
 */
const fs = require('fs');
const axios = require('axios');
const { getBrightDataConfig, getBrightDataDatasetsConfig } = require('../config/brightdata');

const DATASETS_SCRAPE_URL = 'https://api.brightdata.com/datasets/v3/scrape';

/**
 * HttpsProxyAgent that applies rejectUnauthorized: false to both the proxy connection
 * and the tunneled TLS connection to the target (Bright Data requirement).
 */
class BrightDataProxyAgent extends require('https-proxy-agent').HttpsProxyAgent {
  async connect(req, opts) {
    return super.connect(req, { ...opts, rejectUnauthorized: false });
  }
}

/**
 * Returns an Axios instance configured for Bright Data Super Proxy.
 * Used for Instagram, Facebook, and Twitter profile scraping.
 */
function getProxyAxios() {
  const config = getBrightDataConfig();
  if (!config?.isConfigured) return null;

  const baseOptions = {
    timeout: 60000,
    validateStatus: () => true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  };

  if (config.useHttps && config.certPath) {
    const ca = config.mergedCa || fs.readFileSync(config.certPath, 'utf8');
    const agent = new BrightDataProxyAgent(config.proxyUrl, { ca, rejectUnauthorized: false });
    return axios.create({
      ...baseOptions,
      proxy: false,
      httpsAgent: agent,
      httpAgent: agent,
    });
  }

  return axios.create({
    ...baseOptions,
    proxy: {
      protocol: 'http',
      host: config.host,
      port: config.port,
      auth: { username: config.username, password: config.password },
    },
  });
}

/**
 * Fetches a TikTok profile via Bright Data Web Scrapers Library (TikTok - Profiles - Collect by URL).
 * Returns follower count, display username, and engagement rate when available.
 *
 * Note: Bright Data's average response time per input is ~25s (they load the page in a browser).
 * We cannot reduce that from our side. Timeout is set so we fail gracefully if it takes longer.
 *
 * @param {string} profileUrl - e.g. https://www.tiktok.com/@username
 * @returns {Promise<{ status: number, followers: number|null, username: string|null, engagement_rate: number|null }>}
 */
async function fetchTikTokProfileFromDatasets(profileUrl) {
  const config = getBrightDataDatasetsConfig();
  if (!config?.isConfigured || !config.tiktokDatasetId) {
    throw new Error('Bright Data Datasets not configured. Set BRIGHTDATA_TIKTOK_DATASET_ID and BRIGHTDATA_DATASETS_API_KEY.');
  }

  const timeoutMs = Number(process.env.BRIGHTDATA_TIKTOK_TIMEOUT_MS) || 45000;

  const url = `${DATASETS_SCRAPE_URL}?dataset_id=${encodeURIComponent(config.tiktokDatasetId)}&notify=false&include_errors=true`;
  const response = await axios.post(
    url,
    { input: [{ url: profileUrl, country: 'US' }] },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      timeout: timeoutMs,
      validateStatus: () => true,
    }
  );

  const out = { status: response.status, followers: null, username: null, engagement_rate: null };
  if (response.status !== 200) return out;

  const data = response.data;
  const records = Array.isArray(data)
    ? data
    : data?.data ?? data?.results ?? data?.records ?? [];
  const first = Array.isArray(records) && records.length > 0 ? records[0] : (data && typeof data === 'object' && !Array.isArray(data) ? data : null);

  if (!first || typeof first !== 'object') return out;

  // Followers
  const n = first.followers ?? first.follower_count ?? first.fans ?? first.followerCount ?? first.followers_count;
  if (typeof n === 'number' && n >= 0) {
    out.followers = n;
  } else if (typeof n === 'string') {
    const parsed = parseInt(n.replace(/\D/g, ''), 10);
    if (!isNaN(parsed) && parsed >= 0) out.followers = parsed;
  }

  // Username: prefer account_id (handle) then nickname
  const u = first.account_id ?? first.nickname ?? first.username ?? first.unique_id ?? first.uniqueId ?? first.id;
  if (typeof u === 'string' && u) out.username = u.replace(/^@/, '');

  // Engagement rate (decimal 0–1)
  const er = first.awg_engagement_rate ?? first.engagement_rate ?? first.like_engagement_rate;
  if (typeof er === 'number' && er >= 0 && er <= 1) out.engagement_rate = er;

  return out;
}

/**
 * Fetches an X/Twitter profile via Bright Data Web Scrapers Library (Twitter - Profiles).
 * Returns follower count and username. Same sync scrape endpoint as TikTok.
 *
 * @param {string} profileUrl - e.g. https://twitter.com/username or https://x.com/username
 * @returns {Promise<{ status: number, followers: number|null, username: string|null }>}
 */
async function fetchTwitterProfileFromDatasets(profileUrl) {
  const config = getBrightDataDatasetsConfig();
  if (!config?.isConfigured || !config.twitterDatasetId) {
    throw new Error('Bright Data Twitter dataset not configured. Set BRIGHTDATA_TWITTER_DATASET_ID and BRIGHTDATA_DATASETS_API_KEY.');
  }

  const timeoutMs = Number(process.env.BRIGHTDATA_TWITTER_TIMEOUT_MS) || 45000;

  const url = `${DATASETS_SCRAPE_URL}?dataset_id=${encodeURIComponent(config.twitterDatasetId)}&notify=false&include_errors=true`;
  const response = await axios.post(
    url,
    { input: [{ url: profileUrl }] },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      timeout: timeoutMs,
      validateStatus: () => true,
    }
  );

  const out = { status: response.status, followers: null, username: null };
  if (response.status !== 200) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('Twitter Datasets non-200:', { status: response.status, dataKeys: response.data && typeof response.data === 'object' ? Object.keys(response.data) : [] });
    }
    return out;
  }

  const data = response.data;
  // Unwrap: API can return array, or { data: [] }, { results: [] }, { records: [] }, or single object
  let records = Array.isArray(data)
    ? data
    : data?.data ?? data?.results ?? data?.records ?? (data && typeof data === 'object' && !Array.isArray(data) ? [data] : []);
  if (!Array.isArray(records)) records = [];

  // First record might be nested (e.g. { record: { followers: 123 } })
  let first = records[0];
  if (first && typeof first === 'object' && (first.record ?? first.result ?? first.data)) {
    first = first.record ?? first.result ?? first.data;
  }
  if (!first || typeof first !== 'object') {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('Twitter Datasets 200 but no record:', { recordsLength: records.length, dataKeys: typeof data === 'object' ? Object.keys(data) : [] });
    }
    return out;
  }

  // Extract followers from various possible field names (including nested public_metrics)
  let n = first.followers ?? first.followers_count ?? first.follower_count ?? first.public_metrics?.followers_count;
  if (n == null && typeof first === 'object') {
    const findNum = (obj, depth) => {
      if (depth > 5) return null;
      if (!obj || typeof obj !== 'object') return null;
      const v = obj.followers ?? obj.followers_count ?? obj.follower_count ?? obj.public_metrics?.followers_count;
      if (typeof v === 'number' && v >= 0) return v;
      if (typeof v === 'string') {
        const p = parseInt(v.replace(/\D/g, ''), 10);
        if (!isNaN(p) && p >= 0) return p;
      }
      for (const key of Object.keys(obj)) {
        const found = findNum(obj[key], depth + 1);
        if (found != null) return found;
      }
      return null;
    };
    n = findNum(first, 0);
  }
  if (typeof n === 'number' && n >= 0) {
    out.followers = n;
  } else if (typeof n === 'string') {
    const parsed = parseInt(n.replace(/\D/g, ''), 10);
    if (!isNaN(parsed) && parsed >= 0) out.followers = parsed;
  }

  const u = first.username ?? first.screen_name ?? first.profile_name ?? first.name ?? first.id;
  if (typeof u === 'string' && u) out.username = u.replace(/^@/, '');

  return out;
}

module.exports = {
  getProxyAxios,
  getBrightDataConfig,
  getBrightDataDatasetsConfig,
  fetchTikTokProfileFromDatasets,
  fetchTwitterProfileFromDatasets,
};
