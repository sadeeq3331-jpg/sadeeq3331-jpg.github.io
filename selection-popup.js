/**
 * selection-popup.js – Modern, stable text selection popup for iframe content
 * 
 * Fixes:
 * - Prevents unexpected closure when clicking buttons or outside
 * - Uses debounced selection change detection to avoid flicker
 * - Stores selected text separately, survives focus loss
 * - Ignores hide when click target is inside popup
 * - Handles iframe reloads and dynamic content
 * - Clean event management with AbortController
 */
(function() {
    'use strict';

    class SelectionPopupManager {
        constructor(iframeSelector = '#bookFrame') {
            this.iframeSelector = iframeSelector;
            this.popup = null;
            this.iframe = null;
            this.abortController = null;
            this.parentAbortController = null;
            this.usSpeed = 1.0;
            this.ukSpeed = 1.0;
            this.isInitialized = false;
            this.mutationObserver = null;
            
            // Store current selected text separately to survive focus loss
            this.currentSelectedText = '';
            
            // Debounce timer for hiding popup
            this.hideDebounceTimer = null;
            
            // Flag to prevent immediate hide after showing
            this.justShown = false;
            this.justShownTimer = null;
            
            // Bind methods
            this._onSelectionChange = this._onSelectionChange.bind(this);
            this._repositionHandler = this._repositionHandler.bind(this);
            this._onIframeLoad = this._onIframeLoad.bind(this);
            this._onDocumentClick = this._onDocumentClick.bind(this);
            this._onIframeMouseUp = this._onIframeMouseUp.bind(this);
        }

        init() {
            if (this.isInitialized) return;
            this._createPopupElement();
            this._startObservingIframe();
            this.isInitialized = true;
        }

        destroy() {
            if (this.hideDebounceTimer) clearTimeout(this.hideDebounceTimer);
            if (this.justShownTimer) clearTimeout(this.justShownTimer);
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
        // UI Creation
        // ----------------------------------------------------------------------
        _createPopupElement() {
            if (this.popup) return;
            const div = document.createElement('div');
            div.id = 'medlib-selection-popup';
            div.className = 'medlib-selection-popup';
            div.setAttribute('role', 'toolbar');
            div.setAttribute('aria-label', 'Text selection actions');
            // Prevent popup from stealing focus and causing selection loss
            div.style.userSelect = 'none';
            div.addEventListener('mousedown', (e) => e.preventDefault());
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
                askBtn.onclick = (e) => {
                    e.stopPropagation();
                    const text = this.currentSelectedText;
                    if (text) {
                        const input = document.getElementById('nexus-input');
                        if (input) input.value = text;
                        const panel = document.querySelector('.nexus-panel');
                        if (panel) panel.style.display = 'flex';
                        if (typeof window.sendMessage === 'function') {
                            window.sendMessage(text);
                        } else {
                            console.warn('Nexus not ready');
                            alert('Nexus not ready');
                        }
                    }
                    this._hidePopup();
                };
            }

            if (usBtn && usSpeedSpan) {
                usBtn.onclick = (e) => {
                    e.stopPropagation();
                    const text = this.currentSelectedText;
                    if (text) {
                        this.usSpeed = this.usSpeed === 1.0 ? 0.5 : 1.0;
                        usSpeedSpan.innerText = this.usSpeed === 1.0 ? '1x' : '½x';
                        if (typeof window.__medlibSpeechSpeed === 'undefined') {
                            window.__medlibSpeechSpeed = {};
                        }
                        window.__medlibSpeechSpeed.us = this.usSpeed;
                        if (typeof window.speakUS === 'function') {
                            window.speakUS(text);
                        } else {
                            console.warn('Pronunciation not loaded');
                            alert('Pronunciation not loaded');
                        }
                    }
                    this._hidePopup();
                };
            }

            if (ukBtn && ukSpeedSpan) {
                ukBtn.onclick = (e) => {
                    e.stopPropagation();
                    const text = this.currentSelectedText;
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
                            console.warn('Pronunciation not loaded');
                            alert('Pronunciation not loaded');
                        }
                    }
                    this._hidePopup();
                };
            }

            if (noteBtn) {
                noteBtn.onclick = (e) => {
                    e.stopPropagation();
                    const text = this.currentSelectedText;
                    if (text) {
                        if (typeof window.addAnnotation === 'function') {
                            window.addAnnotation(text);
                        } else {
                            console.warn('Add note not available');
                            alert('Please sign in to add notes');
                        }
                    }
                    this._hidePopup();
                };
            }
        }

        // ----------------------------------------------------------------------
        // Positioning & Visibility
        // ----------------------------------------------------------------------
        _positionPopup(rect, iframeRect) {
            if (!this.popup) return;
            const left = iframeRect.left + rect.left + window.scrollX + (rect.width / 2) - 70;
            const top = iframeRect.top + rect.top + window.scrollY - 50;
            this.popup.style.display = 'flex';
            this.popup.style.left = `${Math.max(10, left)}px`;
            this.popup.style.top = `${Math.max(10, top)}px`;
        }

        _hidePopup() {
            // Clear any pending hide debounce
            if (this.hideDebounceTimer) clearTimeout(this.hideDebounceTimer);
            // Use a small delay to avoid hiding when selection is momentarily cleared
            // (e.g., when clicking a button, selection might be lost but we still want to keep popup)
            this.hideDebounceTimer = setTimeout(() => {
                // Re-check if there is still a selection before hiding
                if (this._hasSelection()) {
                    return; // Selection came back, keep popup
                }
                if (this.popup) this.popup.style.display = 'none';
                this.currentSelectedText = '';
            }, 150);
        }

        _showPopup(rect, iframeRect, text) {
            // Clear any pending hide
            if (this.hideDebounceTimer) clearTimeout(this.hideDebounceTimer);
            this.currentSelectedText = text;
            this._positionPopup(rect, iframeRect);
            
            // Set a flag to prevent hide from selectionchange that fires immediately after
            this.justShown = true;
            if (this.justShownTimer) clearTimeout(this.justShownTimer);
            this.justShownTimer = setTimeout(() => {
                this.justShown = false;
            }, 300);
        }

        // ----------------------------------------------------------------------
        // Selection Helpers
        // ----------------------------------------------------------------------
        _hasSelection() {
            if (!this.iframe || !this.iframe.contentDocument) return false;
            const doc = this.iframe.contentDocument;
            const sel = doc.getSelection();
            const text = sel?.toString().trim();
            return !!text;
        }

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
                return null;
            }
            return null;
        }

        _updatePopup() {
            const selectionInfo = this._getCurrentSelectionInfo();
            if (selectionInfo) {
                const iframeRect = this.iframe.getBoundingClientRect();
                this._showPopup(selectionInfo.rect, iframeRect, selectionInfo.text);
            } else {
                // Only hide if we're not in "just shown" grace period
                if (!this.justShown) {
                    this._hidePopup();
                }
            }
        }

        // ----------------------------------------------------------------------
        // Event Handlers
        // ----------------------------------------------------------------------
        _repositionHandler() {
            if (this.popup && this.popup.style.display === 'flex' && this.currentSelectedText) {
                const selectionInfo = this._getCurrentSelectionInfo();
                if (selectionInfo) {
                    const iframeRect = this.iframe.getBoundingClientRect();
                    this._positionPopup(selectionInfo.rect, iframeRect);
                }
            }
        }

        _onSelectionChange() {
            this._updatePopup();
        }

        // Special handling for mouseup to capture selection right after user finishes selecting
        _onIframeMouseUp() {
            // Give browser time to fully update selection
            setTimeout(() => this._updatePopup(), 10);
        }

        _onDocumentClick(event) {
            // If click is inside popup, do nothing (popup should stay)
            if (this.popup && this.popup.contains(event.target)) {
                return;
            }
            // Otherwise, hide after a tiny delay (to allow selection to be re-evaluated)
            setTimeout(() => {
                if (!this._hasSelection()) {
                    this._hidePopup();
                }
            }, 50);
        }

        // ----------------------------------------------------------------------
        // Iframe Event Binding
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

            // Primary selection change event
            iframeDoc.addEventListener('selectionchange', this._onSelectionChange, { signal });
            // Mouseup to catch selection end reliably
            iframeDoc.addEventListener('mouseup', this._onIframeMouseUp, { signal });
            
            // Reposition on scroll/resize
            iframeWin.addEventListener('scroll', this._repositionHandler, { signal });
            window.addEventListener('resize', this._repositionHandler, { signal });
            window.addEventListener('scroll', this._repositionHandler, { signal });
            
            // Click outside detection (both parent and iframe)
            document.addEventListener('click', this._onDocumentClick, { signal });
            iframeDoc.addEventListener('click', this._onDocumentClick, { signal });
            
            // Also watch for keyup (e.g., Ctrl+A select all)
            iframeDoc.addEventListener('keyup', () => setTimeout(() => this._updatePopup(), 20), { signal });
        }

        _onIframeLoad() {
            if (!this.iframe || !this.iframe.contentDocument) return;
            this._attachEventsToIframe(this.iframe);
            this._hidePopup(); // Clear any stale popup
        }

        _setupIframe(iframe) {
            if (!iframe) return;
            this.iframe = iframe;
            
            if (this._boundLoadHandler) {
                this.iframe.removeEventListener('load', this._boundLoadHandler);
            }
            this._boundLoadHandler = this._onIframeLoad;
            this.iframe.addEventListener('load', this._boundLoadHandler);
            
            if (this.iframe.contentDocument && this.iframe.contentDocument.readyState === 'complete') {
                this._onIframeLoad();
            }
        }

        // ----------------------------------------------------------------------
        // Iframe Discovery
        // ----------------------------------------------------------------------
        _startObservingIframe() {
            const existingIframe = document.querySelector(this.iframeSelector);
            if (existingIframe) {
                this._setupIframe(existingIframe);
            }
            
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

    // Auto-initialize
    let manager = null;
    const initManager = () => {
        if (manager) manager.destroy();
        manager = new SelectionPopupManager('#bookFrame');
        manager.init();
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initManager);
    } else {
        initManager();
    }
    
    window.__medlibSelectionPopup = {
        destroy: () => {
            if (manager) {
                manager.destroy();
                manager = null;
            }
        },
        reinit: () => {
            if (manager) manager.destroy();
            manager = new SelectionPopupManager('#bookFrame');
            manager.init();
        }
    };
})();
