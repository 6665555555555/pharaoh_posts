// Firebase Configuration
// IMPORTANT: Replace the values below with your own Firebase project configuration
// Get this from: Firebase Console -> Project Settings -> General -> Your apps -> SDK setup and configuration
const firebaseConfig = {
    apiKey: "AIzaSyC3UVjx2WZD7r3at-loCr2e5czlRkWzUAA",
    authDomain: "liath-18f49.firebaseapp.com",
    projectId: "liath-18f49",
    storageBucket: "liath-18f49.firebasestorage.app",
    messagingSenderId: "354181971871",
    appId: "1:354181971871:web:fa08d724dea137f01407aa",
    measurementId: "G-09JXJ6PNH3"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Analytics is optional — may be blocked by adblockers
try {
    firebase.analytics();
} catch (e) {
    console.warn('Analytics not available:', e.message);
}

const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

