const admin = require('firebase-admin');
const serviceAccount = require('./ecopulse.json');

// Check if any Firebase apps are already initialized
if (!admin.apps.length) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('Firebase Admin initialized successfully');
    } catch (error) {
      console.error('Firebase admin initialization error:', error.stack);
    }
  }

module.exports = admin;