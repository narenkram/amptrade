import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Ensure environment variables are loaded
if (!process.env.FIREBASE_PROJECT_ID) {
  throw new Error("FIREBASE_PROJECT_ID is not set in environment variables");
}

if (!process.env.FIREBASE_CLIENT_EMAIL) {
  throw new Error("FIREBASE_CLIENT_EMAIL is not set in environment variables");
}

if (!process.env.FIREBASE_PRIVATE_KEY) {
  throw new Error("FIREBASE_PRIVATE_KEY is not set in environment variables");
}

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  // Make sure to properly handle the private key string
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
};

try {
  initializeApp({
    credential: cert(serviceAccount),
  });
  console.log("Firebase Admin initialized successfully");
} catch (error) {
  console.error("Error initializing Firebase Admin:", error);
  throw error;
}

export const auth = getAuth();
export const db = getFirestore();
