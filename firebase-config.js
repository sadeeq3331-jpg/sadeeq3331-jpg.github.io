// ==================== FIREBASE CONFIGURATION ====================
const firebaseConfig = {
    apiKey: "AIzaSyCCFB41XAQZ6S0IbBDLI-FjjjE_NlTBS14",
    authDomain: "midlib-e3187.firebaseapp.com",
    projectId: "midlib-e3187",
    storageBucket: "midlib-e3187.firebasestorage.app",
    messagingSenderId: "382363535690",
    appId: "1:382363535690:web:eedfb3639a62faa9a519b3"
};

// Initialize Firebase (only if the library is loaded)
let db = null;

function initFirebase() {
    if (typeof firebase !== 'undefined' && !db) {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        console.log('Firebase initialized');
    } else if (typeof firebase === 'undefined') {
        console.warn('Firebase SDK not loaded – counts will be 0');
    }
}

// Call this early
initFirebase();

// ==================== FIRESTORE HELPERS ====================
async function getReaderCount(bookId) {
    if (!db) return 0;
    try {
        const docRef = db.collection('books').doc(String(bookId));
        const doc = await docRef.get();
        if (!doc.exists) {
            await docRef.set({ count: 0 });
            return 0;
        }
        return doc.data().count || 0;
    } catch (e) {
        console.warn('Firestore error (get)', e);
        return 0;
    }
}

async function incrementReaderCount(bookId) {
    if (!db) return;
    try {
        const docRef = db.collection('books').doc(String(bookId));
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(docRef);
            if (!doc.exists) {
                transaction.set(docRef, { count: 1 });
            } else {
                const newCount = (doc.data().count || 0) + 1;
                transaction.update(docRef, { count: newCount });
            }
        });
    } catch (e) {
        console.warn('Firestore error (increment)', e);
    }
}

// Make them globally available (for your main script)
window.db = db;
window.getReaderCount = getReaderCount;
window.incrementReaderCount = incrementReaderCount;
