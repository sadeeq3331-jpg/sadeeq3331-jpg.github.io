// notes.js – Persistent sticky notes with reliable iframe detection and multi‑retry
(function() {
    let currentUser = null;
    let currentBookId = null;
    let annotations = {};
    let activeNoteCard = null;
    let renderRetryCount = 0;
    const MAX_RENDER_RETRIES = 20;

    firebase.auth().onAuthStateChanged((user) => {
        currentUser = user;
        console.log("Auth state changed, user:", user ? user.uid : "null");
        if (user && currentBookId) loadAnnotations();
    });

    function getCurrentBookId() { return window.currentBookId || currentBookId; }

    async function loadAnnotations() {
        const bookId = getCurrentBookId();
        if (!currentUser || !bookId) return;
        console.log("Loading annotations for book", bookId);
        const docRef = firebase.firestore().collection('users').doc(currentUser.uid).collection('annotations').doc(String(bookId));
        const doc = await docRef.get();
        annotations[bookId] = doc.exists ? doc.data().annotations || [] : [];
        console.log("Annotations loaded:", annotations[bookId].length);
        renderHighlights(true); // force render
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

    function renderHighlights(force = false) {
        const iframe = document.getElementById('bookFrame');
        if (!iframe) {
            console.warn("Iframe not found, will retry in 500ms");
            if (renderRetryCount < MAX_RENDER_RETRIES) {
                setTimeout(() => renderHighlights(true), 500);
                renderRetryCount++;
            }
            return;
        }
        const doc = iframe.contentDocument;
        if (!doc || doc.readyState !== 'complete') {
            console.warn("Iframe not ready, will retry in 500ms");
            if (renderRetryCount < MAX_RENDER_RETRIES) {
                setTimeout(() => renderHighlights(true), 500);
                renderRetryCount++;
            }
            return;
        }
        renderRetryCount = 0;
        clearHighlights();
        const bookId = getCurrentBookId();
        const annos = annotations[bookId] || [];
        console.log("Rendering", annos.length, "highlights");
        if (annos.length === 0) return;

        annos.forEach(anno => {
            // Try to find the exact text in the document
            const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while (node = walker.nextNode()) {
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
                    break; // only first occurrence for simplicity
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
                    renderHighlights(true);
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

        // Close when clicking outside (with small delay to avoid immediate close)
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
        // Normalize text: trim and collapse spaces? Keep original but trim
        const cleanText = text.trim();
        if (!annotations[bookId]) annotations[bookId] = [];
        annotations[bookId].push({ id: Date.now(), text: cleanText, note });
        await saveAnnotations();
        renderHighlights(true);
        localStorage.setItem('medlib_last_book', bookId);
    };

    // Wait for window.openBook to exist, then override it
    function waitForOpenBook() {
        if (typeof window.openBook === 'function') {
            const originalOpenBook = window.openBook;
            window.openBook = async function(filename, bookId) {
                currentBookId = bookId;
                window.currentBookId = bookId;
                localStorage.setItem('medlib_last_book', bookId);
                console.log("openBook called, bookId =", bookId);
                const iframe = document.getElementById('bookFrame');
                if (iframe) {
                    // Attach load event BEFORE setting src
                    const onLoadHandler = () => {
                        console.log("Iframe load event");
                        if (currentUser) loadAnnotations();
                    };
                    iframe.addEventListener('load', onLoadHandler);
                    // If iframe already loaded, trigger immediately
                    if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                        console.log("Iframe already complete, triggering load handler");
                        onLoadHandler();
                    }
                }
                await originalOpenBook(filename, bookId);
            };
            console.log("Nexus notes: openBook overridden");
        } else {
            setTimeout(waitForOpenBook, 200);
        }
    }
    waitForOpenBook();

    // On page load, restore last opened book
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
