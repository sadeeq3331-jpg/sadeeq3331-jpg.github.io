// nexus.js – Medical AI Assistant with Pronunciation
(function() {
    // ================================================================
    // NEXUS – Intelligent Medical Assistant (Medical Only + Pronunciation)
    // ================================================================
    
    // ---------- Configuration ----------
    const STORAGE_KEY = 'nexus_conversations';
    const MAX_MESSAGE_LENGTH = 1000;

    // ---------- Global State ----------
    let conversations = [];
    let currentConvId = null;
    let isWaiting = false;

    // Pronunciation state
    let usSpeed = 1.0;      // 1 = normal, 0.5 = slow
    let ukSpeed = 1.0;

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
    }

    function saveConversations() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
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
    }

    function replaceLastMessage(content) {
        const conv = getCurrentConv();
        if (!conv || !conv.messages.length) return;
        conv.messages[conv.messages.length - 1] = { role: 'assistant', content, timestamp: Date.now() };
        saveConversations();
        renderMessages();
    }

    function deleteMessage(index) {
        const conv = getCurrentConv();
        if (!conv) return;
        conv.messages.splice(index, 1);
        saveConversations();
        renderMessages();
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

    function copyMessage(text) {
        navigator.clipboard.writeText(text).then(() => alert('Copied!')).catch(() => alert('Failed to copy'));
    }

    // ---------- Render tabs ----------
    function renderTabs() {
        const tabs = document.getElementById('nexus-tabs');
        if (!tabs) return;
        let html = '';
        conversations.forEach(c => {
            const active = c.id === currentConvId ? 'active' : '';
            html += `<div class="conv-tab ${active}" data-id="${c.id}">
                <span class="conv-name" ondblblur="renameConversation(${c.id}, this.innerText)" contenteditable="false">${c.name}</span>
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

    // ---------- Render messages ----------
    function renderMessages() {
        const msgsDiv = document.getElementById('nexus-messages');
        if (!msgsDiv) return;
        const conv = getCurrentConv();
        if (!conv) return;
        let html = '';
        conv.messages.forEach((msg, idx) => {
            const isUser = msg.role === 'user';
            const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const avatar = isUser ? '👤' : '🤖';
            const content = isUser ? msg.content : stripTables(msg.content);
            html += `
                <div class="message ${msg.role}">
                    <div class="avatar">${avatar}</div>
                    <div class="bubble-wrapper">
                        <div class="message-bubble">${content.replace(/\n/g, '<br>')}</div>
                        <div class="message-footer">
                            <span class="timestamp">${time}</span>
                            ${!isUser ? `
                                <button class="copy-btn" onclick="copyMessage('${msg.content.replace(/'/g, "\\'")}')">📋</button>
                                <button class="delete-btn" onclick="deleteMessage(${idx})">🗑️</button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        if (isWaiting) {
            html += `
                <div class="message assistant typing">
                    <div class="avatar">🤖</div>
                    <div class="bubble-wrapper">
                        <div class="message-bubble typing-indicator"><span>.</span><span>.</span><span>.</span></div>
                    </div>
                </div>
            `;
        }
        msgsDiv.innerHTML = html;
        msgsDiv.scrollTop = msgsDiv.scrollHeight;
    }

    // ---------- Pronunciation function ----------
    function speak(text, accent, speed) {
        if (!window.speechSynthesis) {
            alert('Speech synthesis not supported in your browser.');
            return;
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = speed; // 1 = normal, 0.5 = slow
        utterance.pitch = 1;
        
        // Select voice based on accent
        const voices = window.speechSynthesis.getVoices();
        if (accent === 'US') {
            const voice = voices.find(v => v.lang === 'en-US' && v.name.includes('Google')) || 
                         voices.find(v => v.lang === 'en-US');
            if (voice) utterance.voice = voice;
        } else if (accent === 'UK') {
            const voice = voices.find(v => v.lang === 'en-GB' && v.name.includes('Google')) || 
                         voices.find(v => v.lang === 'en-GB');
            if (voice) utterance.voice = voice;
        }
        window.speechSynthesis.cancel(); // stop any ongoing speech
        window.speechSynthesis.speak(utterance);
    }

    // ---------- Send message with medical prompt ----------
    async function sendMessage(initialText = null) {
        const input = document.getElementById('nexus-input');
        const text = initialText || input.value.trim();
        if (!text || isWaiting) return;

        addMessage('user', text);
        input.value = '';
        isWaiting = true;
        renderMessages();

        try {
            if (!window.puter?.ai) throw new Error('Puter AI not available');
            
            // Medical system prompt
            const medicalPrompt = `You are a medical expert assistant called Nexus, designed exclusively for healthcare professionals and medical students. You ONLY answer questions related to medicine, physiology, pathology, pharmacology, clinical practice, and medical sciences.

For ANY non-medical question (programming, general knowledge, entertainment, etc.), respond with: "I'm a medical assistant and can only answer questions related to medicine and healthcare. Please ask a medical question."

Guidelines:
- Provide accurate, evidence-based medical information
- Include relevant clinical context when appropriate
- If a term has both medical and non-medical meanings, always interpret it in the medical context (e.g., "GLUT" = Glucose Transporter, not OpenGL)
- Be educational and clear for medical students
- Use proper medical terminology but explain when necessary
- If uncertain, acknowledge limitations

Question: ${text}`;

            const raw = await puter.ai.chat(medicalPrompt, { 
                model: 'google/gemini-2.0-flash-lite-001' 
            });
            const clean = extractPuterMessage(raw);
            isWaiting = false;
            addMessage('assistant', clean);
        } catch (e) {
            isWaiting = false;
            addMessage('assistant', 'Nexus error: ' + e.message);
        }
    }

    // ---------- Create widget with pronunciation buttons ----------
    function createWidget() {
        const container = document.createElement('div');
        container.id = 'nexus-container';
        container.innerHTML = `
            <style>
                #nexus-container * { box-sizing: border-box; font-family: 'Inter', sans-serif; }
                /* Bubble */
                .nexus-bubble {
                    position: fixed; bottom: 30px; right: 30px; width: 70px; height: 70px;
                    border-radius: 50%; background: linear-gradient(145deg, #2c7cb0, #1b4c72);
                    color: white; display: flex; align-items: center; justify-content: center;
                    cursor: pointer; box-shadow: 0 8px 25px rgba(0,0,0,0.3); z-index: 10000;
                    transition: 0.3s; border: 3px solid #ffd966; animation: pulse 2s infinite;
                    font-size: 2.8rem; line-height: 1;
                }
                @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(44,124,176,0.7); } 70% { box-shadow: 0 0 0 15px rgba(44,124,176,0); } 100% { box-shadow: 0 0 0 0 rgba(44,124,176,0); } }
                .nexus-bubble:hover { transform: scale(1.1) rotate(5deg); }
                .nexus-bubble .tooltip {
                    position: absolute; top: -35px; background: #0a2942; color: white;
                    padding: 6px 16px; border-radius: 30px; font-size: 0.9rem; opacity: 0;
                    transition: opacity 0.3s; pointer-events: none; white-space: nowrap;
                    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                }
                .nexus-bubble:hover .tooltip { opacity: 1; }
                /* Panel */
                .nexus-panel {
                    position: fixed; bottom: 120px; right: 30px; width: 450px;
                    background: #ffffff; border-radius: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.3);
                    display: none; flex-direction: column; z-index: 10001; overflow: hidden;
                    border: 1px solid #e6f0fa; resize: both; min-width: 300px; min-height: 500px;
                    max-width: 600px; max-height: 700px;
                }
                .nexus-panel-header {
                    background: #0a2942; color: white; padding: 12px 20px;
                    display: flex; align-items: center; justify-content: space-between; cursor: move;
                    user-select: none;
                }
                .nexus-panel-header h3 { margin:0; font-size:1.3rem; display:flex; align-items:center; gap:10px; }
                .nexus-header-buttons { display:flex; gap:12px; }
                .nexus-header-btn {
                    background: rgba(255,255,255,0.15); border:none; color:white; width:32px; height:32px;
                    border-radius:50%; font-size:1.2rem; cursor:pointer; display:flex; align-items:center; justify-content:center;
                    transition:0.2s; line-height:1;
                }
                .nexus-header-btn:hover { background:rgba(255,255,255,0.3); }
                .conversation-tabs {
                    display:flex; overflow-x:auto; padding:10px 10px 0 10px; background:#f0f7ff;
                    border-bottom:1px solid #d0e0f0; gap:5px; align-items:center;
                }
                .conv-tab {
                    background:white; border:1px solid #d0e0f0; border-radius:30px 30px 0 0;
                    padding:6px 12px; display:flex; align-items:center; gap:8px; cursor:pointer;
                    white-space:nowrap; font-size:0.9rem; border-bottom:none;
                }
                .conv-tab.active { background:#2c7cb0; color:white; border-color:#2c7cb0; }
                .conv-tab .conv-name { max-width:120px; overflow:hidden; text-overflow:ellipsis; }
                .conv-tab .delete-conv { background:transparent; border:none; color:inherit; cursor:pointer; font-size:1.1rem; }
                .new-conv-btn {
                    background:transparent; border:1px dashed #2c7cb0; border-radius:30px; padding:5px 10px;
                    color:#2c7cb0; font-size:0.9rem; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:5px;
                }
                .nexus-messages {
                    flex:1; overflow-y:auto; padding:20px; background:#f9fcff; min-height:250px;
                }
                .message { display:flex; gap:12px; margin-bottom:20px; }
                .message.user { flex-direction:row-reverse; }
                .avatar {
                    width:36px; height:36px; border-radius:50%; background:#e6f0fa;
                    display:flex; align-items:center; justify-content:center; font-size:1.5rem; line-height:1;
                }
                .user .avatar { background:#2c7cb0; color:white; }
                .bubble-wrapper { max-width:80%; }
                .message-bubble {
                    padding:12px 16px; border-radius:20px; background:white;
                    box-shadow:0 2px 8px rgba(0,0,0,0.08); color:#0a2942; word-wrap:break-word; line-height:1.5; font-size:0.95rem;
                }
                .user .message-bubble { background:#2c7cb0; color:white; }
                .message-footer {
                    display: flex; align-items: center; gap: 10px; margin-top: 5px; font-size: 0.8rem; color: #8a9cb0;
                }
                .timestamp { font-size:0.7rem; }
                .copy-btn, .delete-btn { background:none; border:none; cursor:pointer; color:#8a9cb0; font-size:1rem; padding:0 3px; }
                .copy-btn:hover, .delete-btn:hover { color:#2c7cb0; }
                .typing .message-bubble { background:#e6f0fa; display:flex; gap:4px; padding:16px; }
                .typing-indicator span { animation:blink 1.4s infinite; font-size:1.5rem; line-height:0.5; }
                .typing-indicator span:nth-child(2) { animation-delay:0.2s; }
                .typing-indicator span:nth-child(3) { animation-delay:0.4s; }
                @keyframes blink { 0% { opacity:0.2; } 20% { opacity:1; } 100% { opacity:0.2; } }
                .nexus-input-area {
                    padding:16px 20px; border-top:1px solid #e0ecf5; display:flex; gap:10px; background:white;
                }
                .nexus-input-area textarea {
                    flex:1; padding:12px 16px; border:1px solid #d0e0f0; border-radius:30px; resize:none;
                    font-family:inherit; font-size:0.95rem; outline:none;
                }
                .nexus-input-area textarea:focus { border-color:#2c7cb0; }
                .nexus-input-area button {
                    background:#2c7cb0; color:white; border:none; border-radius:30px; width:48px; height:48px;
                    cursor:pointer; font-size:1.5rem; transition:0.2s; box-shadow:0 4px 8px rgba(44,124,176,0.3);
                    display:flex; align-items:center; justify-content:center; line-height:1;
                }
                .nexus-input-area button:hover { background:#1b4c72; }
                .nexus-input-area button:disabled { background:#a0b8cc; box-shadow:none; cursor:not-allowed; }
                /* Selection popup with pronunciation buttons */
                .selection-popup {
                    position: absolute;
                    background: white;
                    border-radius: 40px;
                    box-shadow: 0 6px 20px rgba(0,0,0,0.25);
                    display: none;
                    z-index: 10002;
                    overflow: hidden;
                    border: 1px solid #e6f0fa;
                    font-size: 0.9rem;
                    white-space: nowrap;
                }
                .selection-option {
                    padding: 10px 20px;
                    cursor: pointer;
                    text-align: center;
                    font-weight: 600;
                    transition: 0.2s;
                    border-bottom: 1px solid #eef6ff;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                }
                .selection-option:last-child {
                    border-bottom: none;
                }
                .selection-option.nexus {
                    background: #2c7cb0;
                    color: white;
                }
                .selection-option.us {
                    background: #1dbf73;
                    color: white;
                }
                .selection-option.uk {
                    background: #ff6b6b;
                    color: white;
                }
                .selection-option:hover {
                    opacity: 0.9;
                }
                .speed-indicator {
                    font-size: 0.7rem;
                    margin-left: 4px;
                }
                @media (max-width:600px) { .nexus-panel { width:300px; right:10px; } }
            </style>
            <div class="nexus-bubble">
                🩺
                <span class="tooltip">Ask Nexus</span>
            </div>
            <div class="selection-popup" id="selection-popup">
                <div class="selection-option nexus" id="ask-nexus">🤖 Ask Nexus</div>
                <div class="selection-option us" id="speak-us">🔊 US <span class="speed-indicator" id="us-speed">1x</span></div>
                <div class="selection-option uk" id="speak-uk">🔊 UK <span class="speed-indicator" id="uk-speed">1x</span></div>
            </div>
            <div class="nexus-panel">
                <div class="nexus-panel-header">
                    <h3>🩺 Nexus</h3>
                    <div class="nexus-header-buttons">
                        <button class="nexus-header-btn" id="nexus-export">📥</button>
                        <button class="nexus-header-btn" id="nexus-minimize">−</button>
                        <button class="nexus-header-btn" id="nexus-close">✕</button>
                    </div>
                </div>
                <div class="conversation-tabs" id="nexus-tabs"></div>
                <div class="nexus-messages" id="nexus-messages"></div>
                <div class="nexus-input-area">
                    <textarea id="nexus-input" placeholder="Ask a medical question..." rows="2" maxlength="1000"></textarea>
                    <button id="nexus-send">➤</button>
                </div>
            </div>
        `;

        document.body.appendChild(container);

        // Attach event handlers
        const bubble = container.querySelector('.nexus-bubble');
        const panel = container.querySelector('.nexus-panel');
        bubble.onclick = () => {
            panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
        };

        document.getElementById('nexus-export').onclick = exportConversation;
        document.getElementById('nexus-minimize').onclick = () => { panel.style.display = 'none'; };
        document.getElementById('nexus-close').onclick = () => { panel.style.display = 'none'; };
        document.getElementById('nexus-send').onclick = () => sendMessage();
        document.getElementById('nexus-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        return { panel, popup: container.querySelector('#selection-popup') };
    }

    // ---------- Dragging ----------
    let isDragging = false;
    let dragOffsetX, dragOffsetY;

    function makeDraggable(header, panel) {
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.nexus-header-btn')) return;
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

    // ---------- Selection detection with pronunciation ----------
    function setupSelectionDetection(iframeId, popup) {
        const iframe = document.getElementById(iframeId);
        if (!iframe) return;

        function checkSelection() {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                const sel = doc.getSelection();
                const text = sel.toString().trim();
                if (text) {
                    const range = sel.getRangeAt(0);
                    const rect = range.getBoundingClientRect();
                    if (rect && rect.width > 0) {
                        const iframeRect = iframe.getBoundingClientRect();
                        popup.style.display = 'block';
                        popup.style.left = (iframeRect.left + rect.left + window.scrollX + (rect.width/2) - 100) + 'px';
                        popup.style.top = (iframeRect.top + rect.top + window.scrollY - 55) + 'px';
                        popup.setAttribute('data-text', text);
                        return;
                    }
                }
                popup.style.display = 'none';
            } catch (e) {
                popup.style.display = 'none';
            }
        }
        setInterval(checkSelection, 500);
    }

    // ---------- Initialize ----------
    function init() {
        loadConversations();
        const { panel, popup } = createWidget();
        const header = panel.querySelector('.nexus-panel-header');
        makeDraggable(header, panel);

        // Attach global functions for event handlers
        window.newConversation = newConversation;
        window.deleteConversation = deleteConversation;
        window.renameConversation = renameConversation;
        window.copyMessage = copyMessage;
        window.deleteMessage = deleteMessage;
        window.exportConversation = exportConversation;

        // Selection popup actions
        const askNexusBtn = document.getElementById('ask-nexus');
        const speakUsBtn = document.getElementById('speak-us');
        const speakUkBtn = document.getElementById('speak-uk');
        const usSpeedSpan = document.getElementById('us-speed');
        const ukSpeedSpan = document.getElementById('uk-speed');

        askNexusBtn.onclick = () => {
            const text = popup.getAttribute('data-text');
            if (text) {
                document.getElementById('nexus-input').value = text;
                panel.style.display = 'flex';
                popup.style.display = 'none';
                sendMessage(text);
            }
        };

        speakUsBtn.onclick = () => {
            const text = popup.getAttribute('data-text');
            if (text) {
                // Toggle speed: normal -> slow -> normal
                usSpeed = (usSpeed === 1.0) ? 0.5 : 1.0;
                usSpeedSpan.innerText = usSpeed === 1.0 ? '1x' : '½x';
                speak(text, 'US', usSpeed);
            }
            popup.style.display = 'none';
        };

        speakUkBtn.onclick = () => {
            const text = popup.getAttribute('data-text');
            if (text) {
                ukSpeed = (ukSpeed === 1.0) ? 0.5 : 1.0;
                ukSpeedSpan.innerText = ukSpeed === 1.0 ? '1x' : '½x';
                speak(text, 'UK', ukSpeed);
            }
            popup.style.display = 'none';
        };

        // Load voices (some browsers need a little time)
        if (window.speechSynthesis) {
            window.speechSynthesis.getVoices(); // triggers loading
        }

        setupSelectionDetection('bookFrame', popup);

        renderTabs();
        renderMessages();
    }

    init();
})();
