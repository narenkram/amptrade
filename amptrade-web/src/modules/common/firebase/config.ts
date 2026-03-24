import { initializeApp } from 'firebase/app'
import { getAnalytics } from 'firebase/analytics'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
  apiKey: 'AIzaSyA3O3UfgQFs8pIzbbB_2SfH-bnkXP7B7RQ',
  authDomain: 'steadfastapp-4d677.firebaseapp.com',
  databaseURL: 'https://steadfastapp-4d677-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'steadfastapp-4d677',
  storageBucket: 'steadfastapp-4d677.firebasestorage.app',
  messagingSenderId: '901272268862',
  appId: '1:901272268862:web:e0c1a7bc142dc88080a16f',
  measurementId: 'G-K7SYZ5W0ER',
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
getAnalytics(app)

// Initialize Firebase services
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
export const rtdb = getDatabase(app)

export default app
