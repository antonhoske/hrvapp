// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import AsyncStorage from '@react-native-async-storage/async-storage';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBWzYmkdQj7LbVk7dIZzjsan_Eca9EQPrA",
  authDomain: "lift-c8dbf.firebaseapp.com",
  projectId: "lift-c8dbf",
  storageBucket: "lift-c8dbf.firebasestorage.app",
  messagingSenderId: "16228935546",
  appId: "1:16228935546:web:9615f3300e942f861f58c3",
  measurementId: "G-2B6SVW0YSS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

// Initialize Auth - using simple auth initialization
const auth = getAuth(app);

// Since we can't use native persistence easily, we'll handle persistence manually
// in our authentication screens using AsyncStorage

export { db, auth };