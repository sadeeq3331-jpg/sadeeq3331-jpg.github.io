// firebase-config.js
const firebaseConfig = {
    apiKey: "AIzaSyCCFB41XAQZ6S0IbBDLI-FjjjE_NlTBS14",
    authDomain: "midlib-e3187.firebaseapp.com",
    projectId: "midlib-e3187",
    storageBucket: "midlib-e3187.firebasestorage.app",
    messagingSenderId: "382363535690",
    appId: "1:382363535690:web:eedfb3639a62faa9a519b3"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
