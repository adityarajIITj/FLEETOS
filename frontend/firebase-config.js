import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyA-paB8nJHR0HqY2ObYQILVkqSj_hCk7yw",
  authDomain: "fleetos-3451c.firebaseapp.com",
  projectId: "fleetos-3451c",
  storageBucket: "fleetos-3451c.firebasestorage.app",
  messagingSenderId: "786246849019",
  appId: "1:786246849019:web:667fa8f74ae535755a3b5e",
  measurementId: "G-14NENRXMGE"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { app, auth, googleProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, onAuthStateChanged, signOut };
