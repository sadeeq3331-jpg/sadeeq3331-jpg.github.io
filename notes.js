// notes.js – Persistent sticky notes with inline editing
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
        // Wait for iframe to be ready before rendering highlights
        const iframe = document.getElementById('bookFrame');
        if (iframe && iframe.contentDocument) {
            renderHighlights();
        } else {
            const checkInterval = setInterval(() => {
                const iframe = document.getElementById('bookFrame');
                if (iframe && iframe.contentDocument) {
                    clearInterval(checkInterval);
                    renderHighlights();
                }
            }, 200);
        }
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
            <div class="note-content" id="note-content-${anno.id}">${escapeHtml(anno.note)}</div>
        `;
        document.body.appendChild(card);

        let left = iframeRect.left + rect.right + window.scrollX + 15;
        let top = iframeRect.top + rect.top + window.scrollY;
        if (left + 280 > window.innerWidth) left = iframeRect.left + rect.left - 280;
        if (top + 200 > window.innerHeight) top = window.innerHeight - 210;
        card.style.left = Math.max(10, left) + 'px';
        card.style.top = Math.max(10, top) + 'px';

        // Edit button – opens inline editor
        const editBtn = card.querySelector('.note-edit');
        const contentDiv = card.querySelector('.note-content');
        editBtn.onclick = () => {
            // Replace content with a textarea
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

            // Save button
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
                    renderHighlights(); // re-render to update all instances
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
            if (currentUser) {
                // Wait for iframe to load
                const iframe = document.getElementById('bookFrame');
                if (iframe) {
                    iframe.onload = () => loadAnnotations();
                } else {
                    loadAnnotations();
                }
            }
        };
    }
})();
