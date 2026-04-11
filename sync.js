// sync.js – Synchronize favorites and bookmarks across devices
(function() {
    let currentUser = null;

    // ========== Helper: Get Firestore references ==========
    function getUserFavoritesRef(userId) {
        return firebase.firestore().collection('users').doc(userId).collection('data').doc('favorites');
    }
    function getUserBookmarksRef(userId) {
        return firebase.firestore().collection('users').doc(userId).collection('data').doc('bookmarks');
    }

    // ========== Save to Firestore ==========
    function saveFavoritesToFirestore(userId, favorites) {
        return getUserFavoritesRef(userId).set({ favorites });
    }
    function saveBookmarksToFirestore(userId, bookmarks) {
        return getUserBookmarksRef(userId).set({ bookmarks });
    }

    // ========== Load from Firestore ==========
    async function loadFavoritesFromFirestore(userId) {
        const doc = await getUserFavoritesRef(userId).get();
        return doc.exists ? doc.data().favorites : null;
    }
    async function loadBookmarksFromFirestore(userId) {
        const doc = await getUserBookmarksRef(userId).get();
        return doc.exists ? doc.data().bookmarks : null;
    }

    // ========== Merge local and remote data ==========
    function mergeFavorites(local, remote) {
        if (!remote) return local;
        if (!local) return remote;
        // Merge unique IDs
        const merged = [...new Set([...local, ...remote])];
        return merged;
    }
    function mergeBookmarks(local, remote) {
        if (!remote) return local;
        if (!local) return remote;
        // Merge by bookId, keep the one with newer timestamp
        const map = new Map();
        [...local, ...remote].forEach(b => {
            if (!map.has(b.bookId) || b.timestamp > map.get(b.bookId).timestamp) {
                map.set(b.bookId, b);
            }
        });
        return Array.from(map.values());
    }

    // ========== Sync all data (after login) ==========
    async function syncAllData(userId) {
        // Favorites
        const localFavs = JSON.parse(localStorage.getItem('medlib_favorites') || '[]');
        const remoteFavs = await loadFavoritesFromFirestore(userId);
        const mergedFavs = mergeFavorites(localFavs, remoteFavs);
        localStorage.setItem('medlib_favorites', JSON.stringify(mergedFavs));
        await saveFavoritesToFirestore(userId, mergedFavs);

        // Bookmarks
        const localBookmarks = JSON.parse(localStorage.getItem('medlib_bookmarks') || '[]');
        const remoteBookmarks = await loadBookmarksFromFirestore(userId);
        const mergedBookmarks = mergeBookmarks(localBookmarks, remoteBookmarks);
        localStorage.setItem('medlib_bookmarks', JSON.stringify(mergedBookmarks));
        await saveBookmarksToFirestore(userId, mergedBookmarks);

        // Refresh UI if functions exist
        if (typeof window.renderFavorites === 'function') window.renderFavorites();
        if (typeof window.renderBookmarks === 'function') window.renderBookmarks();

        console.log('Sync complete');
    }

    // ========== Update Firestore when local data changes ==========
    function updateFavorites(userId, favorites) {
        if (!userId) return;
        saveFavoritesToFirestore(userId, favorites);
    }
    function updateBookmarks(userId, bookmarks) {
        if (!userId) return;
        saveBookmarksToFirestore(userId, bookmarks);
    }

    // ========== Listen to auth state ==========
    firebase.auth().onAuthStateChanged(async (user) => {
        currentUser = user;
        if (user) {
            await syncAllData(user.uid);
            // Override localStorage setters to also update Firestore on changes
            // We'll monkey-patch the existing functions that modify these storages
            // These functions are defined in the main app; we'll expose sync calls via window
        } else {
            // On logout, keep local data (do nothing)
            console.log('User signed out, no sync');
        }
    });

    // Expose sync functions globally so they can be called from main app
    window.syncFavoritesUpdate = (favorites) => {
        if (currentUser) updateFavorites(currentUser.uid, favorites);
    };
    window.syncBookmarksUpdate = (bookmarks) => {
        if (currentUser) updateBookmarks(currentUser.uid, bookmarks);
    };
})();
