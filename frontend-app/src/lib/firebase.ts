import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyA-paB8nJHR0HqY2ObYQILVkqSj_hCk7yw",
  authDomain: "fleetos-3451c.firebaseapp.com",
  projectId: "fleetos-3451c",
  storageBucket: "fleetos-3451c.firebasestorage.app",
  messagingSenderId: "786246849019",
  appId: "1:786246849019:web:667fa8f74ae535755a3b5e",
  measurementId: "G-14NENRXMGE"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const idToken = await result.user.getIdToken();
  return { idToken, user: result.user };
}
