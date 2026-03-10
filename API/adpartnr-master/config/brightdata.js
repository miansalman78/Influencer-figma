/**
 * Bright Data configuration for social scraping.
 *
 * - Super Proxy (Instagram, Facebook, Twitter): brd.superproxy.io:33335
 *   Auth: brd-customer-{CUSTOMER}-zone-{ZONE}:{PASSWORD}
 *   Set BRIGHTDATA_CERT_PATH for HTTPS on port 33335.
 *
 * - Datasets API (TikTok): Web Scrapers Library, synchronous scrape
 *   Set BRIGHTDATA_DATASETS_API_KEY and BRIGHTDATA_TIKTOK_DATASET_ID.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

function getSystemCaPath() {
  const env = process.env.SSL_CERT_FILE || process.env.CURL_CA_BUNDLE;
  if (env && fs.existsSync(env)) return env;
  const dir = process.env.SSL_CERT_DIR;
  if (dir && fs.existsSync(path.join(dir, 'ca-certificates.crt'))) {
    return path.join(dir, 'ca-certificates.crt');
  }

  const paths = [
    '/etc/ssl/cert.pem',
    '/etc/ssl/certs/ca-certificates.crt',
    '/etc/pki/tls/certs/ca-bundle.crt',
  ];
  if (os.platform() === 'darwin') {
    paths.unshift(
      '/opt/homebrew/etc/openssl@3/cert.pem',
      '/opt/homebrew/etc/openssl@1.1/cert.pem',
      '/usr/local/etc/openssl/cert.pem'
    );
  }
  for (const p of paths) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

function getMergedCa(brightDataCertPath) {
  const brightDataPem = fs.readFileSync(brightDataCertPath, 'utf8').trim();
  const systemPath = getSystemCaPath();
  if (systemPath) {
    const systemPem = fs.readFileSync(systemPath, 'utf8').trim();
    return `${systemPem}\n\n${brightDataPem}\n`;
  }
  return `${brightDataPem}\n`;
}

/**
 * Super Proxy config for Instagram, Facebook, Twitter.
 */
function getBrightDataConfig() {
  const customer = process.env.BRIGHTDATA_CUSTOMER;
  const zone = process.env.BRIGHTDATA_ZONE;
  const password = process.env.BRIGHTDATA_PASSWORD;

  if (!customer || !zone || !password) return null;

  const host = 'brd.superproxy.io';
  const port = 33335;
  const username = customer.toString().toLowerCase().startsWith('brd-customer-')
    ? `${customer}-zone-${zone}`
    : `brd-customer-${customer}-zone-${zone}`;

  let certPath = process.env.BRIGHTDATA_CERT_PATH;
  if (certPath) {
    certPath = path.isAbsolute(certPath) ? certPath : path.resolve(process.cwd(), certPath);
    if (!fs.existsSync(certPath)) certPath = null;
  }

  const useHttps = !!certPath;
  const proxyUrl = useHttps
    ? `https://${username}:${password}@${host}:${port}`
    : `http://${username}:${password}@${host}:${port}`;

  let mergedCa = null;
  if (certPath) {
    try {
      mergedCa = getMergedCa(certPath);
    } catch (e) {
      mergedCa = fs.readFileSync(certPath, 'utf8');
    }
  }

  return {
    host,
    port,
    username,
    password,
    proxyUrl,
    certPath: certPath || null,
    mergedCa,
    useHttps,
    isConfigured: true,
  };
}

/**
 * Datasets API config for TikTok and optional Twitter (Web Scrapers Library).
 * Requires BRIGHTDATA_DATASETS_API_KEY. Set BRIGHTDATA_TIKTOK_DATASET_ID and/or BRIGHTDATA_TWITTER_DATASET_ID.
 */
function getBrightDataDatasetsConfig() {
  const apiKey = process.env.BRIGHTDATA_DATASETS_API_KEY;
  const tiktokDatasetId = process.env.BRIGHTDATA_TIKTOK_DATASET_ID;
  const twitterDatasetId = process.env.BRIGHTDATA_TWITTER_DATASET_ID;

  if (!apiKey || typeof apiKey !== 'string') return null;

  return {
    apiKey: apiKey.trim(),
    tiktokDatasetId: tiktokDatasetId && typeof tiktokDatasetId === 'string' ? tiktokDatasetId.trim() : null,
    twitterDatasetId: twitterDatasetId && typeof twitterDatasetId === 'string' ? twitterDatasetId.trim() : null,
    isConfigured: true,
  };
}

module.exports = {
  getBrightDataConfig,
  getBrightDataDatasetsConfig,
  getMergedCa,
  getSystemCaPath,
};
