// selection-popup.js – Handles text selection in iframe and shows floating buttons
(function() {
    let popup = null;
    let iframe = null;
    let checkInterval = null;

    function createPopup() {
        if (popup) return popup;
        const div = document.createElement('div');
        div.id = 'medlib-selection-popup';
        div.className = 'medlib-selection-popup';
        div.innerHTML = `
            <div class="popup-btn" id="popup-ask-nexus">🤖 Ask Nexus</div>
            <div class="popup-btn" id="popup-us">🔊 US <span class="speed-indicator" id="popup-us-speed">1x</span></div>
            <div class="popup-btn" id="popup-uk">🔊 UK <span class="speed-indicator" id="popup-uk-speed">1x</span></div>
            <div class="popup-btn" id="popup-add-note">📝 Add Note</div>
        `;
        document.body.appendChild(div);
        return div;
    }

    function positionPopup(rect, iframeRect) {
        if (!popup) return;
        const left = iframeRect.left + rect.left + window.scrollX + (rect.width / 2) - 70;
        const top = iframeRect.top + rect.top + window.scrollY - 50;
        popup.style.display = 'flex';
        popup.style.left = Math.max(10, left) + 'px';
        popup.style.top = Math.max(10, top) + 'px';
    }

    function hidePopup() {
        if (popup) popup.style.display = 'none';
    }

    function startListening() {
        iframe = document.getElementById('bookFrame');
        if (!iframe) return;
        popup = createPopup();

        // Attach button events
        document.getElementById('popup-ask-nexus').onclick = () => {
            const text = popup.getAttribute('data-text');
            if (text) {
                const input = document.getElementById('nexus-input');
                if (input) input.value = text;
                const panel = document.querySelector('.nexus-panel');
                if (panel) panel.style.display = 'flex';
                if (typeof window.sendMessage === 'function') window.sendMessage(text);
                else alert('Nexus not ready');
            }
            hidePopup();
        };

        let usSpeed = 1.0, ukSpeed = 1.0;
        const usSpeedSpan = document.getElementById('popup-us-speed');
        const ukSpeedSpan = document.getElementById('popup-uk-speed');

        document.getElementById('popup-us').onclick = () => {
            const text = popup.getAttribute('data-text');
            if (text) {
                usSpeed = usSpeed === 1.0 ? 0.5 : 1.0;
                usSpeedSpan.innerText = usSpeed === 1.0 ? '1x' : '½x';
                if (typeof window.speakUS === 'function') window.speakUS(text);
                else alert('Pronunciation not loaded');
            }
            hidePopup();
        };

        document.getElementById('popup-uk').onclick = () => {
            const text = popup.getAttribute('data-text');
            if (text) {
                ukSpeed = ukSpeed === 1.0 ? 0.5 : 1.0;
                ukSpeedSpan.innerText = ukSpeed === 1.0 ? '1x' : '½x';
                if (typeof window.speakUK === 'function') window.speakUK(text);
                else alert('Pronunciation not loaded');
            }
            hidePopup();
        };

        document.getElementById('popup-add-note').onclick = () => {
            const text = popup.getAttribute('data-text');
            if (text) {
                if (typeof window.addAnnotation === 'function') window.addAnnotation(text);
                else alert('Please sign in to add notes');
            }
            hidePopup();
        };

        // Poll for selection changes
        if (checkInterval) clearInterval(checkInterval);
        checkInterval = setInterval(() => {
            try {
                if (!iframe || !iframe.contentDocument) return;
                const doc = iframe.contentDocument;
                const sel = doc.getSelection();
                const text = sel.toString().trim();
                if (text) {
                    const range = sel.getRangeAt(0);
                    const rect = range.getBoundingClientRect();
                    if (rect && rect.width > 0) {
                        const iframeRect = iframe.getBoundingClientRect();
                        positionPopup(rect, iframeRect);
                        popup.setAttribute('data-text', text);
                        return;
                    }
                }
                hidePopup();
            } catch(e) {
                hidePopup();
            }
        }, 500);
    }

    // Wait for iframe to be ready
    const iframeCheck = setInterval(() => {
        const iframeEl = document.getElementById('bookFrame');
        if (iframeEl && iframeEl.contentDocument) {
            clearInterval(iframeCheck);
            startListening();
        }
    }, 200);
})();
