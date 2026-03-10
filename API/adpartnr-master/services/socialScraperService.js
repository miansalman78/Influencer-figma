/**
 * Social profile follower scraping.
 *
 * - Instagram, Facebook: Bright Data Super Proxy + HTML parsing.
 * - TikTok, Twitter: Bright Data Datasets API (Web Scrapers Library). X doesn't embed follower count in initial HTML.
 */
const cheerio = require('cheerio');
const {
  getProxyAxios,
  getBrightDataDatasetsConfig,
  fetchTikTokProfileFromDatasets,
  fetchTwitterProfileFromDatasets,
} = require('../utils/brightDataProxy');

const PLATFORMS = ['instagram', 'facebook', 'tiktok', 'twitter'];

function buildProfileUrl(platform, usernameOrUrl) {
  const v = (usernameOrUrl || '').trim();
  if (!v) return null;

  if (platform === 'facebook') {
    if (/facebook\.com/i.test(v)) return v;
    return `https://www.facebook.com/${v.replace(/^@/, '')}`;
  }
  if (platform === 'instagram') {
    if (/instagram\.com/i.test(v)) return v;
    return `https://www.instagram.com/${v.replace(/^@/, '')}/`;
  }
  if (platform === 'tiktok') {
    if (/tiktok\.com/i.test(v)) return v;
    const h = v.replace(/^@/, '');
    return `https://www.tiktok.com/@${h}`;
  }
  if (platform === 'twitter') {
    if (/twitter\.com|x\.com/i.test(v)) return v;
    return `https://twitter.com/${v.replace(/^@/, '')}`;
  }
  return null;
}

function parseCountString(s) {
  if (!s) return null;
  const t = String(s).trim().toUpperCase().replace(/[, ]/g, '');
  const m = t.match(/^(\d+(?:\.\d+)?)([KMB])?$/);
  if (!m) {
    const n = parseInt(t.replace(/\D/g, ''), 10);
    return isNaN(n) ? null : n;
  }
  const num = parseFloat(m[1]);
  const suf = m[2];
  if (!suf) return Math.round(num);
  if (suf === 'K') return Math.round(num * 1000);
  if (suf === 'M') return Math.round(num * 1000000);
  if (suf === 'B') return Math.round(num * 1000000000);
  return Math.round(num);
}

function parseFollowersFromHtml(platform, html) {
  if (!html || typeof html !== 'string') return null;
  const $ = cheerio.load(html, { decodeEntities: true });

  const metaDesc = $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') || '';

  if (metaDesc) {
    const instagramStyle = metaDesc.match(/^([\d,.\s]+[KMBkmb]?)\s*[-–—]\s*[\d,.\s]+[KMBkmb]?\s+Posts?\s+by/i);
    if (instagramStyle) {
      const n = parseCountString(instagramStyle[1]) || parseInt(instagramStyle[1].replace(/\D/g, ''), 10);
      if (n > 0) return n;
    }

    if (platform === 'facebook') {
      const fbFollowers = metaDesc.match(/([\d,.\s]+[KMBkmb]?)\s*followers?/i);
      if (fbFollowers) {
        const n = parseCountString(fbFollowers[1]) || parseInt(fbFollowers[1].replace(/\D/g, ''), 10);
        if (n > 0) return n;
      }
      const fbLikes = metaDesc.match(/([\d,.\s]+[KMBkmb]?)\s*(?:likes?|people\s+follow|people\s+like)/i);
      if (fbLikes) {
        const n = parseCountString(fbLikes[1]) || parseInt(fbLikes[1].replace(/\D/g, ''), 10);
        if (n > 0) return n;
      }
    }

    const followerMatch = metaDesc.match(/([\d,.\s]+[KMBkmb]?)\s*(?:followers?|subscribers?|likes?|fans?)/i) ||
      metaDesc.match(/([\d,.\s]+)\s*(?:K|M|B)\s*(?:followers?|subscribers?)/i);
    if (followerMatch) {
      const n = parseCountString(followerMatch[1]) || parseInt(followerMatch[1].replace(/\D/g, ''), 10);
      if (n > 0) return n;
    }
  }

  const jsonPatterns = [
    /"edge_followed_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/,
    /"follower_count"\s*:\s*(\d+)/,
    /"followers_count"\s*:\s*(\d+)/,
    /"followers"\s*:\s*\{\s*"count"\s*:\s*(\d+)/,
    /"followers"\s*:\s*(\d+)(?:\s*[,}])/,
    /"count"\s*:\s*(\d+)\s*[}\]]\s*[,\s]*"[^"]*follow/,
  ];
  if (platform === 'facebook') {
    jsonPatterns.push(/"fan_count"\s*:\s*(\d+)/);
    jsonPatterns.push(/"engagement"\s*:\s*\{\s*"count"\s*:\s*(\d+)/);
    jsonPatterns.push(/"likes"\s*:\s*(\d+)(?:\s*[,}])/);
  }
  for (const re of jsonPatterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const n = parseInt(m[1], 10);
      if (n >= 0) return n;
    }
  }

  let jsonLdCount = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '{}');
      const inter = Array.isArray(data) ? data[0] : data;
      if (inter?.interactionStatistic) {
        const stats = Array.isArray(inter.interactionStatistic) ? inter.interactionStatistic : [inter.interactionStatistic];
        const stat = stats.find(s =>
          (s.interactionType?.includes('Follow')) || (s.name && /follower|follow/i.test(s.name))
        ) || stats.find(s =>
          (s.interactionType?.includes('Subscribe')) || (s.name && /subscriber|subscribe/i.test(s.name))
        );
        const val = stat?.userInteractionCount ?? stat?.interactionCount ?? null;
        if (typeof val === 'number') {
          jsonLdCount = val;
        } else if (typeof val === 'string') {
          const parsed = parseInt(val.replace(/\D/g, ''), 10);
          if (!isNaN(parsed)) jsonLdCount = parsed;
        }
      }
    } catch (_) { /* ignore */ }
  });
  if (typeof jsonLdCount === 'number' && jsonLdCount >= 0) return jsonLdCount;

  return null;
}

