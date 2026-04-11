// sync-conversations.js – Sync Nexus chat conversations across devices
(function() {
    let currentUser = null;

    function getUserConversationsRef(userId) {
        return firebase.firestore().collection('users').doc(userId).collection('data').doc('conversations');
    }

    async function loadConversationsFromFirestore(userId) {
        const doc = await getUserConversationsRef(userId).get();
        return doc.exists ? doc.data().conversations : null;
    }

    async function saveConversationsToFirestore(userId, conversations) {
        await getUserConversationsRef(userId).set({ conversations });
    }

    async function syncConversations() {
        if (!currentUser) return;
        const local = localStorage.getItem('nexus_conversations');
        const localConvs = local ? JSON.parse(local) : null;
        const remoteConvs = await loadConversationsFromFirestore(currentUser.uid);
        if (!remoteConvs) {
            // No remote, save local
            if (localConvs) await saveConversationsToFirestore(currentUser.uid, localConvs);
        } else {
            // Merge: keep remote (as source of truth) but if local has newer? For simplicity, use remote
            localStorage.setItem('nexus_conversations', JSON.stringify(remoteConvs));
            // Trigger Nexus to reload conversations
            if (typeof window.reloadNexusConversations === 'function') window.reloadNexusConversations(remoteConvs);
        }
    }

    firebase.auth().onAuthStateChanged(async (user) => {
        currentUser = user;
        if (user) {
            await syncConversations();
            // Listen to realtime changes (optional)
            const docRef = getUserConversationsRef(user.uid);
            docRef.onSnapshot((doc) => {
                if (doc.exists && doc.data().conversations) {
                    const remote = doc.data().conversations;
                    localStorage.setItem('nexus_conversations', JSON.stringify(remote));
                    if (typeof window.reloadNexusConversations === 'function') window.reloadNexusConversations(remote);
                }
            });
        }
    });

    window.syncConversationsUpdate = async (conversations) => {
        if (currentUser) {
            await saveConversationsToFirestore(currentUser.uid, conversations);
        }
    };
})();
