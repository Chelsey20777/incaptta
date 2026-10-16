import * as functions from 'firebase-functions';
import app from './app';

// Export the Express app as a Cloud Function
export const api = functions.https.onRequest(app);
