const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// Serve uploaded files when using local disk fallback (e.g. uploads/images)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Security middleware
app.use(helmet());
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// CORS
const corsOptions = {
  origin: process.env.NODE_ENV === 'development' ? true : (process.env.FRONTEND_URL || 'http://localhost:3000'),
  credentials: true
};
app.use(cors(corsOptions));

// Webhook routes (must be before body parsing for Stripe)
app.use('/api/webhooks', require('./routes/webhooks'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Database connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/users', require('./routes/users'));
app.use('/api/brands', require('./routes/brands'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/proposals', require('./routes/proposals'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/offers', require('./routes/offers'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/social', require('./routes/social'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/services', require('./routes/services'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/location', require('./routes/location'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/currency', require('./routes/currency'));
app.use('/api/creator-roles', require('./routes/creatorRoles'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/connections', require('./routes/connections'));
app.use('/api/onboarding', require('./routes/onboarding'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use(require('./middleware/errorHandler'));

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  // Start background jobs
  if (process.env.NODE_ENV !== 'test') {
    const { startSocialSyncJob } = require('./jobs/socialSyncJob');
    const { startTokenRefreshJob } = require('./jobs/tokenRefreshJob');
    startSocialSyncJob();
    startTokenRefreshJob();
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
