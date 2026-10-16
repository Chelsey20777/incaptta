
// Basic mock setup
// We will mock firebase-admin in the test files or use jest.mock here if global
jest.mock('firebase-admin', () => {
    return {
        apps: [],
        initializeApp: jest.fn(),
        credential: {
            applicationDefault: jest.fn(),
        },
        firestore: jest.fn(),
        auth: jest.fn(),
    };
});

// Mock config/firebase to return mocked instances
jest.mock('../config/firebase', () => {
    return {
        db: {
            collection: jest.fn(),
            runTransaction: jest.fn(),
        },
        auth: {
            verifyIdToken: jest.fn(),
        }
    };
});
