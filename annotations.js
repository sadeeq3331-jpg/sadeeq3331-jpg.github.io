// annotations.js – Highlight & Notes (requires Firebase Auth)
(function() {
    let currentUser = null;
    let currentBookId = null;
    let annotations = {}; // key: bookId, value: array of annotations

    // Listen to Firebase auth state
    firebase.auth().onAuthStateChanged((user) => {
        currentUser = user;
        if (user) {
            loadAnnotationsForCurrentBook();
        }
    });

    function getCurrentBookId() {
        // Get book ID from the iframe URL or global variable
        return window.currentBookId || null;
    }

    function loadAnnotationsForCurrentBook() {
        if (!currentUser) return;
        const bookId = getCurrentBookId();
        if (!bookId) return;
        const docRef = firebase.firestore().collection('users').doc(currentUser.uid).collection('annotations').doc(String(bookId));
        docRef.get().then(doc => {
            if (doc.exists) {
                annotations[bookId] = doc.data().annotations || [];
                renderHighlights();
            } else {
                annotations[bookId] = [];
            }
        });
    }

    function saveAnnotations() {
        if (!currentUser) return;
        const bookId = getCurrentBookId();
        if (!bookId) return;
        const docRef = firebase.firestore().collection('users').doc(currentUser.uid).collection('annotations').doc(String(bookId));
        docRef.set({ annotations: annotations[bookId] || [] });
    }

    function renderHighlights() {
        const iframe = document.getElementById('bookFrame');
        if (!iframe || !iframe.contentDocument) return;
        const doc = iframe.contentDocument;
        // Remove existing highlights
        doc.querySelectorAll('.nexus-highlight').forEach(el => {
            const parent = el.parentNode;
            parent.replaceChild(document.createTextNode(el.textContent), el);
            parent.normalize();
        });
        // Apply new highlights
        const bookId = getCurrentBookId();
        const annos = annotations[bookId] || [];
        annos.forEach(anno => {
            // Simple text-based highlight (exact match). For production, use ranges.
            const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while (node = walker.nextNode()) {
                if (node.textContent.includes(anno.text)) {
                    const span = doc.createElement('span');
                    span.className = 'nexus-highlight';
                    span.style.backgroundColor = '#ffeb3b';
                    span.style.cursor = 'pointer';
                    span.setAttribute('data-note', anno.note);
                    span.setAttribute('data-id', anno.id);
                    span.textContent = node.textContent;
                    node.parentNode.replaceChild(span, node);
                    span.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const note = prompt('Edit your note:', span.getAttribute('data-note'));
                        if (note !== null) {
                            span.setAttribute('data-note', note);
                            const id = span.getAttribute('data-id');
                            const annoIndex = annotations[bookId].findIndex(a => a.id == id);
                            if (annoIndex !== -1) annotations[bookId][annoIndex].note = note;
                            saveAnnotations();
                        }
                    });
                    break;
                }
            }
        });
    }

    function addAnnotation(text, note) {
        if (!currentUser) { alert('Please sign in to add notes.'); return; }
        const bookId = getCurrentBookId();
        if (!bookId) return;
        if (!annotations[bookId]) annotations[bookId] = [];
        annotations[bookId].push({ id: Date.now(), text, note });
        saveAnnotations();
        renderHighlights();
    }

    // Listen to selection in iframe
    function setupAnnotationSelection() {
        const iframe = document.getElementById('bookFrame');
        if (!iframe) return;
        let popup = null;
        iframe.addEventListener('load', () => {
            const doc = iframe.contentDocument;
            doc.addEventListener('mouseup', () => {
                const sel = doc.getSelection();
                const text = sel.toString().trim();
                if (text) {
                    if (!popup) {
                        popup = doc.createElement('div');
                        popup.style.position = 'absolute';
                        popup.style.background = '#2c7cb0';
                        popup.style.color = 'white';
                        popup.style.padding = '5px 10px';
                        popup.style.borderRadius = '20px';
                        popup.style.cursor = 'pointer';
                        popup.style.zIndex = '1000';
                        popup.textContent = '📝 Add Note';
                        doc.body.appendChild(popup);
                        popup.onclick = () => {
                            const note = prompt('Enter your note:');
                            if (note) addAnnotation(text, note);
                            popup.style.display = 'none';
                        };
                    }
                    const range = sel.getRangeAt(0);
                    const rect = range.getBoundingClientRect();
                    popup.style.display = 'block';
                    popup.style.left = rect.left + 'px';
                    popup.style.top = (rect.top - 30) + 'px';
                } else if (popup) {
                    popup.style.display = 'none';
                }
            });
        });
    }

    setupAnnotationSelection();
})();
