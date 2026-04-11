// nexus.js – Medical AI Assistant with Firestore sync
(function() {
    // ========== Configuration ==========
    const STORAGE_KEY = 'nexus_conversations';
    const MAX_MESSAGE_LENGTH = 1000;

    // ========== State ==========
    let conversations = [];
    let currentConvId = null;
    let isWaiting = false;
    let pinnedMessages = [];
    let currentSearch = '';
    let fontSize = 16;
    let panelDarkMode = false;
    let personality = 'detailed';

    // ========== Helper Functions ==========
    function extractPuterMessage(raw) {
        if (typeof raw === 'string') {
            try { return JSON.parse(raw).message?.content || raw; } catch { return raw; }
        }
        return raw?.message?.content || raw?.content || JSON.stringify(raw);
    }

    function stripTables(text) {
        if (!text) return text;
        return text.split('\n').filter(line => {
            const trimmed = line.trim();
            return !(/^\|.*\|$/.test(trimmed) || /^[\|\-\s]+$/.test(trimmed));
        }).join('\n');
    }

    // ========== Conversation Persistence (with Firestore sync) ==========
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
        // Sync to Firestore if user is logged in and sync function exists
        if (typeof window.syncConversationsUpdate === 'function') {
            window.syncConversationsUpdate(conversations);
        }
    }

    // Expose this function so sync-conversations.js can reload conversations from Firestore
    window.reloadNexusConversations = function(newConvs) {
        if (newConvs && newConvs.length) {
            conversations = newConvs;
            if (!currentConvId || !conversations.find(c => c.id === currentConvId)) {
                currentConvId = conversations[0].id;
            }
            renderTabs();
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
        updateStats();
    }
    function deleteMessage(index) {
        const conv = getCurrentConv();
        if (!conv) return;
        conv.messages.splice(index, 1);
        saveConversations();
        renderMessages();
        updateStats();
    }
    function editUserMessage(index, newContent) {
        if (!newContent) return;
        const conv = getCurrentConv();
        if (!conv || conv.messages[index].role !== 'user') return;
        conv.messages[index].content = newContent;
        if (index + 1 < conv.messages.length && conv.messages[index+1].role === 'assistant') {
            conv.messages.splice(index+1, 1);
        }
        saveConversations();
        renderMessages();
        sendMessage(newContent);
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
        renderPinnedSection();
        renderMessages();
    }
    function isPinned(idx) { return pinnedMessages.some(p => p.convId === currentConvId && p.idx === idx); }
    function renderPinnedSection() {
        const container = document.getElementById('nexus-pinned');
        if (!container) return;
        const pinnedForThisConv = pinnedMessages.filter(p => p.convId === currentConvId);
        if (pinnedForThisConv.length === 0) {
            container.style.display = 'none';
            return;
        }
        container.style.display = 'block';
        let html = `<div class="pinned-title"><i class="fas fa-thumbtack"></i> Pinned Notes</div>`;
        pinnedForThisConv.forEach(p => {
            const content = stripTables(p.content).substring(0, 120) + (p.content.length > 120 ? '…' : '');
            html += `<div class="pinned-item" onclick="window.scrollToMessage(${p.idx})">📌 ${content}</div>`;
        });
        container.innerHTML = html;
    }
    function updateStats() {
        const conv = getCurrentConv();
        if (!conv) return;
        const msgCount = conv.messages.length;
        const wordCount = conv.messages.reduce((sum, m) => sum + (m.content.split(/\s+/).length), 0);
        const statsSpan = document.getElementById('nexus-stats');
        if (statsSpan) statsSpan.innerText = `${msgCount} msgs · ~${wordCount} words`;
    }
    function filterMessages() {
        const input = document.getElementById('nexus-search');
        if (input) currentSearch = input.value.trim().toLowerCase();
        renderMessages();
    }
    function exportAsPDF() {
        const conv = getCurrentConv();
        if (!conv) return;
        const win = window.open('', '_blank');
        let html = `<html><head><title>MedLib Nexus Chat</title><style>body{font-family:sans-serif; margin:2rem;}</style></head><body><h1>Conversation: ${conv.name}</h1>`;
        conv.messages.forEach(m => {
            html += `<div><strong>${m.role === 'user' ? 'You' : 'Nexus'}:</strong> ${m.content.replace(/\n/g, '<br>')}</div><hr>`;
        });
        html += `</body></html>`;
        win.document.write(html);
        win.document.close();
        win.print();
    }
    function shareConversation() {
        const conv = getCurrentConv();
        if (!conv) return;
        let text = `MedLib Nexus Conversation: ${conv.name}\n\n`;
        conv.messages.forEach(m => {
            text += `${m.role === 'user' ? 'You' : 'Nexus'}: ${m.content}\n\n`;
        });
        navigator.clipboard.writeText(text).then(() => alert('Copied!')).catch(() => alert('Failed to copy'));
    }
    function setFontSize(delta) {
        fontSize = Math.min(32, Math.max(12, fontSize + delta));
        document.querySelectorAll('.message-bubble').forEach(el => el.style.fontSize = fontSize + 'px');
    }
    function togglePanelDarkMode() {
        panelDarkMode = !panelDarkMode;
        const panel = document.querySelector('.nexus-panel');
        if (panel) panelDarkMode ? panel.classList.add('dark') : panel.classList.remove('dark');
    }
    function copyMessage(text) {
        navigator.clipboard.writeText(text).then(() => alert('Copied!')).catch(() => alert('Failed to copy'));
    }
    function newConversation() {
        const id = Date.now();
        conversations.push({
            id,
            name: 'Chat ' + (conversations.length + 1),
            messages: [{ role: 'assistant', content: '👋 Hi, I’m Nexus! Ask me anything about medicine.', timestamp: Date.now() }]
        });
        currentConvId = id;
        saveConversations();
        renderTabs();
        renderMessages();
    }
    function deleteConversation(id) {
        const idx = conversations.findIndex(c => c.id === id);
        if (idx === -1) return;
        conversations.splice(idx, 1);
        if (!conversations.length) newConversation();
        else if (currentConvId === id) currentConvId = conversations[0].id;
        saveConversations();
        renderTabs();
        renderMessages();
    }
    function renameConversation(id, newName) {
        const conv = conversations.find(c => c.id === id);
        if (conv) { conv.name = newName; saveConversations(); renderTabs(); }
    }
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

    // ========== Render UI ==========
    function renderTabs() {
        const tabs = document.getElementById('nexus-tabs');
        if (!tabs) return;
        let html = '';
        conversations.forEach(c => {
            const active = c.id === currentConvId ? 'active' : '';
            html += `<div class="conv-tab ${active}" data-id="${c.id}">
                <span class="conv-name" contenteditable="false" onblur="renameConversation(${c.id}, this.innerText)" ondblclick="this.contentEditable=true; this.focus();">${c.name}</span>
                <button class="delete-conv" onclick="deleteConversation(${c.id})">🗑️</button>
            </div>`;
        });
        html += `<button class="new-conv-btn" onclick="newConversation()">➕ New</button>`;
        tabs.innerHTML = html;
        document.querySelectorAll('.conv-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                const id = Number(tab.dataset.id);
                if (currentConvId !== id) {
                    currentConvId = id;
                    saveConversations();
                    renderTabs();
                    renderMessages();
                }
            });
        });
    }

    function renderMessages() {
        const msgsDiv = document.getElementById('nexus-messages');
        if (!msgsDiv) return;
        const conv = getCurrentConv();
        if (!conv) return;
        let filtered = conv.messages;
        if (currentSearch) filtered = conv.messages.filter(m => m.content.toLowerCase().includes(currentSearch));
        let html = '';
        filtered.forEach((msg, idx) => {
            const originalIdx = conv.messages.indexOf(msg);
            const isUser = msg.role === 'user';
            const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const avatar = isUser ? '👤' : '🤖';
            const content = isUser ? msg.content : stripTables(msg.content);
            const pinned = isPinned(originalIdx);
            html += `
                <div class="message ${msg.role}" data-idx="${originalIdx}">
                    <div class="avatar">${avatar}</div>
                    <div class="bubble-wrapper">
                        <div class="message-bubble" style="font-size:${fontSize}px">${content.replace(/\n/g, '<br>')}</div>
                        <div class="message-footer">
                            <span class="timestamp">${time}</span>
                            ${!isUser ? `
                                <button class="pin-btn" onclick="togglePinMessage(${originalIdx})" title="Pin">${pinned ? '📌' : '📍'}</button>
                                <button class="copy-btn" onclick="copyMessage('${msg.content.replace(/'/g, "\\'")}')">📋</button>
                                <button class="delete-btn" onclick="deleteMessage(${originalIdx})">🗑️</button>
                            ` : `
                                <button class="edit-btn" onclick="editUserMessage(${originalIdx}, prompt('Edit your message:', '${msg.content.replace(/'/g, "\\'")}'))" title="Edit">✏️</button>
                                <button class="delete-btn" onclick="deleteMessage(${originalIdx})">🗑️</button>
                            `}
                        </div>
                    </div>
                </div>
            `;
        });
        if (isWaiting) {
            html += `<div class="message assistant typing"><div class="avatar">🤖</div><div class="bubble-wrapper"><div class="message-bubble typing-indicator"><span>.</span><span>.</span><span>.</span></div></div></div>`;
        }
        msgsDiv.innerHTML = html;
        msgsDiv.scrollTop = msgsDiv.scrollHeight;
        updateStats();
        renderPinnedSection();
    }

    // ========== Send Message with Puter ==========
    async function sendMessage(initialText = null) {
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
        addMessage('user', text);
        isWaiting = true;
        renderMessages();

        let personalityInstruction = '';
        if (personality === 'concise') personalityInstruction = 'Be concise and direct. Use bullet points when helpful.';
        else if (personality === 'usmle') personalityInstruction = 'Focus on high‑yield USMLE content. Emphasize mechanisms, clinical correlations, and exam tips.';
        else personalityInstruction = 'Provide thorough explanations with clinical context.';

        const medicalPrompt = `You are a medical expert assistant called Nexus, designed exclusively for healthcare professionals and medical students. You ONLY answer questions related to medicine, physiology, pathology, pharmacology, clinical practice, and medical sciences.

For ANY non-medical question, respond with: "I'm a medical assistant and can only answer questions related to medicine and healthcare. Please ask a medical question."

Guidelines:
- Provide accurate, evidence-based medical information.
- Include relevant clinical context when appropriate.
- If a term has both medical and non-medical meanings, always interpret it in the medical context (e.g., "GLUT" = Glucose Transporter, not OpenGL).
- Be educational and clear for medical students.
- Use proper medical terminology but explain when necessary.
- If uncertain, acknowledge limitations.

${personalityInstruction}

Question: ${text}`;

        try {
            const raw = await puter.ai.chat(medicalPrompt, { model: 'google/gemini-2.0-flash-lite-001' });
            const clean = extractPuterMessage(raw);
            isWaiting = false;
            addMessage('assistant', clean);
        } catch (e) {
            isWaiting = false;
            addMessage('assistant', 'Nexus error: ' + e.message);
        }
    }

    // ========== Widget Creation ==========
    function createWidget() {
        const container = document.createElement('div');
        container.id = 'nexus-container';
        container.innerHTML = `
            <style>
                #nexus-container * { box-sizing: border-box; font-family: 'Inter', sans-serif; }
                .nexus-bubble {
                    position: fixed;
                    bottom: 30px;
                    right: 30px;
                    width: 70px;
                    height: 70px;
                    border-radius: 50%;
                    background: linear-gradient(145deg, #2c7cb0, #1b4c72);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    box-shadow: 0 8px 25px rgba(0,0,0,0.3);
                    z-index: 10000;
                    transition: 0.3s;
                    border: 3px solid #ffd966;
                    font-size: 2.8rem;
                    line-height: 1;
                    touch-action: manipulation;
                }
                .nexus-bubble:hover { transform: scale(1.05); }
                .nexus-bubble .tooltip {
                    position: absolute;
                    top: -35px;
                    background: #0a2942;
                    color: white;
                    padding: 6px 16px;
                    border-radius: 30px;
                    font-size: 0.9rem;
                    opacity: 0;
                    transition: opacity 0.3s;
                    pointer-events: none;
                    white-space: nowrap;
                }
                .nexus-bubble:hover .tooltip { opacity: 1; }
                .nexus-panel {
                    position: fixed;
                    bottom: 120px;
                    right: 20px;
                    width: 460px;
                    max-width: calc(100vw - 40px);
                    background: white;
                    border-radius: 24px;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.3);
                    display: none;
                    flex-direction: column;
                    z-index: 10001;
                    overflow: hidden;
                    border: 1px solid #e6f0fa;
                    max-height: 80vh;
                    transition: background 0.2s;
                }
                .nexus-panel.dark { background: #1e1e2e; color: #e0e0e0; }
                .nexus-panel.dark .nexus-panel-header { background: #0f0f1f; }
                .nexus-panel.dark .conv-tab { background: #2a2a3a; color: white; border-color: #3a3a55; }
                .nexus-panel.dark .nexus-messages { background: #1a1a2a; }
                .nexus-panel.dark .message-bubble { background: #2d2d44; color: #e0e0e0; border-color: #3a3a55; }
                .nexus-panel.dark .user .message-bubble { background: #2c7cb0; }
                .nexus-panel-header {
                    background: #0a2942;
                    color: white;
                    padding: 12px 20px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .nexus-panel-header h3 { margin:0; font-size:1.3rem; display:flex; align-items:center; gap:10px; }
                .nexus-header-buttons { display: flex; gap: 12px; align-items: center; }
                .nexus-header-btn, .header-control {
                    background: rgba(255,255,255,0.15);
                    border: none;
                    color: white;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    font-size: 1.2rem;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: 0.2s;
                }
                .header-control { width: auto; border-radius: 30px; padding: 0 12px; font-size: 0.9rem; gap: 5px; }
                .nexus-header-btn:hover, .header-control:hover { background: rgba(255,255,255,0.3); }
                .conversation-tabs {
                    display: flex;
                    overflow-x: auto;
                    padding: 10px 10px 0 10px;
                    background: #f0f7ff;
                    border-bottom: 1px solid #d0e0f0;
                    gap: 5px;
                    align-items: center;
                }
                .conv-tab {
                    background: white;
                    border: 1px solid #d0e0f0;
                    border-radius: 30px 30px 0 0;
                    padding: 6px 12px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    white-space: nowrap;
                    font-size: 0.9rem;
                    border-bottom: none;
                }
                .conv-tab.active { background: #2c7cb0; color: white; border-color: #2c7cb0; }
                .conv-tab .conv-name { max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
                .conv-tab .delete-conv { background: transparent; border: none; color: inherit; cursor: pointer; font-size: 1.1rem; }
                .new-conv-btn {
                    background: transparent;
                    border: 1px dashed #2c7cb0;
                    border-radius: 30px;
                    padding: 5px 10px;
                    color: #2c7cb0;
                    font-size: 0.9rem;
                    cursor: pointer;
                    white-space: nowrap;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }
                .nexus-search-area { padding: 8px 20px; background: #f9fcff; border-bottom: 1px solid #e0ecf5; }
                .nexus-search-area input { width: 100%; padding: 8px 12px; border: 1px solid #d0e0f0; border-radius: 30px; outline: none; font-size: 0.9rem; }
                .pinned-section {
                    padding: 8px 20px;
                    background: #f0f7ff;
                    border-bottom: 1px solid #e0ecf5;
                    font-size: 0.9rem;
                    max-height: 150px;
                    overflow-y: auto;
                    display: none;
                }
                .pinned-title { font-weight: 600; color: #0a2942; margin-bottom: 8px; }
                .pinned-item { padding: 4px 0; cursor: pointer; color: #1e4b6e; border-bottom: 1px solid #e0ecf5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .nexus-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                    background: #f9fcff;
                    min-height: 250px;
                }
                .message { display: flex; gap: 12px; margin-bottom: 20px; }
                .message.user { flex-direction: row-reverse; }
                .avatar {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    background: #e6f0fa;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.5rem;
                }
                .user .avatar { background: #2c7cb0; color: white; }
                .bubble-wrapper { max-width: 80%; }
                .message-bubble {
                    padding: 12px 16px;
                    border-radius: 20px;
                    background: white;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
                    color: #0a2942;
                    word-wrap: break-word;
                    line-height: 1.5;
                    font-size: 0.95rem;
                }
                .user .message-bubble { background: #2c7cb0; color: white; }
                .message-footer {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-top: 5px;
                    font-size: 0.8rem;
                    color: #8a9cb0;
                }
                .timestamp { font-size: 0.7rem; }
                button { background: none; border: none; cursor: pointer; color: #8a9cb0; font-size: 1rem; padding: 0 3px; }
                button:hover { color: #2c7cb0; }
                .typing .message-bubble { background: #e6f0fa; display: flex; gap: 4px; padding: 16px; }
                .typing-indicator span { animation: blink 1.4s infinite; font-size: 1.5rem; line-height: 0.5; }
                @keyframes blink { 0% { opacity:0.2; } 20% { opacity:1; } 100% { opacity:0.2; } }
                .nexus-input-area {
                    padding: 16px 20px;
                    border-top: 1px solid #e0ecf5;
                    display: flex;
                    gap: 8px;
                    background: white;
                    align-items: center;
                    flex-wrap: wrap;
                }
                .nexus-input-area textarea {
                    flex: 1;
                    padding: 12px 16px;
                    border: 1px solid #d0e0f0;
                    border-radius: 30px;
                    resize: none;
                    font-family: inherit;
                    font-size: 0.95rem;
                    outline: none;
                    min-width: 150px;
                }
                .nexus-input-area button {
                    background: #2c7cb0;
                    color: white;
                    border: none;
                    border-radius: 30px;
                    width: 48px;
                    height: 48px;
                    font-size: 1.2rem;
                    cursor: pointer;
                    transition: 0.2s;
                    box-shadow: 0 4px 8px rgba(44,124,176,0.3);
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                }
                .nexus-input-area button:disabled { background: #a0b8cc; cursor: not-allowed; }
                .nexus-input-area button:last-child { background: #555; box-shadow: none; }
                .suggestions {
                    display: flex;
                    gap: 8px;
                    padding: 0 20px 8px;
                    flex-wrap: wrap;
                }
                .suggestion-chip {
                    background: #e6f0fa;
                    border-radius: 40px;
                    padding: 6px 12px;
                    font-size: 0.8rem;
                    cursor: pointer;
                    color: #1e4b6e;
                    transition: 0.2s;
                }
                .suggestion-chip:hover { background: #cde0f0; transform: scale(1.02); }
                .nexus-stats { font-size: 0.7rem; color: #8a9cb0; padding: 0 20px 8px; text-align: right; }
                @media (max-width: 600px) {
                    .nexus-panel { width: calc(100vw - 40px); right: 20px; bottom: 100px; }
                    .nexus-input-area button { width: 40px; height: 40px; }
                    .suggestion-chip { font-size: 0.7rem; }
                }
            </style>
            <div class="nexus-bubble">
                🩺
                <span class="tooltip">Ask Nexus</span>
            </div>
            <div class="nexus-panel">
                <div class="nexus-panel-header">
                    <h3>🩺 Nexus</h3>
                    <div class="nexus-header-buttons">
                        <button class="header-control" id="nexus-font-minus">A-</button>
                        <button class="header-control" id="nexus-font-plus">A+</button>
                        <button class="header-control" id="nexus-dark-toggle">🌓</button>
                        <select id="nexus-personality" class="header-control" style="background:rgba(255,255,255,0.15); border:none; color:white; border-radius:30px; padding:0 12px;">
                            <option value="detailed">📘 Detailed</option>
                            <option value="concise">📝 Concise</option>
                            <option value="usmle">🎯 USMLE Focus</option>
                        </select>
                        <button class="nexus-header-btn" id="nexus-export">📥</button>
                        <button class="nexus-header-btn" id="nexus-minimize">−</button>
                        <button class="nexus-header-btn" id="nexus-close">✕</button>
                    </div>
                </div>
                <div class="conversation-tabs" id="nexus-tabs"></div>
                <div class="nexus-search-area"><input type="text" id="nexus-search" placeholder="🔍 Search in conversation..."></div>
                <div class="pinned-section" id="nexus-pinned"></div>
                <div class="nexus-messages" id="nexus-messages"></div>
                <div class="suggestions" id="suggestions">
                    <div class="suggestion-chip" data-question="Explain the Krebs cycle">🧬 Krebs cycle</div>
                    <div class="suggestion-chip" data-question="What are ACE inhibitors?">💊 ACE inhibitors</div>
                    <div class="suggestion-chip" data-question="How to treat hypertension?">🩺 Hypertension treatment</div>
                </div>
                <div class="nexus-input-area">
                    <textarea id="nexus-input" placeholder="Ask a medical question..." rows="2" maxlength="1000"></textarea>
                    <button id="nexus-send">➤</button>
                    <button id="nexus-share" style="background:#555; box-shadow:none;">🔗</button>
                </div>
                <div class="nexus-stats" id="nexus-stats"></div>
            </div>
        `;
        document.body.appendChild(container);

        const panel = container.querySelector('.nexus-panel');
        const bubble = container.querySelector('.nexus-bubble');
        bubble.onclick = () => { panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex'; };

        document.getElementById('nexus-font-minus').onclick = () => setFontSize(-2);
        document.getElementById('nexus-font-plus').onclick = () => setFontSize(2);
        document.getElementById('nexus-dark-toggle').onclick = togglePanelDarkMode;
        document.getElementById('nexus-personality').onchange = (e) => { personality = e.target.value; };
        document.getElementById('nexus-export').onclick = exportAsPDF;
        document.getElementById('nexus-minimize').onclick = () => panel.style.display = 'none';
        document.getElementById('nexus-close').onclick = () => panel.style.display = 'none';
        document.getElementById('nexus-send').onclick = () => sendMessage();
        document.getElementById('nexus-share').onclick = shareConversation;
        const textarea = document.getElementById('nexus-input');
        if (textarea) {
            textarea.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
        }
        document.getElementById('nexus-search').addEventListener('input', filterMessages);
        document.querySelectorAll('.suggestion-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const q = chip.getAttribute('data-question');
                if (q) {
                    const input = document.getElementById('nexus-input');
                    if (input) input.value = q;
                    sendMessage(q);
                }
            });
        });

        return panel;
    }

    // ========== Initialize ==========
    function init() {
        loadConversations();
        createWidget();
        renderTabs();
        renderMessages();
    }

    // Expose functions for external use (selection popup, sync)
    window.sendMessage = sendMessage;
    window.scrollToMessage = (idx) => {
        const el = document.querySelector(`.message[data-idx="${idx}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
    };
    window.renameConversation = renameConversation;
    window.deleteConversation = deleteConversation;
    window.newConversation = newConversation;
    window.exportConversation = exportConversation;
    window.togglePinMessage = togglePinMessage;
    window.editUserMessage = editUserMessage;
    window.deleteMessage = deleteMessage;
    window.copyMessage = copyMessage;

    init();
})();
