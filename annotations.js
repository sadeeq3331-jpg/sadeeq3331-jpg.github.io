// annotations.js
(function() {
    let currentUser = null;
    let currentBookId = null;
    let annotations = {};

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
        doc.querySelectorAll('.nexus-highlight').forEach(el => {
            const parent = el.parentNode;
            parent.replaceChild(document.createTextNode(el.textContent), el);
            parent.normalize();
        });
        const annos = annotations[currentBookId] || [];
        annos.forEach(anno => {
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
                            const annoIndex = annotations[currentBookId].findIndex(a => a.id == id);
                            if (annoIndex !== -1) annotations[currentBookId][annoIndex].note = note;
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
        if (!currentBookId) return;
        if (!annotations[currentBookId]) annotations[currentBookId] = [];
        annotations[currentBookId].push({ id: Date.now(), text, note });
        saveAnnotations();
        renderHighlights();
    }

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
                } else if (popup) popup.style.display = 'none';
            });
        });
    }

    window.currentBookId = null;
    setupAnnotationSelection();
})();
