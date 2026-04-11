// notes.js – Persistent sticky notes (Firestore)
(function() {
    let currentUser = null;
    let currentBookId = null;
    let annotations = {};
    let activeNoteCard = null;

    firebase.auth().onAuthStateChanged((user) => {
        currentUser = user;
        if (user && currentBookId) loadAnnotations();
    });

    function getCurrentBookId() { return window.currentBookId || null; }

    async function loadAnnotations() {
        if (!currentUser || !currentBookId) return;
        const docRef = firebase.firestore().collection('users').doc(currentUser.uid).collection('annotations').doc(String(currentBookId));
        const doc = await docRef.get();
        annotations[currentBookId] = doc.exists ? doc.data().annotations || [] : [];
        renderHighlights();
    }

    async function saveAnnotations() {
        if (!currentUser || !currentBookId) return;
        const docRef = firebase.firestore().collection('users').doc(currentUser.uid).collection('annotations').doc(String(currentBookId));
        await docRef.set({ annotations: annotations[currentBookId] || [] });
    }

    function clearHighlights() {
        const iframe = document.getElementById('bookFrame');
        if (!iframe || !iframe.contentDocument) return;
        const doc = iframe.contentDocument;
        doc.querySelectorAll('.medlib-note-highlight').forEach(el => {
            const parent = el.parentNode;
            parent.replaceChild(document.createTextNode(el.textContent), el);
            parent.normalize();
        });
    }

    function renderHighlights() {
        const iframe = document.getElementById('bookFrame');
        if (!iframe || !iframe.contentDocument) return;
        const doc = iframe.contentDocument;
        clearHighlights();

        const annos = annotations[currentBookId] || [];
        annos.forEach(anno => {
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
                        showStickyNote(span, anno);
                    });
                    break;
                }
            }
        });
    }

    function showStickyNote(element, anno) {
        if (activeNoteCard && activeNoteCard.parentNode) activeNoteCard.parentNode.removeChild(activeNoteCard);
        const iframe = document.getElementById('bookFrame');
        const iframeRect = iframe.getBoundingClientRect();
        const rect = element.getBoundingClientRect();

        const card = document.createElement('div');
        card.className = 'medlib-sticky-note';
        card.innerHTML = `
            <div class="note-header">
                <span class="note-icon">📌</span>
                <span class="note-title">Study Note</span>
                <button class="note-edit" title="Edit note">✏️</button>
                <button class="note-close">×</button>
            </div>
            <div class="note-content">${escapeHtml(anno.note)}</div>
        `;
        document.body.appendChild(card);

        let left = iframeRect.left + rect.right + window.scrollX + 15;
        let top = iframeRect.top + rect.top + window.scrollY;
        if (left + 280 > window.innerWidth) left = iframeRect.left + rect.left - 280;
        if (top + 200 > window.innerHeight) top = window.innerHeight - 210;
        card.style.left = Math.max(10, left) + 'px';
        card.style.top = Math.max(10, top) + 'px';

        card.querySelector('.note-edit').onclick = () => {
            const newNote = prompt('Edit your note:', anno.note);
            if (newNote !== null && newNote !== anno.note) {
                anno.note = newNote;
                card.querySelector('.note-content').innerText = newNote;
                element.setAttribute('data-note', newNote);
                saveAnnotations();
            }
        };
        card.querySelector('.note-close').onclick = () => {
            if (card.parentNode) card.parentNode.removeChild(card);
            activeNoteCard = null;
        };
        activeNoteCard = card;
    }

    function escapeHtml(str) {
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
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
