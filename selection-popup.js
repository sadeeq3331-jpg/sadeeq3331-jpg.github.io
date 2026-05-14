/**
 * selection-popup.js – Modern, event-driven text selection popup for iframe content
 * 
 * Features:
 * - Uses 'selectionchange' event instead of polling (performance & accuracy)
 * - Repositions popup on scroll/resize events
 * - Proper cleanup with AbortController
 * - Handles iframe reloads and dynamic insertion
 * - Click-outside-to-close behavior
 * - Fully encapsulated in a class with no global state pollution
 * - Maintains speed toggle state per voice
 */

(function() {
    'use strict';

    class SelectionPopupManager {
        /**
         * @param {string} iframeSelector - CSS selector for the target iframe
         */
        constructor(iframeSelector = '#bookFrame') {
            this.iframeSelector = iframeSelector;
            this.popup = null;
            this.iframe = null;
            this.abortController = null;      // For iframe-specific events
            this.parentAbortController = null; // For window events
            this.usSpeed = 1.0;
            this.ukSpeed = 1.0;
            this.isInitialized = false;
            this.mutationObserver = null;
            
            // Bind methods to preserve 'this' in event handlers
            this._onSelectionChange = this._onSelectionChange.bind(this);
            this._repositionHandler = this._repositionHandler.bind(this);
            this._onIframeLoad = this._onIframeLoad.bind(this);
            this._onDocumentClick = this._onDocumentClick.bind(this);
        }

        /**
         * Initializes the manager: creates popup element, starts observing iframe
         */
        init() {
            if (this.isInitialized) return;
            this._createPopupElement();
            this._startObservingIframe();
            this.isInitialized = true;
        }

        /**
         * Stops all observers, removes event listeners, hides popup
         */
        destroy() {
            this._cleanupIframeEvents();
            if (this.parentAbortController) {
                this.parentAbortController.abort();
                this.parentAbortController = null;
            }
            if (this.mutationObserver) {
                this.mutationObserver.disconnect();
                this.mutationObserver = null;
            }
            if (this.popup) {
                this.popup.remove();
                this.popup = null;
            }
            this.isInitialized = false;
            this.iframe = null;
        }

        // ----------------------------------------------------------------------
        // Private DOM & UI methods
        // ----------------------------------------------------------------------

        _createPopupElement() {
            if (this.popup) return;
            const div = document.createElement('div');
            div.id = 'medlib-selection-popup';
            div.className = 'medlib-selection-popup';
            div.setAttribute('role', 'toolbar');
            div.setAttribute('aria-label', 'Text selection actions');
            div.innerHTML = `
                <button type="button" class="popup-btn" id="popup-ask-nexus" data-action="ask">🤖 Ask Nexus</button>
                <button type="button" class="popup-btn" id="popup-us" data-action="us">🔊 US <span class="speed-indicator" id="popup-us-speed">1x</span></button>
                <button type="button" class="popup-btn" id="popup-uk" data-action="uk">🔊 UK <span class="speed-indicator" id="popup-uk-speed">1x</span></button>
                <button type="button" class="popup-btn" id="popup-add-note" data-action="note">📝 Add Note</button>
            `;
            document.body.appendChild(div);
            this.popup = div;
            this._attachButtonEvents();
        }

        _attachButtonEvents() {
            if (!this.popup) return;

            const askBtn = this.popup.querySelector('#popup-ask-nexus');
            const usBtn = this.popup.querySelector('#popup-us');
            const ukBtn = this.popup.querySelector('#popup-uk');
            const noteBtn = this.popup.querySelector('#popup-add-note');
            const usSpeedSpan = this.popup.querySelector('#popup-us-speed');
            const ukSpeedSpan = this.popup.querySelector('#popup-uk-speed');

            if (askBtn) {
                askBtn.onclick = () => {
                    const text = this.popup.getAttribute('data-text');
                    if (text) {
                        const input = document.getElementById('nexus-input');
                        if (input) input.value = text;
                        const panel = document.querySelector('.nexus-panel');
                        if (panel) panel.style.display = 'flex';
                        if (typeof window.sendMessage === 'function') {
                            window.sendMessage(text);
                        } else {
                            console.warn('Nexus not ready: window.sendMessage missing');
                            alert('Nexus not ready');
                        }
                    }
                    this._hidePopup();
                };
            }

            if (usBtn && usSpeedSpan) {
                usBtn.onclick = () => {
                    const text = this.popup.getAttribute('data-text');
                    if (text) {
                        // Toggle speed between 1.0 and 0.5
                        this.usSpeed = this.usSpeed === 1.0 ? 0.5 : 1.0;
                        usSpeedSpan.innerText = this.usSpeed === 1.0 ? '1x' : '½x';
                        
                        // Optional: expose speed globally for external speech handlers
                        if (typeof window.__medlibSpeechSpeed === 'undefined') {
                            window.__medlibSpeechSpeed = {};
                        }
                        window.__medlibSpeechSpeed.us = this.usSpeed;
                        
                        if (typeof window.speakUS === 'function') {
                            window.speakUS(text);
                        } else {
                            console.warn('Pronunciation not loaded: window.speakUS missing');
                            alert('Pronunciation not loaded');
                        }
                    }
                    this._hidePopup();
                };
            }

            if (ukBtn && ukSpeedSpan) {
                ukBtn.onclick = () => {
                    const text = this.popup.getAttribute('data-text');
                    if (text) {
                        this.ukSpeed = this.ukSpeed === 1.0 ? 0.5 : 1.0;
                        ukSpeedSpan.innerText = this.ukSpeed === 1.0 ? '1x' : '½x';
                        
                        if (typeof window.__medlibSpeechSpeed === 'undefined') {
                            window.__medlibSpeechSpeed = {};
                        }
                        window.__medlibSpeechSpeed.uk = this.ukSpeed;
                        
                        if (typeof window.speakUK === 'function') {
                            window.speakUK(text);
                        } else {
                            console.warn('Pronunciation not loaded: window.speakUK missing');
                            alert('Pronunciation not loaded');
                        }
                    }
                    this._hidePopup();
                };
            }

            if (noteBtn) {
                noteBtn.onclick = () => {
                    const text = this.popup.getAttribute('data-text');
                    if (text) {
                        if (typeof window.addAnnotation === 'function') {
                            window.addAnnotation(text);
                        } else {
                            console.warn('Add note not available: user may not be signed in');
                            alert('Please sign in to add notes');
                        }
                    }
                    this._hidePopup();
                };
            }
        }

        _positionPopup(rect, iframeRect) {
            if (!this.popup) return;
            const left = iframeRect.left + rect.left + window.scrollX + (rect.width / 2) - 70;
            const top = iframeRect.top + rect.top + window.scrollY - 50;
            this.popup.style.display = 'flex';
            this.popup.style.left = `${Math.max(10, left)}px`;
            this.popup.style.top = `${Math.max(10, top)}px`;
        }

        _hidePopup() {
            if (this.popup) this.popup.style.display = 'none';
        }

        // ----------------------------------------------------------------------
        // Selection & iframe event handling
        // ----------------------------------------------------------------------

        _getCurrentSelectionInfo() {
            if (!this.iframe || !this.iframe.contentDocument) return null;
            const doc = this.iframe.contentDocument;
            const sel = doc.getSelection();
            const text = sel?.toString().trim();
            if (!text) return null;
            
            try {
                const range = sel.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                if (rect && rect.width > 0 && rect.height > 0) {
                    return { text, rect };
                }
            } catch (e) {
                // Range may be invalid in some edge cases
                return null;
            }
            return null;
        }

        _updatePopup() {
            const selectionInfo = this._getCurrentSelectionInfo();
            if (selectionInfo) {
                const iframeRect = this.iframe.getBoundingClientRect();
                this._positionPopup(selectionInfo.rect, iframeRect);
                this.popup.setAttribute('data-text', selectionInfo.text);
            } else {
                this._hidePopup();
            }
        }

        _repositionHandler() {
            // Only reposition if popup is currently visible and there's an active selection
            if (this.popup && this.popup.style.display === 'flex') {
                this._updatePopup();
            }
        }

        _onSelectionChange() {
            this._updatePopup();
        }

        _onDocumentClick(event) {
            // Hide popup if clicked outside it
            if (this.popup && this.popup.style.display === 'flex') {
                if (!this.popup.contains(event.target)) {
                    this._hidePopup();
                }
            }
        }

        // ----------------------------------------------------------------------
        // Iframe event binding & cleanup
        // ----------------------------------------------------------------------

        _cleanupIframeEvents() {
            if (this.abortController) {
                this.abortController.abort();
                this.abortController = null;
            }
        }

        _attachEventsToIframe(iframe) {
            this._cleanupIframeEvents();
            
            const iframeDoc = iframe.contentDocument;
            const iframeWin = iframe.contentWindow;
            if (!iframeDoc || !iframeWin) return;

            const abortCtrl = new AbortController();
            this.abortController = abortCtrl;
            const { signal } = abortCtrl;

            // Listen to selection changes inside iframe
            iframeDoc.addEventListener('selectionchange', this._onSelectionChange, { signal });
            
            // Reposition on scroll inside iframe
            iframeWin.addEventListener('scroll', this._repositionHandler, { signal });
            
            // Reposition on window resize (viewport changes)
            window.addEventListener('resize', this._repositionHandler, { signal });
            
            // Reposition on parent window scroll
            window.addEventListener('scroll', this._repositionHandler, { signal });
            
            // Click outside detection: listen on parent document and iframe document
            document.addEventListener('click', this._onDocumentClick, { signal });
            iframeDoc.addEventListener('click', this._onDocumentClick, { signal });
        }

        _onIframeLoad() {
            if (!this.iframe || !this.iframe.contentDocument) return;
            this._attachEventsToIframe(this.iframe);
            // Immediately hide popup on navigation, selection will be cleared automatically
            this._hidePopup();
        }

        _setupIframe(iframe) {
            if (!iframe) return;
            this.iframe = iframe;
            
            // Remove previous load listener if any
            if (this._boundLoadHandler) {
                this.iframe.removeEventListener('load', this._boundLoadHandler);
            }
            this._boundLoadHandler = this._onIframeLoad;
            this.iframe.addEventListener('load', this._boundLoadHandler);
            
            // If iframe already loaded, attach events immediately
            if (this.iframe.contentDocument && this.iframe.contentDocument.readyState === 'complete') {
                this._onIframeLoad();
            }
        }

        // ----------------------------------------------------------------------
        // Iframe discovery (handles dynamic insertion)
        // ----------------------------------------------------------------------

        _startObservingIframe() {
            const existingIframe = document.querySelector(this.iframeSelector);
            if (existingIframe) {
                this._setupIframe(existingIframe);
            }
            
            // Watch for iframe being added dynamically
            this.mutationObserver = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const iframe = node.matches?.(this.iframeSelector) 
                                ? node 
                                : node.querySelector?.(this.iframeSelector);
                            if (iframe && !this.iframe) {
                                this._setupIframe(iframe);
                                return;
                            }
                        }
                    }
                    // Also handle case where iframe's id changes or attribute changes
                    if (mutation.type === 'attributes' && mutation.attributeName === 'id') {
                        const newIframe = document.querySelector(this.iframeSelector);
                        if (newIframe && newIframe !== this.iframe) {
                            this._setupIframe(newIframe);
                        }
                    }
                }
            });
            
            this.mutationObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['id']
            });
        }
    }

    // Auto-initialize when DOM is ready, ensuring we don't interfere with other scripts
    let manager = null;
    
    const initManager = () => {
        if (manager) {
            manager.destroy();
        }
        manager = new SelectionPopupManager('#bookFrame');
        manager.init();
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initManager);
    } else {
        initManager();
    }
    
    // Optional: expose cleanup for hot module replacement or manual control
    window.__medlibSelectionPopup = {
        destroy: () => {
            if (manager) {
                manager.destroy();
                manager = null;
            }
        },
        reinit: () => {
            if (manager) {
                manager.destroy();
            }
            manager = new SelectionPopupManager('#bookFrame');
            manager.init();
        }
    };
})();
