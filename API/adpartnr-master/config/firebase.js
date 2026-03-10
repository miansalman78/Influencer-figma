const admin = require('firebase-admin');
require('dotenv').config();

/**
 * Initialize Firebase Admin SDK
 * Uses service account credentials from environmental variables
 */
const initializeFirebase = () => {
    try {
        if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
            console.warn('[Firebase] Configuration missing. Custom tokens and cloud messaging may not work.');
            return null;
        }

        if (admin.apps.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    // Replace escaped newlines if they exist in the environment variable
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                }),
            });
            console.log('[Firebase] Admin SDK initialized successfully');
        }
        return admin;
    } catch (error) {
        console.error('[Firebase] Initialization error:', error);
        return null;
    }
};

const firebaseAdmin = initializeFirebase();

module.exports = { admin, firebaseAdmin };
