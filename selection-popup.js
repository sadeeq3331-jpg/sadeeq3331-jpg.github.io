/**
 * selection-popup.js – v2.0 (fixed: stable, reliable, no flicker)
 */
(function() {
    'use strict';

    class SelectionPopupManager {
        constructor(iframeSelector = '#bookFrame') {
            this.iframeSelector = iframeSelector;
            this.popup = null;
            this.iframe = null;
            this.abortController = null;
            this.currentSelectedText = '';
            this.hideTimer = null;
            this.isVisible = false;
            this._boundOnIframeLoad = this._onIframeLoad.bind(this);
            this._boundOnSelectionChange = this._onSelectionChange.bind(this);
            this._boundOnDocumentClick = this._onDocumentClick.bind(this);
            this._boundOnMouseUp = this._onMouseUp.bind(this);
            this._boundOnScroll = this._onScroll.bind(this);
        }

        init() {
            this._createPopup();
            this._startObserving();
        }

        destroy() {
            if (this.hideTimer) clearTimeout(this.hideTimer);
            if (this.abortController) this.abortController.abort();
            if (this.iframe) {
                this.iframe.removeEventListener('load', this._boundOnIframeLoad);
            }
            if (this.popup) this.popup.remove();
            this.popup = null;
            this.iframe = null;
        }

        // ---- Popup DOM ----
        _createPopup() {
            if (this.popup) return;
            const div = document.createElement('div');
            div.id = 'medlib-selection-popup';
            div.className = 'medlib-selection-popup';
            div.setAttribute('role', 'toolbar');
            div.style.cssText = `
                position: fixed; z-index: 10002;
                display: none;
                background: rgba(255,255,255,0.95);
                backdrop-filter: blur(8px);
                border-radius: 12px;
                box-shadow: 0 8px 30px rgba(0,0,0,0.15);
                padding: 6px 10px;
                gap: 6px;
                align-items: center;
                border: 1px solid rgba(0,0,0,0.08);
                user-select: none;
                pointer-events: auto;
            `;
            div.innerHTML = `
                <button type="button" class="popup-btn" data-action="ask">🤖 Ask Nexus</button>
                <button type="button" class="popup-btn" data-action="us">🔊 US <span class="speed-indicator">1x</span></button>
                <button type="button" class="popup-btn" data-action="uk">🔊 UK <span class="speed-indicator">1x</span></button>
                <button type="button" class="popup-btn" data-action="note">📝 Add Note</button>
            `;
            document.body.appendChild(div);
            this.popup = div;

            // Attach button events (stop propagation to keep popup open)
            div.querySelectorAll('.popup-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._handleAction(btn.dataset.action);
                });
                // Prevent mouseup from stealing selection
                btn.addEventListener('mousedown', e => e.preventDefault());
            });

            // Click inside popup should not hide it
            div.addEventListener('click', e => e.stopPropagation());
        }

        // ---- Action handlers ----
        _handleAction(action) {
            const text = this.currentSelectedText;
            if (!text) {
                this._hidePopup();
                return;
            }

            switch (action) {
                case 'ask':
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
                    break;

                case 'us':
                    if (typeof window.speakUS === 'function') {
                        // toggle speed
                        if (!window.__medlibSpeechSpeed) window.__medlibSpeechSpeed = {};
                        const speed = window.__medlibSpeechSpeed.us || 1.0;
                        const newSpeed = speed === 1.0 ? 0.5 : 1.0;
                        window.__medlibSpeechSpeed.us = newSpeed;
                        const indicator = this.popup.querySelector('[data-action="us"] .speed-indicator');
                        if (indicator) indicator.textContent = newSpeed === 1.0 ? '1x' : '½x';
                        window.speakUS(text);
                    } else {
                        alert('Pronunciation not loaded');
                    }
                    break;

                case 'uk':
                    if (typeof window.speakUK === 'function') {
                        if (!window.__medlibSpeechSpeed) window.__medlibSpeechSpeed = {};
                        const speed = window.__medlibSpeechSpeed.uk || 1.0;
                        const newSpeed = speed === 1.0 ? 0.5 : 1.0;
                        window.__medlibSpeechSpeed.uk = newSpeed;
                        const indicator = this.popup.querySelector('[data-action="uk"] .speed-indicator');
                        if (indicator) indicator.textContent = newSpeed === 1.0 ? '1x' : '½x';
                        window.speakUK(text);
                    } else {
                        alert('Pronunciation not loaded');
                    }
                    break;

                case 'note':
                    if (typeof window.addAnnotation === 'function') {
                        window.addAnnotation(text);
                    } else {
                        alert('Please sign in to add notes');
                    }
                    break;
            }
            // Keep popup open after action (user may want to do more)
            // But we'll hide after a short delay if they click away.
        }

        // ---- Show / Hide ----
        _showPopup(rect, text) {
            if (!this.popup) return;
            this.currentSelectedText = text;
            // Position popup
            const left = rect.left + window.scrollX + rect.width / 2 - 80;
            const top = rect.top + window.scrollY - 50;
            this.popup.style.left = `${Math.max(10, left)}px`;
            this.popup.style.top = `${Math.max(10, top)}px`;
            this.popup.style.display = 'flex';
            this.isVisible = true;
            // Clear any pending hide timer
            if (this.hideTimer) clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }

        _hidePopup(delay = 100) {
            if (this.hideTimer) clearTimeout(this.hideTimer);
            this.hideTimer = setTimeout(() => {
                // Only hide if there's no selection or we're not hovering the popup
                if (this.popup && !this.isVisible) return;
                // Check if selection still exists
                if (this._getSelectedText()) {
                    // Selection still exists, keep popup
                    this.hideTimer = null;
                    return;
                }
                // Also, if mouse is over the popup, don't hide
                // (We'll rely on mouseenter/leave later)
                this.popup.style.display = 'none';
                this.isVisible = false;
                this.currentSelectedText = '';
                this.hideTimer = null;
            }, delay);
        }

        // ---- Selection helpers ----
        _getSelectedText() {
            if (!this.iframe) return '';
            try {
                const doc = this.iframe.contentDocument;
                if (!doc) return '';
                const sel = doc.getSelection();
                return sel ? sel.toString().trim() : '';
            } catch (e) {
                return '';
            }
        }

        _getSelectionRect() {
            if (!this.iframe) return null;
            try {
                const doc = this.iframe.contentDocument;
                if (!doc) return null;
                const sel = doc.getSelection();
                if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
                const range = sel.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                if (rect && rect.width > 0 && rect.height > 0) {
                    return rect;
                }
                // Fallback: get client rects
                const rects = range.getClientRects();
                if (rects.length) {
                    return rects[0];
                }
                return null;
            } catch (e) {
                return null;
            }
        }

        // ---- Event handlers ----
        _onSelectionChange() {
            const text = this._getSelectedText();
            const rect = this._getSelectionRect();
            if (text && rect) {
                this._showPopup(rect, text);
            } else {
                // If no selection, hide after a short delay (to avoid flicker on click)
                this._hidePopup(150);
            }
        }

        _onMouseUp() {
            // When user releases mouse, selection is finalized
            // Give browser time to update selection
            setTimeout(() => this._onSelectionChange(), 10);
        }

        _onDocumentClick(e) {
            // If click is inside popup, keep it open
            if (this.popup && this.popup.contains(e.target)) {
                return;
            }
            // If click is inside iframe, we might have lost selection or made a new one
            // Let selectionchange handle it, but we can hide if there's no selection after a moment
            setTimeout(() => {
                if (!this._getSelectedText()) {
                    this._hidePopup(50);
                }
            }, 50);
        }

        _onScroll() {
            // Reposition if popup is visible
            if (this.isVisible && this.popup.style.display === 'flex') {
                const rect = this._getSelectionRect();
                if (rect) {
                    this.popup.style.left = `${rect.left + window.scrollX + rect.width/2 - 80}px`;
                    this.popup.style.top = `${rect.top + window.scrollY - 50}px`;
                } else {
                    this._hidePopup(100);
                }
            }
        }

        // ---- Attach to iframe ----
        _attachEvents(iframe) {
            if (!iframe) return;
            if (this.abortController) this.abortController.abort();
            this.abortController = new AbortController();
            const signal = this.abortController.signal;

            try {
                const doc = iframe.contentDocument;
                const win = iframe.contentWindow;
                if (!doc || !win) return;

                // Selection change
                doc.addEventListener('selectionchange', this._boundOnSelectionChange, { signal });
                // Mouse up to catch final selection
                doc.addEventListener('mouseup', this._boundOnMouseUp, { signal });
                // Click outside (document and iframe)
                document.addEventListener('click', this._boundOnDocumentClick, { signal });
                doc.addEventListener('click', this._boundOnDocumentClick, { signal });
                // Scroll events
                win.addEventListener('scroll', this._boundOnScroll, { signal });
                window.addEventListener('scroll', this._boundOnScroll, { signal });
                window.addEventListener('resize', this._boundOnScroll, { signal });
            } catch (e) {
                console.warn('Could not attach events to iframe:', e);
            }
        }

        _onIframeLoad() {
            if (!this.iframe) return;
            this._attachEvents(this.iframe);
            // Clear any stale popup
            this._hidePopup(0);
        }

        _setupIframe(iframe) {
            if (!iframe) return;
            if (this.iframe) {
                this.iframe.removeEventListener('load', this._boundOnIframeLoad);
            }
            this.iframe = iframe;
            this.iframe.addEventListener('load', this._boundOnIframeLoad);
            // If iframe already loaded, attach immediately
            if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                this._onIframeLoad();
            }
        }

        // ---- Observer ----
        _startObserving() {
            const existing = document.querySelector(this.iframeSelector);
            if (existing) {
                this._setupIframe(existing);
            }

            const observer = new MutationObserver((mutations) => {
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
                    if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                        const iframe = document.querySelector(this.iframeSelector);
                        if (iframe && iframe !== this.iframe) {
                            this._setupIframe(iframe);
                        }
                    }
                }
            });
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src', 'id']
            });
        }
    }

    // Initialize
    let manager = null;
    function init() {
        if (manager) manager.destroy();
        manager = new SelectionPopupManager('#bookFrame');
        manager.init();
        console.log('✅ Selection popup initialized');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose for debugging
    window.__selectionPopup = { manager, reinit: init };
})();
