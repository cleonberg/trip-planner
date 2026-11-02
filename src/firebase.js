import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyASaRiykF8Hpcn2ssQ2wfNRGKb6UPMeHRU",
  authDomain: "option-dashboard-data.firebaseapp.com",
  projectId: "option-dashboard-data",
  storageBucket: "option-dashboard-data.firebasestorage.app",
  messagingSenderId: "653555280833",
  appId: "1:653555280833:web:afe77ade13ca063b28dd40"
};

const missing = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key)

if (missing.length) {
  throw new Error(`Missing Firebase configuration: ${missing.join(', ')}`)
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)