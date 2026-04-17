import admin from 'firebase-admin';

// Hergebruik dezelfde Firebase-omgevingsvariabelen als de aanmeld-app
// zodat beide apps naar dezelfde Firestore kunnen wijzen zonder
// dubbel werk.

function getRequiredEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Missing env var: ${name}`);
  return String(v);
}

export function isFirestoreEnabled() {
  return Boolean(process.env.FIREBASE_PROJECT_ID);
}

let app;

export function getFirestore() {
  if (!isFirestoreEnabled()) {
    throw new Error(
      'Firestore is niet geconfigureerd. Stel FIREBASE_PROJECT_ID + credentials in.'
    );
  }

  if (!app) {
    // Vercel voert lambda's parallel uit; voorkom dubbele init.
    if (admin.apps.length > 0) {
      app = admin.apps[0];
    } else {
      const projectId = getRequiredEnv('FIREBASE_PROJECT_ID');
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY;
      const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

      if (serviceAccountJson) {
        const parsed = JSON.parse(serviceAccountJson);
        app = admin.initializeApp({ credential: admin.credential.cert(parsed) });
      } else if (clientEmail && privateKey) {
        app = admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey: String(privateKey).replace(/\\n/g, '\n'),
          }),
        });
      } else {
        app = admin.initializeApp({ projectId });
      }
    }
  }

  return admin.firestore();
}

export const FieldValue = admin.firestore.FieldValue;
