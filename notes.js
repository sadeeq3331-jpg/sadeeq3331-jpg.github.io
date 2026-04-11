// notes.js – Highlight & save notes to Firestore
(function() {
    let currentUser = null;
    let currentBookId = null;
    let annotations = {}; // key: bookId, value: array of { id, text, note }

    firebase.auth().onAuthStateChanged((user) => {
        currentUser = user;
        if (user && currentBookId) loadAnnotations();
    });

    function getCurrentBookId() { return window.currentBookId || null; }

    async function loadAnnotations() {
        if (!currentUser || !currentBookId) return;
        const docRef = firebase.firestore().collection('users').doc(currentUser.uid).collection('annotations').doc(String(currentBookId));
        const doc = await docRef.get();
        if (doc.exists) annotations[currentBookId] = doc.data().annotations || [];
        else annotations[currentBookId] = [];
        renderHighlights();
    }

    async function saveAnnotations() {
        if (!currentUser || !currentBookId) return;
        const docRef = firebase.firestore().collection('users').doc(currentUser.uid).collection('annotations').doc(String(currentBookId));
        await docRef.set({ annotations: annotations[currentBookId] || [] });
    }

    function renderHighlights() {
        const iframe = document.getElementById('bookFrame');
        if (!iframe || !iframe.contentDocument) return;
        const doc = iframe.contentDocument;
        // Remove existing highlights
        doc.querySelectorAll('.medlib-note-highlight').forEach(el => {
            const parent = el.parentNode;
            parent.replaceChild(document.createTextNode(el.textContent), el);
            parent.normalize();
        });
        const annos = annotations[currentBookId] || [];
        annos.forEach(anno => {
            // Simple text-based highlight (exact match). For production, use ranges.
            const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while (node = walker.nextNode()) {
                if (node.textContent.includes(anno.text)) {
                    const span = doc.createElement('span');
                    span.className = 'medlib-note-highlight';
                    span.style.backgroundColor = '#ffeb3b';
                    span.style.cursor = 'pointer';
                    span.setAttribute('data-note', anno.note);
                    span.setAttribute('data-id', anno.id);
                    span.textContent = node.textContent;
                    node.parentNode.replaceChild(span, node);
                    span.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const newNote = prompt('Edit your note:', span.getAttribute('data-note'));
                        if (newNote !== null) {
                            span.setAttribute('data-note', newNote);
                            const id = span.getAttribute('data-id');
                            const annoIndex = annotations[currentBookId].findIndex(a => a.id == id);
                            if (annoIndex !== -1) annotations[currentBookId][annoIndex].note = newNote;
                            saveAnnotations();
                        }
                    });
                    break;
                }
            }
        });
    }

    window.addAnnotation = async function(text) {
        if (!currentUser) { alert('Please sign in to add notes.'); return; }
        currentBookId = getCurrentBookId();
        if (!currentBookId) return;
        const note = prompt('Enter your note for the selected text:');
        if (!note) return;
        if (!annotations[currentBookId]) annotations[currentBookId] = [];
        annotations[currentBookId].push({ id: Date.now(), text, note });
        await saveAnnotations();
        renderHighlights();
    };

    // When book changes, reload annotations
    const originalOpenBook = window.openBook;
    if (originalOpenBook) {
        window.openBook = async function(filename, bookId) {
            currentBookId = bookId;
            window.currentBookId = bookId;
            await originalOpenBook(filename, bookId);
            if (currentUser) await loadAnnotations();
        };
    }
})();