async function scrapeFollowerCount(platform, usernameOrUrl) {
  if (!PLATFORMS.includes(platform)) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const url = buildProfileUrl(platform, usernameOrUrl);
  if (!url) throw new Error('Invalid username or URL');

  let username = (usernameOrUrl || '').trim().replace(/^@/, '');
  if (platform === 'facebook' && (usernameOrUrl || '').includes('facebook.com')) {
    const fromUrl = url.split('/').filter(Boolean).pop();
    if (fromUrl && !fromUrl.includes('?')) username = fromUrl.replace('@', '');
  } else {
    const fromUrl = url.split('/').filter(Boolean).pop();
    if (fromUrl && !fromUrl.includes('?')) username = fromUrl.replace('@', '');
  }

  if (platform === 'tiktok') {
    const datasetsConfig = getBrightDataDatasetsConfig();
    if (!datasetsConfig?.isConfigured || !datasetsConfig.tiktokDatasetId) {
      return { username, followers: null, fetch_blocked: true };
    }
    try {
      const result = await fetchTikTokProfileFromDatasets(url);
      if (result.status === 200) {
        return {
          username: result.username || username,
          followers: result.followers,
          engagement_rate: result.engagement_rate ?? undefined,
        };
      }
      if (result.status === 202) return { username, followers: null };
      if (result.status >= 400) {
        return { username, followers: null, fetch_blocked: result.status === 403 };
      }
    } catch (err) {
      console.warn('TikTok Datasets request failed:', err.message);
      return { username, followers: null, fetch_blocked: true };
    }
    return { username, followers: null };
  }

  if (platform === 'twitter') {
    const datasetsConfig = getBrightDataDatasetsConfig();
    if (datasetsConfig?.isConfigured && datasetsConfig.twitterDatasetId) {
      try {
        const result = await fetchTwitterProfileFromDatasets(url);
        if (result.status === 200) {
          return {
            username: username,
            followers: result.followers,
          };
        }
        if (result.status === 202) return { username, followers: null };
        if (result.status >= 400) {
          return { username, followers: null, fetch_blocked: result.status === 403 };
        }
      } catch (err) {
        console.warn('Twitter Datasets request failed:', err.message);
        return { username, followers: null, fetch_blocked: true };
      }
      return { username, followers: null };
    }
  }

  const proxyAxios = getProxyAxios();
  if (!proxyAxios) {
    throw new Error('Bright Data proxy is not configured. Set BRIGHTDATA_CUSTOMER, BRIGHTDATA_ZONE, BRIGHTDATA_PASSWORD.');
  }

  const requestOptions = {};
  if (platform === 'instagram' || platform === 'facebook') {
    requestOptions.headers = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };
  }

  const response = await proxyAxios.get(url, requestOptions);

  if (response.status !== 200) {
    const snippet = typeof response.data === 'string'
      ? response.data.slice(0, 200)
      : (response.data && JSON.stringify(response.data).slice(0, 200));
    console.warn('Scrape non-200:', { platform, url, status: response.status, body: snippet });
    return { username, followers: null, fetch_blocked: response.status === 403 };
  }

  const html = typeof response.data === 'string' ? response.data : '';
  const followers = parseFollowersFromHtml(platform, html);

  if (followers == null && process.env.NODE_ENV !== 'test') {
    const metaDesc = (html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i) || [])[1] ||
      (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || [])[1];
    console.warn('Scrape 200 but no follower count parsed:', {
      platform,
      url,
      hasOgDescription: !!metaDesc,
      ogSnippet: metaDesc?.slice(0, 120) ?? null,
      htmlLength: html.length,
    });
  }

  return { username, followers };
}

module.exports = { scrapeFollowerCount, buildProfileUrl, PLATFORMS };
