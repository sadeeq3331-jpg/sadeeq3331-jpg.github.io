// notes.js – Persistent sticky notes with reliable highlighting
(function() {
    let currentUser = null;
    let currentBookId = null;
    let annotations = {};
    let activeNoteCard = null;

    // Listen to auth state changes
    firebase.auth().onAuthStateChanged((user) => {
        currentUser = user;
        console.log("Auth state changed, user:", user ? user.uid : "null");
        if (user && currentBookId) {
            loadAnnotations();
        }
    });

    function getCurrentBookId() { return window.currentBookId || currentBookId; }

    async function loadAnnotations() {
        const bookId = getCurrentBookId();
        if (!currentUser || !bookId) { console.log("No user or bookId"); return; }
        console.log("Loading annotations for book", bookId);
        const docRef = firebase.firestore().collection('users').doc(currentUser.uid).collection('annotations').doc(String(bookId));
        const doc = await docRef.get();
        annotations[bookId] = doc.exists ? doc.data().annotations || [] : [];
        console.log("Annotations loaded:", annotations[bookId].length);
        renderHighlights();
    }

    async function saveAnnotations() {
        const bookId = getCurrentBookId();
        if (!currentUser || !bookId) return;
        const docRef = firebase.firestore().collection('users').doc(currentUser.uid).collection('annotations').doc(String(bookId));
        await docRef.set({ annotations: annotations[bookId] || [] });
        console.log("Annotations saved");
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
        if (!iframe || !iframe.contentDocument || iframe.contentDocument.readyState !== 'complete') {
            console.warn("Iframe not ready, will retry in 500ms");
            setTimeout(renderHighlights, 500);
            return;
        }
        clearHighlights();
        const bookId = getCurrentBookId();
        const annos = annotations[bookId] || [];
        console.log("Rendering", annos.length, "highlights");
        const doc = iframe.contentDocument;

        annos.forEach(anno => {
            // Find all text nodes that contain the exact text
            const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
            let nodes = [];
            while (walker.nextNode()) nodes.push(walker.currentNode);
            for (let node of nodes) {
                let index = node.textContent.indexOf(anno.text);
                if (index !== -1) {
                    const range = doc.createRange();
                    range.setStart(node, index);
                    range.setEnd(node, index + anno.text.length);
                    const span = doc.createElement('span');
                    span.className = 'medlib-note-highlight';
                    span.style.backgroundColor = '#ffeb3b';
                    span.style.cursor = 'pointer';
                    span.setAttribute('data-note', anno.note);
                    span.setAttribute('data-id', anno.id);
                    span.textContent = anno.text;
                    range.deleteContents();
                    range.insertNode(span);
                    break; // only highlight the first occurrence for simplicity
                }
            }
        });
        // Re-attach click events
        doc.querySelectorAll('.medlib-note-highlight').forEach(span => {
            const id = span.getAttribute('data-id');
            const anno = annos.find(a => a.id == id);
            if (anno) {
                span.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showStickyNote(span, anno);
                });
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

        const editBtn = card.querySelector('.note-edit');
        const contentDiv = card.querySelector('.note-content');
        editBtn.onclick = () => {
            const textarea = document.createElement('textarea');
            textarea.value = anno.note;
            textarea.style.width = '100%';
            textarea.style.minHeight = '80px';
            textarea.style.padding = '8px';
            textarea.style.fontSize = '0.9rem';
            textarea.style.borderRadius = '8px';
            textarea.style.border = '1px solid #e0c84a';
            textarea.style.fontFamily = 'inherit';
            contentDiv.innerHTML = '';
            contentDiv.appendChild(textarea);
            textarea.focus();
            const saveBtn = document.createElement('button');
            saveBtn.innerText = 'Save';
            saveBtn.style.marginTop = '8px';
            saveBtn.style.padding = '4px 12px';
            saveBtn.style.borderRadius = '20px';
            saveBtn.style.border = 'none';
            saveBtn.style.background = '#2c7cb0';
            saveBtn.style.color = 'white';
            saveBtn.style.cursor = 'pointer';
            contentDiv.appendChild(saveBtn);
            saveBtn.onclick = () => {
                const newNote = textarea.value.trim();
                if (newNote) {
                    anno.note = newNote;
                    contentDiv.innerHTML = escapeHtml(newNote);
                    element.setAttribute('data-note', newNote);
                    saveAnnotations();
                    renderHighlights();
                } else {
                    contentDiv.innerHTML = escapeHtml(anno.note);
                }
            };
        };
        card.querySelector('.note-close').onclick = () => {
            if (card.parentNode) card.parentNode.removeChild(card);
            activeNoteCard = null;
        };
        activeNoteCard = card;

        // Close when clicking outside
        const closeOutside = (e) => {
            if (!card.contains(e.target)) {
                if (card.parentNode) card.parentNode.removeChild(card);
                activeNoteCard = null;
                document.removeEventListener('click', closeOutside);
            }
        };
        setTimeout(() => document.addEventListener('click', closeOutside), 100);
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
        const bookId = getCurrentBookId();
        if (!bookId) { alert('No book open. Please open a book first.'); return; }
        const note = prompt('Enter your note for the selected text:');
        if (!note) return;
        if (!annotations[bookId]) annotations[bookId] = [];
        annotations[bookId].push({ id: Date.now(), text, note });
        await saveAnnotations();
        renderHighlights();
        localStorage.setItem('medlib_last_book', bookId);
    };

    // Override openBook to set currentBookId and trigger load after iframe loads
    const originalOpenBook = window.openBook;
    if (originalOpenBook) {
        window.openBook = async function(filename, bookId) {
            currentBookId = bookId;
            window.currentBookId = bookId;
            localStorage.setItem('medlib_last_book', bookId);
            console.log("openBook called, bookId =", bookId);
            await originalOpenBook(filename, bookId);
            const iframe = document.getElementById('bookFrame');
            if (iframe) {
                if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                    if (currentUser) loadAnnotations();
                } else {
                    iframe.onload = () => {
                        console.log("Iframe loaded, loading annotations");
                        if (currentUser) loadAnnotations();
                    };
                }
            }
        };
    }

    // On page load, restore the last opened book
    window.addEventListener('load', () => {
        const lastBook = localStorage.getItem('medlib_last_book');
        if (lastBook && !currentBookId && !window.currentBookId) {
            const checkBooks = setInterval(() => {
                if (window.books && window.books.length) {
                    clearInterval(checkBooks);
                    const book = window.books.find(b => b.id == lastBook);
                    if (book) {
                        window.openBook(book.filename, book.id);
                    }
                }
            }, 200);
        }
    });
})();
