const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env from current directory or parent
dotenv.config({ path: path.join(__dirname, '../.env') });

async function clearOldStripeMethods() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI not found in .env');
        process.exit(1);
    }

    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(uri);

        // Define minimal schema for deletion
        const BrandPaymentMethod = mongoose.model('BrandPaymentMethod', new mongoose.Schema({
            'cardDetails.gatewayProvider': String
        }, { strict: false, collection: 'brandpaymentmethods' }));

        console.log('Searching for old Stripe payment methods...');
        const result = await BrandPaymentMethod.deleteMany({ 'cardDetails.gatewayProvider': 'stripe' });

        console.log('--------------------------------------------------');
        console.log(`Success: Deleted ${result.deletedCount} old Stripe payment methods.`);
        console.log('These were invalid because they belonged to a different Stripe account.');
        console.log('Users will need to re-add their cards in the app.');
        console.log('--------------------------------------------------');

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

clearOldStripeMethods();
