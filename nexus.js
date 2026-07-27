// nexus.js – v3.0 (clean output, expanded explanations, modern responsive UI)
(function() {
    const STORAGE_KEY = 'nexus_conversations';
    const MAX_MESSAGE_LENGTH = 1000;
    const MAX_HISTORY_MESSAGES = 20;

    let conversations = [];
    let currentConvId = null;
    let isWaiting = false;
    let pinnedMessages = [];
    let currentSearch = '';
    let fontSize = 16;
    let panelDarkMode = false;
    let personality = 'detailed';
    let sidebarOpen = true;
    let currentModelId = null;

    // ---------- CLEAN OUTPUT: strip markdown and keep plain text ----------
    function cleanText(text) {
        if (!text) return text;
        // Remove markdown headers (#, ##, etc.)
        let cleaned = text.replace(/^#{1,6}\s*/gm, '');
        // Remove bold/italic markers (** and *)
        cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
        cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
        // Remove underscores for emphasis
        cleaned = cleaned.replace(/_(.+?)_/g, '$1');
        // Remove inline code backticks
        cleaned = cleaned.replace(/`(.+?)`/g, '$1');
        // Remove code blocks (``` ... ```)
        cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
        // Convert bullet lists: lines starting with - or * or + or number.
        // We'll keep them as plain text with a dash.
        cleaned = cleaned.replace(/^[\s]*[-*+]\s+/gm, '• ');
        cleaned = cleaned.replace(/^[\s]*\d+\.\s+/gm, (match) => match.trim() + ' ');
        // Remove horizontal rules (---, ***, ___)
        cleaned = cleaned.replace(/^[\s]*[-*_]{3,}[\s]*$/gm, '');
        // Collapse multiple newlines to two max
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
        return cleaned.trim();
    }

    // ---------- FORMAT FOR DISPLAY (plain text with <br>) ----------
    function formatText(text) {
        if (!text) return text;
        // First clean markdown
        let cleaned = cleanText(text);
        // Convert newlines to <br>
        return cleaned.replace(/\n/g, '<br>');
    }

    // ---------- ORIGINAL HELPERS (unchanged) ----------
    function truncateText(text, maxLen = 300) {
        if (text.length <= maxLen) return text;
        return text.substring(0, maxLen) + '…';
    }

    function loadConversations() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                conversations = JSON.parse(stored);
                conversations.forEach(c => {
                    if (!c.id) c.id = Date.now() + Math.random();
                    if (!c.name) c.name = 'Chat';
                    if (!c.messages) c.messages = [];
                });
            } catch (e) { conversations = []; }
        }
        if (conversations.length === 0) {
            conversations.push({
                id: Date.now(),
                name: 'New Chat',
                messages: [{ role: 'assistant', content: '👋 Hi, I’m Nexus! Ask me anything about medicine.', timestamp: Date.now() }]
            });
        }
        if (!currentConvId) currentConvId = conversations[0].id;
        const storedPinned = localStorage.getItem('nexus_pinned');
        if (storedPinned) pinnedMessages = JSON.parse(storedPinned);
    }

    function saveConversations() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
        if (typeof window.syncConversationsUpdate === 'function') {
            window.syncConversationsUpdate(conversations);
        }
    }

    window.reloadNexusConversations = function(newConvs) {
        if (newConvs && newConvs.length) {
            conversations = newConvs;
            if (!currentConvId || !conversations.find(c => c.id === currentConvId)) {
                currentConvId = conversations[0].id;
            }
            renderSidebar();
            renderMessages();
        }
    };

    function savePinned() { localStorage.setItem('nexus_pinned', JSON.stringify(pinnedMessages)); }
    function getCurrentConv() { return conversations.find(c => c.id === currentConvId); }

    function addMessage(role, content) {
        const conv = getCurrentConv();
        if (!conv) return;
        conv.messages.push({ role, content, timestamp: Date.now() });
        saveConversations();
        renderMessages();
        renderSidebar();
        updateStats();
    }

    function deleteMessage(index) {
        const conv = getCurrentConv();
        if (!conv) return;
        pinnedMessages = pinnedMessages.filter(p => p.convId !== currentConvId || p.idx !== index);
        conv.messages.splice(index, 1);
        saveConversations();
        savePinned();
        renderMessages();
        renderSidebar();
        updateStats();
    }

    function editUserMessage(index, newContent) {
        if (!newContent) return;
        const conv = getCurrentConv();
        if (!conv || conv.messages[index]?.role !== 'user') return;
        conv.messages[index].content = newContent;
        if (index + 1 < conv.messages.length && conv.messages[index+1].role === 'assistant') {
            conv.messages.splice(index+1, 1);
        }
        saveConversations();
        renderMessages();
        sendMessage(newContent, true);
    }

    function togglePinMessage(idx) {
        const conv = getCurrentConv();
        const msg = conv.messages[idx];
        if (!msg || msg.role !== 'assistant') return;
        const existingIdx = pinnedMessages.findIndex(p => p.convId === currentConvId && p.idx === idx);
        if (existingIdx !== -1) {
            pinnedMessages.splice(existingIdx, 1);
        } else {
            pinnedMessages.push({ convId: currentConvId, idx, content: msg.content });
        }
        savePinned();
        renderSidebar();
        renderMessages();
    }

    function isPinned(idx) { return pinnedMessages.some(p => p.convId === currentConvId && p.idx === idx); }

    // ---------- RENDER SIDEBAR (unchanged but with updated CSS) ----------
    function renderSidebar() {
        const sidebar = document.getElementById('nexus-sidebar');
        if (!sidebar) return;
        let html = `<div class="sidebar-section">
            <div class="section-title">📋 Chats</div>
            <div class="conv-list">`;
        conversations.forEach(c => {
            const active = c.id === currentConvId ? 'active' : '';
            html += `<div class="conv-item ${active}" data-id="${c.id}" ondblclick="window.renameConversationPrompt(${c.id})">
                <span class="conv-name">${escapeHtml(c.name)}</span>
                <span class="conv-actions">
                    <button class="icon-btn delete-conv" data-id="${c.id}" title="Delete">🗑️</button>
                </span>
            </div>`;
        });
        html += `</div>
            <button class="icon-btn new-chat-sidebar" id="new-chat-sidebar">➕ New Chat</button>
        </div>
        <div class="sidebar-section pinned-section-sidebar">
            <div class="section-title">📌 Pinned Notes</div>`;
        const pinnedForConv = pinnedMessages.filter(p => p.convId === currentConvId);
        if (pinnedForConv.length === 0) {
            html += `<div class="muted">No pinned notes</div>`;
        } else {
            pinnedForConv.forEach(p => {
                const snippet = truncateText(p.content, 60);
                html += `<div class="pinned-note-item" onclick="window.scrollToMessage(${p.idx})">📌 ${escapeHtml(snippet)}</div>`;
            });
        }
        html += `</div>
        <div class="sidebar-section settings-section">
            <div class="section-title">⚙️ Settings</div>
            <div class="setting-row">
                <label>Personality</label>
                <select id="sidebar-personality">
                    <option value="detailed" ${personality === 'detailed' ? 'selected' : ''}>📘 Detailed</option>
                    <option value="concise" ${personality === 'concise' ? 'selected' : ''}>📝 Concise</option>
                    <option value="usmle" ${personality === 'usmle' ? 'selected' : ''}>🎯 USMLE</option>
                    <option value="study" ${personality === 'study' ? 'selected' : ''}>📗 Study Mode</option>
                </select>
            </div>
            <div class="setting-row">
                <span>Dark Mode</span>
                <label class="toggle-switch">
                    <input type="checkbox" id="sidebar-dark-toggle" ${panelDarkMode ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
            <div class="setting-row">
                <span>Font Size</span>
                <div class="font-controls">
                    <button id="font-minus">A-</button>
                    <button id="font-plus">A+</button>
                </div>
            </div>
        </div>`;
        sidebar.innerHTML = html;

        document.querySelectorAll('.conv-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                if (e.target.closest('.delete-conv')) return;
                const id = Number(item.dataset.id);
                if (id !== currentConvId) {
                    currentConvId = id;
                    saveConversations();
                    renderAll();
                }
            });
        });
        document.querySelectorAll('.delete-conv').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = Number(btn.dataset.id);
                deleteConversation(id);
            });
        });
        document.getElementById('new-chat-sidebar')?.addEventListener('click', (e) => {
            e.stopPropagation();
            newConversation();
        });
        document.getElementById('sidebar-personality')?.addEventListener('change', (e) => {
            personality = e.target.value;
        });
        document.getElementById('sidebar-dark-toggle')?.addEventListener('change', togglePanelDarkMode);
        document.getElementById('font-minus')?.addEventListener('click', (e) => {
            e.stopPropagation();
            setFontSize(-2);
        });
        document.getElementById('font-plus')?.addEventListener('click', (e) => {
            e.stopPropagation();
            setFontSize(2);
        });
    }

    function renderAll() {
        renderSidebar();
        renderMessages();
        updateStats();
        updateContextSuggestions();
    }

    function renderMessages() {
        const msgsDiv = document.getElementById('nexus-messages');
        if (!msgsDiv) return;
        const conv = getCurrentConv();
        if (!conv) return;
        let filtered = conv.messages;
        if (currentSearch) filtered = conv.messages.filter(m => m.content.toLowerCase().includes(currentSearch));
        let html = '';
        filtered.forEach((msg, filteredIdx) => {
            const originalIdx = conv.messages.indexOf(msg);
            const isUser = msg.role === 'user';
            const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const avatar = isUser ? '👤' : '🤖';
            const fullContent = msg.content;
            const isLong = fullContent.length > 400;
            const contentHtml = isLong ? truncateText(fullContent, 400) : formatText(fullContent);
            const pinned = isPinned(originalIdx);
            html += `
                <div class="message ${msg.role}" data-idx="${originalIdx}">
                    <div class="avatar">${avatar}</div>
                    <div class="bubble-wrapper">
                        <div class="message-bubble" style="font-size:${fontSize}px">
                            <div class="message-content ${isLong ? 'truncated' : ''}" id="msg-content-${originalIdx}">
                                ${contentHtml}
                            </div>
                            ${isLong ? `<button class="read-more" data-idx="${originalIdx}">Read more</button>` : ''}
                        </div>
                        <div class="message-actions">
                            ${!isUser ? `<button class="icon-btn pin-btn" data-idx="${originalIdx}" title="${pinned ? 'Unpin' : 'Pin'}">${pinned ? '📌' : '📍'}</button>` : ''}
                            <button class="icon-btn copy-btn" data-idx="${originalIdx}" title="Copy">📋</button>
                            ${isUser ? `<button class="icon-btn edit-btn" data-idx="${originalIdx}" title="Edit">✏️</button>` : `<button class="icon-btn quote-btn" data-idx="${originalIdx}" title="Quote reply">💬</button>`}
                            <button class="icon-btn delete-btn" data-idx="${originalIdx}" title="Delete">🗑️</button>
                        </div>
                        <div class="timestamp">${time}</div>
                    </div>
                </div>`;
        });
        if (isWaiting) {
            html += `<div class="message assistant typing">
                <div class="avatar">🤖</div>
                <div class="bubble-wrapper"><div class="message-bubble typing-indicator"><span>.</span><span>.</span><span>.</span></div></div>
            </div>`;
        }
        msgsDiv.innerHTML = html;

        msgsDiv.querySelectorAll('.read-more').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.idx);
                window.toggleReadMore(idx);
            });
        });
        msgsDiv.querySelectorAll('.pin-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.togglePinMessage(parseInt(btn.dataset.idx));
            });
        });
        msgsDiv.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.copyMessageContent(parseInt(btn.dataset.idx));
            });
        });
        msgsDiv.querySelectorAll('.quote-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.quoteMessage(parseInt(btn.dataset.idx));
            });
        });
        msgsDiv.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.deleteMessage(parseInt(btn.dataset.idx));
            });
        });
        msgsDiv.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.idx);
                const conv = getCurrentConv();
                if (!conv || !conv.messages[idx]) return;
                const newContent = prompt('Edit your message:', conv.messages[idx].content);
                if (newContent && newContent.trim()) {
                    window.editUserMessage(idx, newContent.trim());
                }
            });
        });

        msgsDiv.scrollTop = msgsDiv.scrollHeight;
    }

    window.toggleReadMore = function(idx) {
        const conv = getCurrentConv();
        if (!conv || !conv.messages[idx]) return;
        const contentEl = document.getElementById(`msg-content-${idx}`);
        if (!contentEl) return;
        if (contentEl.classList.contains('truncated')) {
            contentEl.innerHTML = formatText(conv.messages[idx].content);
            contentEl.classList.remove('truncated');
        } else {
            contentEl.innerHTML = truncateText(conv.messages[idx].content, 400);
            contentEl.classList.add('truncated');
        }
    };

    function updateStats() {
        const conv = getCurrentConv();
        if (!conv) return;
        const msgCount = conv.messages.length;
        const wordCount = conv.messages.reduce((sum, m) => sum + m.content.split(/\s+/).length, 0);
        const statsEl = document.getElementById('nexus-stats');
        if (statsEl) statsEl.innerText = `${msgCount} msgs · ~${wordCount} words`;
    }

    function updateContextSuggestions() {
        const container = document.getElementById('suggestions');
        if (!container) return;
        const allSuggestions = [
            'Explain Krebs cycle',
            'ACE inhibitors',
            'Treat hypertension',
        ];
        container.innerHTML = allSuggestions.slice(0,3).map(s => 
            `<div class="suggestion-chip" data-question="${escapeHtml(s)}">🧬 ${escapeHtml(s)}</div>`
        ).join('');
        document.querySelectorAll('.suggestion-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                const q = chip.getAttribute('data-question');
                if (q) {
                    document.getElementById('nexus-input').value = q;
                    sendMessage(q);
                }
            });
        });
    }

    function quoteMessage(idx) {
        const conv = getCurrentConv();
        if (!conv || !conv.messages[idx]) return;
        const msg = conv.messages[idx];
        const quoted = `> ${msg.content.replace(/\n/g, '\n> ')}`;
        const input = document.getElementById('nexus-input');
        if (input) {
            input.value = input.value ? `${input.value}\n${quoted}` : quoted;
            input.focus();
        }
    }

    function copyMessageContent(idx) {
        const conv = getCurrentConv();
        if (!conv) return;
        navigator.clipboard.writeText(conv.messages[idx].content).then(() => showToast('Copied!')).catch(() => showToast('Copy failed'));
    }

    // ---------- MODEL SELECTION (latest first) ----------
    async function getBestModel() {
        if (currentModelId) return currentModelId;
        try {
            const models = await puter.ai.listModels();
            const preferred = [
                'google/gemini-3.1-flash-lite',
                'google/gemini-2.5-flash-lite-001',
                'google/gemini-2.0-flash-lite-001',
                'gpt-5.4-nano'
            ];
            for (const preferredId of preferred) {
                if (models.some(m => m.id === preferredId)) {
                    currentModelId = preferredId;
                    return currentModelId;
                }
            }
            const geminiModel = models.find(m => m.id.toLowerCase().includes('gemini'));
            if (geminiModel) {
                currentModelId = geminiModel.id;
                return currentModelId;
            }
            if (models.length > 0) {
                currentModelId = models[0].id;
                return currentModelId;
            }
            throw new Error('No chat models available');
        } catch (err) {
            console.warn('Model listing failed, using safe default', err);
            currentModelId = 'google/gemini-3.1-flash-lite';
            return currentModelId;
        }
    }

    // ---------- SEND MESSAGE WITH IMPROVED PERSONALITIES ----------
    async function sendMessage(initialText = null, isRegenerate = false) {
        const input = document.getElementById('nexus-input');
        const text = initialText || (input ? input.value.trim() : '');
        if (!text || isWaiting) return;

        let puterReady = false;
        for (let i = 0; i < 5; i++) {
            if (window.puter && window.puter.ai) { puterReady = true; break; }
            await new Promise(r => setTimeout(r, 1000));
        }
        if (!puterReady) {
            addMessage('assistant', 'Nexus is not ready. Please refresh the page and try again.');
            return;
        }
        if (input) input.value = '';
        if (!isRegenerate) addMessage('user', text);
        isWaiting = true;
        renderMessages();

        let personalityInstruction = '';
        if (personality === 'concise') {
            personalityInstruction = `Be concise and direct. Use short sentences and bullet points when helpful. Avoid unnecessary details.`;
        } else if (personality === 'usmle') {
            personalityInstruction = `Focus on high‑yield USMLE content. Emphasize mechanisms, clinical correlations, and exam tips. 
When you use an abbreviation, write the full term first (e.g., "glomerular filtration rate (GFR)"). Keep explanations clear and actionable.`;
        } else if (personality === 'study') {
            personalityInstruction = `You are a medical tutor in Study Mode. Ask the user one concept-based question at a time. Wait for their answer. Then provide brief feedback and ask a follow‑up question to deepen understanding. Keep it conversational, step‑by‑step. Never give away the full answer immediately; guide them to reason. Use plain language and explain any technical terms.`;
        } else { // detailed (default)
            personalityInstruction = `Provide thorough, well‑structured explanations. 
- Use simple, plain language suitable for a beginner medical student.
- Always write out abbreviations in full the first time (e.g., "glomerular filtration rate (GFR)").
- Explain the "why" behind each fact.
- Include clinical context and examples where helpful.
- Break down complex topics into manageable parts.
- Avoid medical jargon unless you define it clearly.`;
        }

        const systemPrompt = `You are a medical expert assistant called Nexus, designed exclusively for healthcare professionals and medical students. You ONLY answer questions related to medicine, physiology, pathology, pharmacology, clinical practice, and medical sciences.

For ANY non-medical question, respond with: "I'm a medical assistant and can only answer questions related to medicine and healthcare. Please ask a medical question."

Guidelines:
- Provide accurate, evidence-based medical information.
- Include relevant clinical context when appropriate.
- If a term has both medical and non-medical meanings, always interpret it in the medical context.
- Be educational and clear.
- Use proper medical terminology but explain when necessary.
- If uncertain, acknowledge limitations.

${personalityInstruction}`;

        const conv = getCurrentConv();
        if (!conv) { isWaiting = false; return; }

        const history = [];
        const messagesToInclude = conv.messages.slice(-MAX_HISTORY_MESSAGES);
        for (const msg of messagesToInclude) {
            if (isRegenerate && msg.role === 'assistant' && msg === conv.messages[conv.messages.length-1]) continue;
            history.push({ role: msg.role, content: msg.content });
        }

        const chatMessages = [
            { role: 'system', content: systemPrompt },
            ...history
        ];

        try {
            const modelId = await getBestModel();
            const raw = await puter.ai.chat(chatMessages, { model: modelId });
            let rawContent = raw?.message?.content || raw?.content || JSON.stringify(raw);
            // Clean markdown before adding
            const clean = cleanText(rawContent);
            isWaiting = false;
            addMessage('assistant', clean);
        } catch (e) {
            isWaiting = false;
            addMessage('assistant', 'Nexus error: ' + e.message);
        }
    }

    // ---------- CONVERSATION MANAGEMENT (unchanged) ----------
    function newConversation() {
        const id = Date.now();
        conversations.push({
            id,
            name: 'Chat ' + (conversations.length + 1),
            messages: [{ role: 'assistant', content: '👋 Hi, I’m Nexus! Ask me anything about medicine.', timestamp: Date.now() }]
        });
        currentConvId = id;
        saveConversations();
        renderAll();
    }

    function deleteConversation(id) {
        if (conversations.length <= 1) return;
        const idx = conversations.findIndex(c => c.id === id);
        if (idx === -1) return;
        conversations.splice(idx, 1);
        if (currentConvId === id) currentConvId = conversations[0].id;
        pinnedMessages = pinnedMessages.filter(p => p.convId !== id);
        saveConversations();
        savePinned();
        renderAll();
    }

    window.renameConversationPrompt = function(id) {
        const conv = conversations.find(c => c.id === id);
        if (!conv) return;
        const newName = prompt('Rename conversation:', conv.name);
        if (newName && newName.trim()) {
            conv.name = newName.trim();
            saveConversations();
            renderSidebar();
            const headerName = document.getElementById('current-conv-name');
            if (headerName && currentConvId === id) headerName.textContent = conv.name;
        }
    };

    function exportConversation() {
        const conv = getCurrentConv();
        if (!conv) return;
        let text = `Conversation: ${conv.name}\nExported: ${new Date().toLocaleString()}\n\n`;
        conv.messages.forEach(m => {
            const role = m.role === 'user' ? 'You' : 'Nexus';
            const time = new Date(m.timestamp).toLocaleTimeString();
            text += `[${role}] (${time}):\n${m.content}\n\n`;
        });
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nexus-${conv.name.replace(/\s+/g, '_')}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function shareConversation() {
        const conv = getCurrentConv();
        if (!conv) return;
        let text = `MedLib Nexus Conversation: ${conv.name}\n\n`;
        conv.messages.forEach(m => {
            text += `${m.role === 'user' ? 'You' : 'Nexus'}: ${m.content}\n\n`;
        });
        navigator.clipboard.writeText(text).then(() => showToast('Copied!')).catch(() => showToast('Copy failed'));
    }

    function setFontSize(delta) {
        fontSize = Math.min(32, Math.max(12, fontSize + delta));
        document.querySelectorAll('.message-bubble').forEach(el => el.style.fontSize = fontSize + 'px');
    }

    function togglePanelDarkMode() {
        panelDarkMode = !panelDarkMode;
        const panel = document.querySelector('.nexus-panel');
        if (panel) panelDarkMode ? panel.classList.add('dark') : panel.classList.remove('dark');
        const toggleInput = document.getElementById('sidebar-dark-toggle');
        if (toggleInput) toggleInput.checked = panelDarkMode;
    }

    function showToast(msg) {
        const toast = document.createElement('div');
        toast.className = 'nexus-toast';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    // ---------- CREATE WIDGET WITH MODERN RESPONSIVE UI ----------
    function createWidget() {
        const container = document.createElement('div');
        container.id = 'nexus-container';
        container.innerHTML = `
<style>
    #nexus-container * { box-sizing: border-box; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    :root {
        --primary: #2c7cb0;
        --primary-dark: #1b4c72;
        --bg-glass: rgba(255,255,255,0.65);
        --bg-sidebar: rgba(248,252,255,0.8);
        --border-light: rgba(44,124,176,0.15);
        --shadow-sm: 0 8px 30px rgba(0,0,0,0.08);
        --shadow-lg: 0 20px 50px rgba(0,0,0,0.2);
        --radius: 28px;
        --font-base: 16px;
    }
    .nexus-bubble {
        position: fixed;
        bottom: 25px;
        right: 25px;
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: linear-gradient(145deg, #2c7cb0, #1b4c72);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 6px 20px rgba(0,0,0,0.25);
        z-index: 10000;
        transition: 0.2s;
        border: 2px solid #ffd966;
        font-size: 2.4rem;
        touch-action: manipulation;
    }
    .nexus-bubble:hover { transform: scale(1.05); }
    .nexus-bubble .tooltip {
        position: absolute;
        top: -32px;
        background: #0a2942;
        color: white;
        padding: 5px 14px;
        border-radius: 30px;
        font-size: 0.8rem;
        opacity: 0;
        transition: opacity 0.2s;
        pointer-events: none;
        white-space: nowrap;
    }
    .nexus-bubble:hover .tooltip { opacity: 1; }
    .nexus-panel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 90vw;
        max-width: 1000px;
        height: 90vh;
        max-height: 850px;
        background: rgba(255,255,255,0.75);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border-radius: var(--radius);
        box-shadow: var(--shadow-lg);
        display: none;
        flex-direction: column;
        z-index: 10001;
        overflow: hidden;
        border: 1px solid var(--border-light);
        transition: background 0.2s, width 0.3s, height 0.3s;
        font-size: var(--font-base);
    }
    .nexus-panel.dark {
        background: rgba(30,30,46,0.85);
        color: #e0e0e0;
        --bg-glass: rgba(30,30,46,0.85);
        --bg-sidebar: rgba(20,20,30,0.9);
        --border-light: rgba(255,255,255,0.1);
    }
    .nexus-panel-header {
        background: rgba(10,41,66,0.9);
        backdrop-filter: blur(12px);
        color: white;
        padding: 12px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(255,255,255,0.1);
        flex-shrink: 0;
        min-height: 56px;
    }
    .nexus-panel-header h3 {
        margin:0;
        font-size:1.2rem;
        display:flex;
        align-items:center;
        gap:8px;
        font-weight: 600;
    }
    .panel-actions {
        display: flex;
        gap: 8px;
        flex-shrink: 0;
    }
    .panel-btn {
        background: rgba(255,255,255,0.15);
        border: none;
        color: white;
        width: 36px;
        height: 36px;
        border-radius: 30px;
        font-size: 1.1rem;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: 0.2s;
        touch-action: manipulation;
    }
    .panel-btn:hover { background: rgba(255,255,255,0.3); }
    .nexus-body {
        display: flex;
        flex: 1;
        overflow: hidden;
    }
    .nexus-sidebar {
        width: 250px;
        background: var(--bg-sidebar);
        backdrop-filter: blur(12px);
        border-right: 1px solid var(--border-light);
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        flex-shrink: 0;
        transition: width 0.3s, margin 0.3s;
    }
    .sidebar-section {
        padding: 16px 12px;
        border-bottom: 1px solid var(--border-light);
    }
    .section-title {
        font-weight: 600;
        opacity: 0.7;
        margin-bottom: 12px;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .conv-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .conv-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        border-radius: 12px;
        cursor: pointer;
        transition: background 0.2s;
        font-size: 0.9rem;
    }
    .conv-item:hover { background: rgba(44,124,176,0.1); }
    .conv-item.active { background: var(--primary); color: white; }
    .conv-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
    .conv-actions { display: none; gap: 4px; }
    .conv-item:hover .conv-actions { display: flex; }
    .new-chat-sidebar {
        background: transparent;
        border: 1px dashed var(--primary);
        border-radius: 30px;
        color: var(--primary);
        padding: 8px 12px;
        margin-top: 8px;
        width: 100%;
        cursor: pointer;
        font-weight: 500;
        transition: 0.2s;
    }
    .new-chat-sidebar:hover { background: var(--primary); color: white; }
    .pinned-note-item {
        padding: 6px 0;
        cursor: pointer;
        font-size: 0.85rem;
        border-bottom: 1px solid var(--border-light);
    }
    .settings-section label,
    .settings-section select {
        font-size: 0.9rem;
    }
    .setting-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
    }
    .toggle-switch {
        position: relative;
        display: inline-block;
        width: 40px;
        height: 22px;
    }
    .toggle-switch input {
        opacity: 0;
        width: 0;
        height: 0;
    }
    .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: #ccc;
        border-radius: 22px;
        transition: 0.3s;
    }
    .slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 2px;
        bottom: 2px;
        background: white;
        border-radius: 50%;
        transition: 0.3s;
    }
    input:checked + .slider { background: var(--primary); }
    input:checked + .slider:before { transform: translateX(18px); }
    .font-controls {
        display: flex;
        gap: 6px;
    }
    .font-controls button {
        background: var(--primary);
        color: white;
        border: none;
        border-radius: 20px;
        padding: 4px 12px;
        cursor: pointer;
        font-size: 0.9rem;
        transition: 0.2s;
    }
    .font-controls button:hover { opacity: 0.8; }
    .nexus-main {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: rgba(255,255,255,0.3);
    }
    .dark .nexus-main { background: rgba(20,20,30,0.4); }
    .chat-header {
        padding: 10px 20px;
        display: flex;
        align-items: center;
        gap: 12px;
        border-bottom: 1px solid var(--border-light);
        flex-shrink: 0;
        background: rgba(255,255,255,0.2);
    }
    .chat-header input {
        flex: 1;
        padding: 8px 16px;
        border-radius: 20px;
        border: 1px solid var(--border-light);
        background: rgba(255,255,255,0.5);
        font-size: 0.9rem;
        outline: none;
        transition: 0.2s;
    }
    .chat-header input:focus {
        border-color: var(--primary);
        box-shadow: 0 0 0 3px rgba(44,124,176,0.2);
    }
    .nexus-messages {
        flex: 1;
        padding: 20px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
        background: transparent;
    }
    .message {
        display: flex;
        gap: 12px;
        align-items: flex-start;
    }
    .message.user { flex-direction: row-reverse; }
    .avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: #e6f0fa;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        flex-shrink: 0;
    }
    .user .avatar { background: var(--primary); color: white; }
    .bubble-wrapper {
        max-width: 80%;
        position: relative;
    }
    .message-bubble {
        padding: 12px 16px;
        border-radius: 20px;
        background: rgba(255,255,255,0.8);
        backdrop-filter: blur(4px);
        box-shadow: 0 2px 10px rgba(0,0,0,0.03);
        line-height: 1.6;
        word-wrap: break-word;
        font-size: 1rem;
    }
    .dark .message-bubble { background: rgba(45,45,68,0.8); color: #e0e0e0; }
    .user .message-bubble { background: var(--primary); color: white; }
    .message-content { white-space: pre-wrap; }
    .message-actions {
        position: absolute;
        top: -12px;
        right: 10px;
        display: flex;
        gap: 4px;
        opacity: 0;
        transform: translateY(5px);
        transition: all 0.2s;
        background: rgba(255,255,255,0.95);
        border-radius: 20px;
        padding: 2px 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    .dark .message-actions { background: rgba(40,40,60,0.9); }
    .message:hover .message-actions { opacity: 1; transform: translateY(0); }
    .icon-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        color: inherit;
        opacity: 0.7;
        font-size: 0.9rem;
        padding: 2px 4px;
        transition: 0.2s;
    }
    .icon-btn:hover { opacity: 1; transform: scale(1.1); }
    .timestamp {
        font-size: 0.65rem;
        opacity: 0.5;
        margin-top: 4px;
        text-align: right;
    }
    .read-more {
        background: transparent;
        border: none;
        color: var(--primary);
        cursor: pointer;
        font-size: 0.85rem;
        margin-top: 4px;
        font-weight: 500;
    }
    .typing .message-bubble {
        background: #e6f0fa;
        display: flex;
        gap: 4px;
        padding: 12px 16px;
    }
    .typing-indicator span {
        animation: blink 1.4s infinite;
        font-size: 1.2rem;
    }
    @keyframes blink {
        0% { opacity:0.2; }
        20% { opacity:1; }
        100% { opacity:0.2; }
    }
    .input-area {
        padding: 12px 20px;
        border-top: 1px solid var(--border-light);
        display: flex;
        gap: 8px;
        align-items: flex-end;
        background: rgba(255,255,255,0.4);
        flex-shrink: 0;
    }
    .input-area textarea {
        flex: 1;
        padding: 10px 16px;
        border-radius: 24px;
        border: 1px solid var(--border-light);
        background: rgba(255,255,255,0.7);
        resize: none;
        font-size: 0.95rem;
        outline: none;
        max-height: 120px;
        font-family: inherit;
        transition: 0.2s;
    }
    .input-area textarea:focus {
        border-color: var(--primary);
        box-shadow: 0 0 0 3px rgba(44,124,176,0.2);
    }
    .send-btn, .share-btn {
        background: var(--primary);
        color: white;
        border: none;
        border-radius: 50%;
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 1.2rem;
        box-shadow: 0 4px 12px rgba(44,124,176,0.3);
        transition: 0.2s;
        flex-shrink: 0;
    }
    .send-btn:hover, .share-btn:hover { transform: scale(1.05); }
    .share-btn { background: #555; }
    .suggestions {
        display: flex;
        gap: 8px;
        padding: 6px 20px;
        overflow-x: auto;
        white-space: nowrap;
        flex-wrap: nowrap;
        border-top: 1px solid var(--border-light);
        background: rgba(255,255,255,0.3);
        scrollbar-width: none;
        -ms-overflow-style: none;
        flex-shrink: 0;
    }
    .suggestions::-webkit-scrollbar { display: none; }
    .suggestion-chip {
        flex-shrink: 0;
        background: rgba(44,124,176,0.12);
        border-radius: 30px;
        padding: 5px 14px;
        font-size: 0.8rem;
        cursor: pointer;
        transition: 0.2s;
        font-weight: 500;
    }
    .suggestion-chip:hover {
        background: rgba(44,124,176,0.25);
        transform: scale(1.02);
    }
    .nexus-stats {
        font-size: 0.7rem;
        opacity: 0.5;
        padding: 4px 20px 8px;
        text-align: right;
        flex-shrink: 0;
    }
    .nexus-toast {
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--primary);
        color: white;
        padding: 10px 24px;
        border-radius: 30px;
        z-index: 99999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: fadeInUp 0.3s;
        font-size: 0.95rem;
    }
    @keyframes fadeInUp {
        from { opacity:0; transform:translate(-50%,20px); }
        to { opacity:1; transform:translate(-50%,0); }
    }
    .muted { opacity: 0.5; font-size: 0.85rem; }

    /* ---------- RESPONSIVE ---------- */
    @media (max-width: 700px) {
        .nexus-panel {
            width: 98vw;
            height: 95vh;
            max-height: 95vh;
            border-radius: 20px;
        }
        .nexus-sidebar {
            width: 0 !important;
            padding: 0;
            overflow: hidden;
            flex-shrink: 0;
        }
        .nexus-sidebar.open {
            width: 240px !important;
            padding: 10px 0;
        }
        .nexus-panel-header h3 { font-size: 1rem; }
        .panel-btn { width: 32px; height: 32px; font-size: 0.9rem; }
        .bubble-wrapper { max-width: 90%; }
        .message-bubble { font-size: 0.95rem; padding: 10px 14px; }
        .input-area { padding: 8px 12px; gap: 6px; }
        .input-area textarea { font-size: 0.9rem; padding: 8px 12px; }
        .send-btn, .share-btn { width: 38px; height: 38px; font-size: 1rem; }
        .chat-header input { font-size: 0.85rem; padding: 6px 12px; }
        .suggestion-chip { font-size: 0.7rem; padding: 4px 10px; }
        .nexus-bubble { width: 56px; height: 56px; font-size: 2rem; bottom: 15px; right: 15px; }
    }
    @media (max-width: 480px) {
        .nexus-panel {
            width: 100vw;
            height: 100vh;
            max-height: 100vh;
            border-radius: 0;
        }
        .nexus-panel-header {
            padding: 8px 14px;
            min-height: 48px;
        }
        .panel-btn { width: 28px; height: 28px; font-size: 0.8rem; }
        .message-bubble { font-size: 0.9rem; padding: 8px 12px; }
        .nexus-messages { padding: 12px; gap: 12px; }
        .avatar { width: 30px; height: 30px; font-size: 1rem; }
        .input-area textarea { font-size: 0.85rem; padding: 6px 10px; }
        .send-btn, .share-btn { width: 34px; height: 34px; font-size: 0.9rem; }
        .nexus-bubble { width: 48px; height: 48px; font-size: 1.6rem; bottom: 10px; right: 10px; }
    }
</style>
<div class="nexus-bubble">🩺<span class="tooltip">Ask Nexus</span></div>
<div class="nexus-panel">
    <div class="nexus-panel-header">
        <h3>🩺 Nexus</h3>
        <div class="panel-actions">
            <button class="panel-btn" id="sidebar-toggle" title="Toggle Sidebar">☰</button>
            <button class="panel-btn" id="export-chat" title="Export">📥</button>
            <button class="panel-btn" id="minimize-panel" title="Minimize">─</button>
            <button class="panel-btn" id="close-panel" title="Close">✕</button>
        </div>
    </div>
    <div class="nexus-body">
        <div class="nexus-sidebar" id="nexus-sidebar"></div>
        <div class="nexus-main" id="nexus-main">
            <div class="chat-header">
                <span id="current-conv-name" style="font-weight:600; flex-shrink:0;">New Chat</span>
                <input type="text" id="nexus-search" placeholder="🔍 Search messages...">
            </div>
            <div class="nexus-messages" id="nexus-messages"></div>
            <div class="suggestions" id="suggestions"></div>
            <div class="input-area">
                <textarea id="nexus-input" placeholder="Ask a medical question..." rows="1" maxlength="1000"></textarea>
                <button class="share-btn" id="share-conv" title="Share">🔗</button>
                <button class="send-btn" id="nexus-send">➤</button>
            </div>
            <div class="nexus-stats" id="nexus-stats"></div>
        </div>
    </div>
</div>`;
        document.body.appendChild(container);

        const panel = container.querySelector('.nexus-panel');
        const bubble = container.querySelector('.nexus-bubble');

        bubble.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
        });

        document.addEventListener('click', (e) => {
            if (panel.style.display === 'flex' &&
                !panel.contains(e.target) &&
                e.target !== bubble &&
                !e.target.closest('#medlib-selection-popup')) {
                panel.style.display = 'none';
            }
        });

        const mainArea = document.getElementById('nexus-main');
        mainArea.addEventListener('click', (e) => {
            const sidebar = document.getElementById('nexus-sidebar');
            if (sidebarOpen && !e.target.closest('#sidebar-toggle') && !e.target.closest('.nexus-sidebar')) {
                sidebarOpen = false;
                sidebar.style.width = '0px';
                sidebar.classList.remove('open');
            }
        });

        document.getElementById('minimize-panel').onclick = () => panel.style.display = 'none';
        document.getElementById('close-panel').onclick = () => panel.style.display = 'none';
        document.getElementById('sidebar-toggle').onclick = (e) => {
            e.stopPropagation();
            sidebarOpen = !sidebarOpen;
            const sidebar = document.getElementById('nexus-sidebar');
            if (sidebarOpen) {
                sidebar.style.width = '250px';
                sidebar.classList.add('open');
            } else {
                sidebar.style.width = '0px';
                sidebar.classList.remove('open');
            }
        };
        document.getElementById('export-chat').onclick = exportConversation;
        document.getElementById('share-conv').onclick = shareConversation;
        document.getElementById('nexus-send').onclick = () => sendMessage();

        const textarea = document.getElementById('nexus-input');
        textarea.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(120, this.scrollHeight) + 'px';
        });
        document.getElementById('nexus-search').addEventListener('input', (e) => {
            currentSearch = e.target.value.trim().toLowerCase();
            renderMessages();
        });

        // drag
        let isDragging = false, dragOffsetX, dragOffsetY;
        const header = panel.querySelector('.nexus-panel-header');
        header.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDragging = true;
            const rect = panel.getBoundingClientRect();
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;
            panel.style.transition = 'none';
        });
        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            panel.style.left = (e.clientX - dragOffsetX) + 'px';
            panel.style.top = (e.clientY - dragOffsetY) + 'px';
            panel.style.transform = 'none';
        });
        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                panel.style.transition = '';
            }
        });

        // keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                document.getElementById('nexus-search').focus();
            }
            if (e.ctrlKey && e.key === 'n') {
                e.preventDefault();
                newConversation();
            }
        });
    }

    function init() {
        loadConversations();
        createWidget();
        renderAll();
    }

    window.sendMessage = sendMessage;
    window.scrollToMessage = (idx) => {
        const el = document.querySelector(`.message[data-idx="${idx}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    window.togglePinMessage = togglePinMessage;
    window.editUserMessage = editUserMessage;
    window.deleteMessage = deleteMessage;
    window.copyMessageContent = copyMessageContent;
    window.quoteMessage = quoteMessage;

    init();
})();
