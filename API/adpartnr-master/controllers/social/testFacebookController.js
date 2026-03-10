const { ensureHttpsBackendUrl } = require('../../utils/socialHelpers');

// Hardcoded Business Configuration ID for debugging
// This is the config_id you shared from your Meta Business configuration
const TEST_FACEBOOK_CONFIG_ID = '1534402508237462';

/**
 * Minimal, isolated test endpoint to generate a Facebook OAuth URL
 * using only client_id, redirect_uri, response_type, state, and config_id.
 *
 * No scopes, no encrypted state, no extra logic.
 *
 * GET /api/social/test/facebook
 */
const getTestFacebookAuthUrl = (req, res) => {
  try {
    if (!process.env.FACEBOOK_APP_ID) {
      return res.status(500).json({
        success: false,
        message: 'FACEBOOK_APP_ID is not set in environment variables',
      });
    }

    const backendUrl = ensureHttpsBackendUrl(req);
    const redirectUri = `${backendUrl}/api/social/test/facebook/callback`;

    const params = new URLSearchParams({
      client_id: process.env.FACEBOOK_APP_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      // Simple, non-encrypted state for debugging
      state: `test-${Date.now()}`,
    });

    // Use the hardcoded Business Configuration ID
    params.append('config_id', TEST_FACEBOOK_CONFIG_ID);
    //params.append('scope', 'pages_show_list');

    const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;

    console.log('Test Facebook OAuth URL (minimal):', authUrl.replace(/state=[^&]+/, 'state=***'));

    return res.json({
      success: true,
      data: {
        authUrl,
        configId: TEST_FACEBOOK_CONFIG_ID,
        redirectUri,
      },
    });
  } catch (error) {
    console.error('Error generating test Facebook OAuth URL:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate test Facebook OAuth URL',
    });
  }
};

/**
 * Minimal callback handler for the test flow.
 * Just logs whatever Facebook sends back and shows a simple HTML page.
 *
 * GET /api/social/test/facebook/callback
 */
const handleTestFacebookCallback = (req, res) => {
  try {
    console.log('Test Facebook callback query:', req.query);

    const { code, error, error_description } = req.query;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Facebook Test Callback</title>
          <style>
            body { font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; }
            pre { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; }
          </style>
        </head>
        <body>
          <h1>Facebook Test Callback</h1>
          <p>This is the minimal test callback endpoint.</p>
          <p><strong>code:</strong> ${code || '—'}</p>
          <p><strong>error:</strong> ${error || '—'}</p>
          <p><strong>error_description:</strong> ${error_description || '—'}</p>
          <h2>Full Query</h2>
          <pre>${JSON.stringify(req.query, null, 2)}</pre>
        </body>
      </html>
    `;

    res.status(200).send(html);
  } catch (error) {
    console.error('Error in test Facebook callback:', error);
    res.status(500).send('Test callback error');
  }
};

module.exports = {
  getTestFacebookAuthUrl,
  handleTestFacebookCallback,
};


