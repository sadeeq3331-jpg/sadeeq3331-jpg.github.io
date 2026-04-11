// sync.js
(function() {
    let currentUser = null;

    function getUserFavoritesRef(userId) {
        return firebase.firestore().collection('users').doc(userId).collection('data').doc('favorites');
    }
    function getUserBookmarksRef(userId) {
        return firebase.firestore().collection('users').doc(userId).collection('data').doc('bookmarks');
    }

    async function loadFavoritesFromFirestore(userId) {
        const doc = await getUserFavoritesRef(userId).get();
        return doc.exists ? doc.data().favorites : null;
    }
    async function loadBookmarksFromFirestore(userId) {
        const doc = await getUserBookmarksRef(userId).get();
        return doc.exists ? doc.data().bookmarks : null;
    }

    async function syncAllData(userId) {
        const localFavs = JSON.parse(localStorage.getItem('medlib_favorites') || '[]');
        const remoteFavs = await loadFavoritesFromFirestore(userId);
        const mergedFavs = remoteFavs ? [...new Set([...localFavs, ...remoteFavs])] : localFavs;
        localStorage.setItem('medlib_favorites', JSON.stringify(mergedFavs));
        await getUserFavoritesRef(userId).set({ favorites: mergedFavs });

        const localBookmarks = JSON.parse(localStorage.getItem('medlib_bookmarks') || '[]');
        const remoteBookmarks = await loadBookmarksFromFirestore(userId);
        const mergedBookmarks = remoteBookmarks ? [...localBookmarks, ...remoteBookmarks] : localBookmarks;
        localStorage.setItem('medlib_bookmarks', JSON.stringify(mergedBookmarks));
        await getUserBookmarksRef(userId).set({ bookmarks: mergedBookmarks });

        if (typeof window.renderFavorites === 'function') window.renderFavorites();
        if (typeof window.renderBookmarks === 'function') window.renderBookmarks();
    }

    firebase.auth().onAuthStateChanged(async (user) => {
        currentUser = user;
        if (user) await syncAllData(user.uid);
    });

    window.syncFavoritesUpdate = (favorites) => {
        if (currentUser) getUserFavoritesRef(currentUser.uid).set({ favorites });
    };
    window.syncBookmarksUpdate = (bookmarks) => {
        if (currentUser) getUserBookmarksRef(currentUser.uid).set({ bookmarks });
    };
})();
