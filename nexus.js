// nexus.js – Full‑Featured Medical AI Assistant
(function() {
    // ================================================================
    // NEXUS – Intelligent Medical Assistant
    // ================================================================
    
    const STORAGE_KEY = 'nexus_conversations';
    const MAX_MESSAGE_LENGTH = 1000;

    let conversations = [];
    let currentConvId = null;
    let isWaiting = false;
    let usSpeed = 1.0;
    let ukSpeed = 1.0;
    let voicesLoaded = false;
    let usVoice = null;
    let ukVoice = null;
    let pinnedMessages = [];   // store pinned message objects { convId, idx, content }
    let currentSearch = '';    // search term for filtering
    let fontSize = 16;          // base font size for message bubbles (px)
    let panelDarkMode = false;  // separate dark mode for the chat panel
    let personality = 'detailed'; // default: detailed, concise, usmle

    // ---------- Helper: extract clean text from Puter response ----------
    function extractPuterMessage(raw) {
        if (typeof raw === 'string') {
            try { return JSON.parse(raw).message?.content || raw; } catch { return raw; }
        }
        return raw?.message?.content || raw?.content || JSON.stringify(raw);
    }

    // ---------- Helper: strip markdown tables ----------
    function stripTables(text) {
        if (!text) return text;
        return text.split('\n').filter(line => {
            const trimmed = line.trim();
            return !(/^\|.*\|$/.test(trimmed) || /^[\|\-\s]+$/.test(trimmed));
        }).join('\n');
    }

    // ---------- Load / Save conversations ----------
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
        // Load pinned messages
        const storedPinned = localStorage.getItem('nexus_pinned');
        if (storedPinned) pinnedMessages = JSON.parse(storedPinned);
    }

    function saveConversations() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    }

    function savePinned() {
        localStorage.setItem('nexus_pinned', JSON.stringify(pinnedMessages));
    }

    function getCurrentConv() {
        return conversations.find(c => c.id === currentConvId);
    }

    function addMessage(role, content) {
        const conv = getCurrentConv();
        if (!conv) return;
        conv.messages.push({ role, content, timestamp: Date.now() });
        saveConversations();
        renderMessages();
        updateStats();
    }

    function replaceLastMessage(content) {
        const conv = getCurrentConv();
        if (!conv || !conv.messages.length) return;
        conv.messages[conv.messages.length - 1] = { role: 'assistant', content, timestamp: Date.now() };
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
        const conv = getCurrentConv();
        if (!conv || conv.messages[index].role !== 'user') return;
        conv.messages[index].content = newContent;
        // remove any subsequent assistant message (regenerate)
        if (index + 1 < conv.messages.length && conv.messages[index+1].role === 'assistant') {
            conv.messages.splice(index+1, 1);
        }
        saveConversations();
        renderMessages();
        // Automatically send the edited message to regenerate answer
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
    }

    function isPinned(idx) {
        return pinnedMessages.some(p => p.convId === currentConvId && p.idx === idx);
    }

    function renderPinnedSection() {
        const pinnedContainer = document.getElementById('nexus-pinned');
        if (!pinnedContainer) return;
        const pinnedForThisConv = pinnedMessages.filter(p => p.convId === currentConvId);
        if (pinnedForThisConv.length === 0) {
            pinnedContainer.style.display = 'none';
            return;
        }
        pinnedContainer.style.display = 'block';
        let html = `<div class="section-title"><h3><i class="fas fa-thumbtack"></i> Pinned Notes</h3></div><div class="pinned-list">`;
        pinnedForThisConv.forEach(p => {
            const content = stripTables(p.content).substring(0, 200) + (p.content.length > 200 ? '…' : '');
            html += `<div class="pinned-item" onclick="window.scrollToMessage(${p.idx})"><i class="fas fa-star"></i> ${content}</div>`;
        });
        html += `</div>`;
        pinnedContainer.innerHTML = html;
    }

    function updateStats() {
        const conv = getCurrentConv();
        if (!conv) return;
        const msgCount = conv.messages.length;
        const wordCount = conv.messages.reduce((sum, m) => sum + (m.content.split(/\s+/).length), 0);
        const statsSpan = document.getElementById('nexus-stats');
        if (statsSpan) statsSpan.innerText = `${msgCount} msgs, ~${wordCount} words`;
    }

    function filterMessages() {
        const searchInput = document.getElementById('nexus-search');
        if (searchInput) currentSearch = searchInput.value.trim().toLowerCase();
        renderMessages();
    }

    function exportAsPDF() {
        // Use browser's print functionality to generate PDF
        const printWindow = window.open('', '_blank');
        const conv = getCurrentConv();
        if (!conv) return;
        let html = `<html><head><title>MedLib Nexus Chat</title><style>body{font-family:sans-serif; margin:2rem;} .message{margin-bottom:1rem;} .user{color:#2c7cb0;} .assistant{color:#0a2942;}</style></head><body>`;
        html += `<h1>Conversation: ${conv.name}</h1>`;
        conv.messages.forEach(msg => {
            html += `<div class="message ${msg.role}"><strong>${msg.role === 'user' ? 'You' : 'Nexus'}:</strong> ${msg.content.replace(/\n/g, '<br>')}</div>`;
        });
        html += `</body></html>`;
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.print();
    }

    function shareConversation() {
        const conv = getCurrentConv();
        if (!conv) return;
        let text = `MedLib Nexus Conversation: ${conv.name}\n\n`;
        conv.messages.forEach(msg => {
            text += `${msg.role === 'user' ? 'You' : 'Nexus'}: ${msg.content}\n\n`;
        });
        navigator.clipboard.writeText(text).then(() => alert('Conversation copied to clipboard!'));
    }

    function setFontSize(delta) {
        fontSize = Math.min(32, Math.max(12, fontSize + delta));
        document.querySelectorAll('.message-bubble').forEach(el => {
            el.style.fontSize = fontSize + 'px';
        });
    }

    function togglePanelDarkMode() {
        panelDarkMode = !panelDarkMode;
        const panel = document.querySelector('.nexus-panel');
        if (panel) {
            if (panelDarkMode) {
                panel.classList.add('dark');
            } else {
                panel.classList.remove('dark');
            }
        }
    }

    function speakMessage(text) {
        if (!window.speechSynthesis) {
            alert('Speech synthesis not supported');
            return;
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 1.0;
        utterance.pitch = 1;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    }

    // ---------- Voice input (speech recognition) ----------
    function startVoiceInput() {
        if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
            alert('Speech recognition not supported in this browser.');
            return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.start();
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            document.getElementById('nexus-input').value = transcript;
            sendMessage(transcript);
        };
        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            alert('Could not recognize speech. Please try again.');
        };
    }

    // ---------- Send message with medical prompt and personality ----------
    async function sendMessage(initialText = null) {
        const input = document.getElementById('nexus-input');
        const text = initialText || input.value.trim();
        if (!text || isWaiting) return;

        // Check Puter availability
        let puterReady = false;
        let retries = 0;
        while (!puterReady && retries < 10) {
            if (window.puter && window.puter.ai) {
                puterReady = true;
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
            retries++;
        }
        if (!puterReady) {
            addMessage('assistant', 'Nexus is not ready. Please refresh the page and try again.');
            return;
        }

        addMessage('user', text);
        input.value = '';
        isWaiting = true;
        renderMessages();

        // Build personality prompt
        let personalityInstruction = '';
        if (personality === 'concise') personalityInstruction = 'Be concise and direct. Use bullet points when helpful.';
        else if (personality === 'usmle') personalityInstruction = 'Focus on high‑yield USMLE content. Emphasize mechanisms, clinical correlations, and exam tips.';
        else personalityInstruction = 'Provide thorough explanations with clinical context.';

        try {
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

            const raw = await puter.ai.chat(medicalPrompt, { model: 'google/gemini-2.0-flash-lite-001' });
            const clean = extractPuterMessage(raw);
            isWaiting = false;
            addMessage('assistant', clean);
        } catch (e) {
            console.error(e);
            isWaiting = false;
            addMessage('assistant', 'Nexus error: ' + (e.message || 'Request failed.'));
        }
    }

    // ---------- Voice loading ----------
    function loadVoices() {
        if (!window.speechSynthesis) return;
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) selectVoices(voices);
        window.speechSynthesis.onvoiceschanged = () => {
            selectVoices(window.speechSynthesis.getVoices());
        };
    }

    function selectVoices(voices) {
        usVoice = voices.find(v => v.lang === 'en-US' && v.name.includes('Google')) ||
                  voices.find(v => v.lang === 'en-US' && v.name.includes('Natural')) ||
                  voices.find(v => v.lang === 'en-US');
        ukVoice = voices.find(v => v.lang === 'en-GB' && v.name.includes('Google')) ||
                  voices.find(v => v.lang === 'en-GB' && v.name.includes('Natural')) ||
                  voices.find(v => v.lang === 'en-GB');
        voicesLoaded = true;
    }

    function speak(text, accent, speed) {
        if (!window.speechSynthesis) {
            alert('Speech synthesis not supported.');
            return;
        }
        if (!voicesLoaded) loadVoices();
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = accent === 'US' ? 'en-US' : 'en-GB';
        utterance.rate = speed;
        utterance.pitch = 1;
        if (accent === 'US' && usVoice) utterance.voice = usVoice;
        if (accent === 'UK' && ukVoice) utterance.voice = ukVoice;
        window.speechSynthesis.speak(utterance);
    }

    // ---------- Render messages with all new controls ----------
    function renderMessages() {
        const msgsDiv = document.getElementById('nexus-messages');
        if (!msgsDiv) return;
        const conv = getCurrentConv();
        if (!conv) return;
        let filtered = conv.messages;
        if (currentSearch) {
            filtered = conv.messages.filter(m => m.content.toLowerCase().includes(currentSearch));
        }
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
                                <button class="pin-btn" onclick="togglePinMessage(${originalIdx})" title="Pin this answer">${pinned ? '📌' : '📍'}</button>
                                <button class="speak-btn" onclick="speakMessage('${msg.content.replace(/'/g, "\\'")}')" title="Read aloud">🔊</button>
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

    // ----- New conversation management (existing) -----
    function newConversation() { ... } // unchanged from previous version
    function deleteConversation(id) { ... }
    function renameConversation(id, newName) { ... }
    function exportConversation() { ... }
    function copyMessage(text) { ... }
    // ... (we need to include all previous functions like newConversation etc.)

    // We'll reuse the previous functions for conversations – I'll include them below.

    // ========== Conversation management (same as before) ==========
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

    function copyMessage(text) {
        navigator.clipboard.writeText(text).then(() => alert('Copied!')).catch(() => alert('Failed to copy'));
    }

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

    // ---------- Create widget with all controls ----------
    function createWidget() {
        const container = document.createElement('div');
        container.id = 'nexus-container';
        container.innerHTML = `
            <style>
                /* Existing styles plus new ones */
                #nexus-container * { box-sizing: border-box; font-family: 'Inter', sans-serif; }
                .nexus-bubble { /* same as before */ }
                .nexus-panel { position: fixed; bottom: 120px; right: 30px; width: 500px; background: white; border-radius: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.3); display: none; flex-direction: column; z-index: 10001; overflow: hidden; border: 1px solid #e6f0fa; resize: both; min-width: 300px; min-height: 500px; max-width: 700px; max-height: 700px; transition: background 0.2s; }
                .nexus-panel.dark { background: #1e1e2e; color: #e0e0e0; }
                .nexus-panel.dark .nexus-panel-header { background: #0f0f1f; }
                .nexus-panel.dark .conv-tab { background: #2a2a3a; color: white; border-color: #3a3a55; }
                .nexus-panel.dark .nexus-messages { background: #1a1a2a; }
                .nexus-panel.dark .message-bubble { background: #2d2d44; color: #e0e0e0; border-color: #3a3a55; }
                .nexus-panel.dark .user .message-bubble { background: #2c7cb0; }
                .nexus-panel-header { background: #0a2942; color: white; padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; cursor: move; user-select: none; }
                .nexus-panel-header h3 { margin:0; font-size:1.3rem; display:flex; align-items:center; gap:10px; }
                .nexus-header-buttons { display: flex; gap: 12px; align-items: center; }
                .nexus-header-btn, .header-control { background: rgba(255,255,255,0.15); border: none; color: white; width: 32px; height: 32px; border-radius: 50%; font-size: 1.2rem; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: 0.2s; }
                .header-control { width: auto; border-radius: 30px; padding: 0 12px; font-size: 0.9rem; gap: 5px; }
                .nexus-header-btn:hover, .header-control:hover { background: rgba(255,255,255,0.3); }
                .conversation-tabs { display: flex; overflow-x: auto; padding: 10px 10px 0 10px; background: #f0f7ff; border-bottom: 1px solid #d0e0f0; gap: 5px; align-items: center; }
                .conv-tab { background: white; border: 1px solid #d0e0f0; border-radius: 30px 30px 0 0; padding: 6px 12px; display: flex; align-items: center; gap: 8px; cursor: pointer; white-space: nowrap; font-size: 0.9rem; border-bottom: none; }
                .conv-tab.active { background: #2c7cb0; color: white; border-color: #2c7cb0; }
                .conv-tab .conv-name { max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
                .conv-tab .delete-conv { background: transparent; border: none; color: inherit; cursor: pointer; font-size: 1.1rem; }
                .new-conv-btn { background: transparent; border: 1px dashed #2c7cb0; border-radius: 30px; padding: 5px 10px; color: #2c7cb0; font-size: 0.9rem; cursor: pointer; white-space: nowrap; display: flex; align-items: center; gap: 5px; }
                .nexus-search-area { padding: 8px 20px; background: #f9fcff; border-bottom: 1px solid #e0ecf5; }
                .nexus-search-area input { width: 100%; padding: 8px 12px; border: 1px solid #d0e0f0; border-radius: 30px; outline: none; font-size: 0.9rem; }
                .pinned-section { padding: 8px 20px; background: #f0f7ff; border-bottom: 1px solid #e0ecf5; font-size: 0.9rem; max-height: 150px; overflow-y: auto; display: none; }
                .pinned-section .section-title { margin: 0 0 8px; font-size: 1rem; color: #0a2942; }
                .pinned-item { padding: 4px 0; cursor: pointer; color: #1e4b6e; border-bottom: 1px solid #e0ecf5; }
                .pinned-item i { margin-right: 6px; color: #ffd966; }
                .nexus-messages { flex: 1; overflow-y: auto; padding: 20px; background: #f9fcff; min-height: 250px; }
                .message { display: flex; gap: 12px; margin-bottom: 20px; }
                .message.user { flex-direction: row-reverse; }
                .avatar { width: 36px; height: 36px; border-radius: 50%; background: #e6f0fa; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; }
                .user .avatar { background: #2c7cb0; color: white; }
                .bubble-wrapper { max-width: 80%; }
                .message-bubble { padding: 12px 16px; border-radius: 20px; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.08); color: #0a2942; word-wrap: break-word; line-height: 1.5; font-size: 0.95rem; }
                .user .message-bubble { background: #2c7cb0; color: white; }
                .message-footer { display: flex; align-items: center; gap: 10px; margin-top: 5px; font-size: 0.8rem; color: #8a9cb0; }
                .timestamp { font-size: 0.7rem; }
                button { background: none; border: none; cursor: pointer; color: #8a9cb0; font-size: 1rem; padding: 0 3px; }
                button:hover { color: #2c7cb0; }
                .typing .message-bubble { background: #e6f0fa; display: flex; gap: 4px; padding: 16px; }
                .typing-indicator span { animation: blink 1.4s infinite; font-size: 1.5rem; line-height: 0.5; }
                @keyframes blink { 0% { opacity: 0.2; } 20% { opacity: 1; } 100% { opacity: 0.2; } }
                .nexus-input-area { padding: 16px 20px; border-top: 1px solid #e0ecf5; display: flex; gap: 8px; background: white; align-items: center; flex-wrap: wrap; }
                .nexus-input-area textarea { flex: 1; padding: 12px 16px; border: 1px solid #d0e0f0; border-radius: 30px; resize: none; font-family: inherit; font-size: 0.95rem; outline: none; min-width: 150px; }
                .nexus-input-area button { background: #2c7cb0; color: white; border: none; border-radius: 30px; width: 48px; height: 48px; font-size: 1.2rem; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 8px rgba(44,124,176,0.3); display: inline-flex; align-items: center; justify-content: center; }
                .nexus-input-area button:disabled { background: #a0b8cc; cursor: not-allowed; }
                .suggestions { display: flex; gap: 8px; padding: 0 20px 8px; flex-wrap: wrap; }
                .suggestion-chip { background: #e6f0fa; border-radius: 40px; padding: 6px 12px; font-size: 0.8rem; cursor: pointer; color: #1e4b6e; }
                .suggestion-chip:hover { background: #cde0f0; }
                .nexus-stats { font-size: 0.7rem; color: #8a9cb0; padding: 0 20px 8px; text-align: right; }
                @media (max-width:600px) { .nexus-panel { width: 300px; right: 10px; } }
            </style>
            <div class="nexus-bubble">🩺<span class="tooltip">Ask Nexus</span></div>
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
                    <button id="nexus-mic" style="background:#555; box-shadow:none;">🎤</button>
                    <button id="nexus-share" style="background:#555; box-shadow:none;">🔗</button>
                </div>
                <div class="nexus-stats" id="nexus-stats"></div>
            </div>
        `;
        document.body.appendChild(container);

        const panel = container.querySelector('.nexus-panel');
        const bubble = container.querySelector('.nexus-bubble');
        bubble.onclick = () => { panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex'; };

        // Wire up all new buttons
        document.getElementById('nexus-font-minus').onclick = () => setFontSize(-2);
        document.getElementById('nexus-font-plus').onclick = () => setFontSize(2);
        document.getElementById('nexus-dark-toggle').onclick = togglePanelDarkMode;
        document.getElementById('nexus-personality').onchange = (e) => { personality = e.target.value; };
        document.getElementById('nexus-export').onclick = exportAsPDF;
        document.getElementById('nexus-minimize').onclick = () => panel.style.display = 'none';
        document.getElementById('nexus-close').onclick = () => panel.style.display = 'none';
        document.getElementById('nexus-send').onclick = () => sendMessage();
        document.getElementById('nexus-mic').onclick = startVoiceInput;
        document.getElementById('nexus-share').onclick = shareConversation;
        document.getElementById('nexus-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        document.getElementById('nexus-search').addEventListener('input', filterMessages);

        document.querySelectorAll('.suggestion-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const q = chip.getAttribute('data-question');
                if (q) {
                    document.getElementById('nexus-input').value = q;
                    sendMessage(q);
                }
            });
        });

        return panel;
    }

    // ---------- Dragging, selection detection, init ----------
    let isDragging = false;
    let dragOffsetX, dragOffsetY;

    function makeDraggable(header, panel) {
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.nexus-header-btn') || e.target.closest('.header-control')) return;
            isDragging = true;
            const rect = panel.getBoundingClientRect();
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;
            panel.style.cursor = 'grabbing';
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            panel.style.left = (e.clientX - dragOffsetX) + 'px';
            panel.style.top = (e.clientY - dragOffsetY) + 'px';
            panel.style.bottom = 'auto';
            panel.style.right = 'auto';
        });
        document.addEventListener('mouseup', () => {
            isDragging = false;
            panel.style.cursor = 'default';
        });
    }

    function setupSelectionDetection(iframeId, popup) {
        // This is handled by the parent page – not needed inside assistant.
    }

    function init() {
        loadConversations();
        const panel = createWidget();
        const header = panel.querySelector('.nexus-panel-header');
        makeDraggable(header, panel);
        // Expose global functions for inline callbacks
        window.togglePinMessage = togglePinMessage;
        window.editUserMessage = editUserMessage;
        window.deleteMessage = deleteMessage;
        window.copyMessage = copyMessage;
        window.speakMessage = speakMessage;
        window.scrollToMessage = (idx) => {
            const el = document.querySelector(`.message[data-idx="${idx}"]`);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
        };
        window.renameConversation = renameConversation;
        window.deleteConversation = deleteConversation;
        window.newConversation = newConversation;
        window.exportConversation = exportConversation;
        renderTabs();
        renderMessages();
        loadVoices();
    }

    init();
})();
