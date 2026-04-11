// notes.js – Permanent highlights with beautiful editable notes
(function() {
    let currentUser = null;
    let currentBookId = null;
    let annotations = {};
    let activeNoteCard = null;
    let retryCount = 0;

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
        if (!iframe || !iframe.contentDocument) {
            // If iframe not ready, retry after a short delay
            if (retryCount < 10) {
                setTimeout(() => renderHighlights(), 500);
                retryCount++;
            }
            return;
        }
        retryCount = 0;
        const doc = iframe.contentDocument;
        clearHighlights();

        const annos = annotations[currentBookId] || [];
        annos.forEach(anno => {
            // Try to find the exact text (case‑sensitive)
            // Simple implementation: walk through text nodes
            const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while (node = walker.nextNode()) {
                if (node.textContent.includes(anno.text)) {
                    const span = doc.createElement('span');
                    span.className = 'medlib-note-highlight';
                    span.style.backgroundColor = '#ffeb3b';
                    span.style.cursor = 'pointer';
                    span.setAttribute('data-id', anno.id);
                    span.textContent = node.textContent;
                    node.parentNode.replaceChild(span, node);
                    span.addEventListener('click', (e) => {
                        e.stopPropagation();
                        showNoteEditor(span, anno);
                    });
                    break;
                }
            }
        });
    }

    // Show an attractive editable note card
    function showNoteEditor(element, anno) {
        // Remove existing card
        if (activeNoteCard && activeNoteCard.parentNode) activeNoteCard.parentNode.removeChild(activeNoteCard);
        
        const iframe = document.getElementById('bookFrame');
        const iframeRect = iframe.getBoundingClientRect();
        const rect = element.getBoundingClientRect();

        const card = document.createElement('div');
        card.className = 'medlib-note-editor';
        card.innerHTML = `
            <div class="note-editor-header">
                <span>📌 Edit Note</span>
                <button class="note-editor-close">×</button>
            </div>
            <textarea class="note-editor-textarea" rows="4" placeholder="Write your note here...">${escapeHtml(anno.note)}</textarea>
            <div class="note-editor-footer">
                <button class="note-editor-save">💾 Save</button>
                <button class="note-editor-cancel">Cancel</button>
            </div>
        `;
        document.body.appendChild(card);

        // Position near the highlight
        let left = iframeRect.left + rect.right + window.scrollX + 15;
        let top = iframeRect.top + rect.top + window.scrollY;
        if (left + 320 > window.innerWidth) left = iframeRect.left + rect.left - 320;
        if (top + 200 > window.innerHeight) top = window.innerHeight - 220;
        card.style.left = Math.max(10, left) + 'px';
        card.style.top = Math.max(10, top) + 'px';

        const textarea = card.querySelector('.note-editor-textarea');
        const saveBtn = card.querySelector('.note-editor-save');
        const cancelBtn = card.querySelector('.note-editor-cancel');
        const closeBtn = card.querySelector('.note-editor-close');

        function saveAndClose() {
            const newNote = textarea.value.trim();
            if (newNote !== anno.note) {
                anno.note = newNote;
                saveAnnotations();
                // Update the highlight's data attribute (optional)
                element.setAttribute('data-note', newNote);
            }
            if (card.parentNode) card.parentNode.removeChild(card);
            activeNoteCard = null;
        }

        saveBtn.onclick = saveAndClose;
        cancelBtn.onclick = () => {
            if (card.parentNode) card.parentNode.removeChild(card);
            activeNoteCard = null;
        };
        closeBtn.onclick = cancelBtn.onclick;

        // Click outside to close? Optional, but may interfere.
        // We'll keep it simple: only buttons close.
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

    // Add a new annotation (from selection popup)
    window.addAnnotation = async function(text) {
        if (!currentUser) { alert('Please sign in to add notes.'); return; }
        currentBookId = getCurrentBookId();
        if (!currentBookId) return;
        
        // Create a beautiful modal for note input
        const modal = document.createElement('div');
        modal.className = 'medlib-note-modal';
        modal.innerHTML = `
            <div class="medlib-note-modal-content">
                <div class="modal-header">
                    <span>📝 Add a Note</span>
                    <button class="modal-close">×</button>
                </div>
                <textarea class="modal-textarea" rows="6" placeholder="Write your note here..."></textarea>
                <div class="modal-footer">
                    <button class="modal-save">Save Note</button>
                    <button class="modal-cancel">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Center modal
        modal.style.display = 'flex';
        
        const textarea = modal.querySelector('.modal-textarea');
        const saveBtn = modal.querySelector('.modal-save');
        const cancelBtn = modal.querySelector('.modal-cancel');
        const closeBtn = modal.querySelector('.modal-close');
        
        function saveNote() {
            const note = textarea.value.trim();
            if (note) {
                if (!annotations[currentBookId]) annotations[currentBookId] = [];
                annotations[currentBookId].push({ id: Date.now(), text, note });
                saveAnnotations().then(() => {
                    renderHighlights();
                });
            }
            modal.remove();
        }
        
        saveBtn.onclick = saveNote;
        cancelBtn.onclick = () => modal.remove();
        closeBtn.onclick = () => modal.remove();
    };

    // When book changes, reload annotations
    const originalOpenBook = window.openBook;
    if (originalOpenBook) {
        window.openBook = async function(filename, bookId) {
            currentBookId = bookId;
            window.currentBookId = bookId;
            await originalOpenBook(filename, bookId);
            if (currentUser) {
                // Wait for iframe to load before applying highlights
                const iframe = document.getElementById('bookFrame');
                if (iframe) {
                    iframe.addEventListener('load', () => {
                        loadAnnotations();
                    }, { once: true });
                    if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                        loadAnnotations();
                    }
                }
            }
        };
    }
})();
