// mcq-generator.js – v3.0 (concept rotation, wrong-answer follow-up, study mode, anti-truncation)
(function () {
  // ---------- CONFIG ----------
  const RATE_LIMIT_WINDOW = 60_000;
  const MAX_CALLS_PER_WINDOW = 3;
  let callTimestamps = [];
  const cache = {};
  let currentQuestion = null;
  let currentSubject = 'Random';
  let currentDifficulty = 1;
  let hasAnswered = false;
  let isStudyMode = false;
  let wrongAnswerCount = 0;
  let recentConcepts = [];
  const MAX_RECENT_CONCEPTS = 3;
  window._lastSelectedLetter = '';

  // ---------- RATE LIMITER ----------
  function isRateLimited() {
    const now = Date.now();
    callTimestamps = callTimestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW);
    if (callTimestamps.length >= MAX_CALLS_PER_WINDOW) {
      alert(`⏳ Rate limit reached (${MAX_CALLS_PER_WINDOW}/min). Please wait.`);
      return true;
    }
    return false;
  }
  function recordCall() { callTimestamps.push(Date.now()); }

  // ---------- PROMPTS ----------
  function buildPrompt(subject, difficulty, avoidConcepts = []) {
    const levels = { 1: 'easy (foundational)', 2: 'intermediate (clinical application)', 3: 'hard (integrative, multi-step reasoning)' };
    const diffText = levels[difficulty] || levels[2];
    let avoidance = '';
    if (avoidConcepts.length) {
      avoidance = `\nIMPORTANT: Avoid these recently used topics/concepts: ${avoidConcepts.join(', ')}. Generate a completely different medical concept.`;
    }
    return `You are a medical educator creating a high-quality USMLE-style multiple-choice question.
Subject: ${subject}
Difficulty: ${diffText} (${'⭐'.repeat(difficulty)})${avoidance}

Generate ONE multiple‑choice question with:
1. A clinical vignette (field: "question").
2. Five answer options labeled A–E.
3. One correct answer (field: "correct", just the letter).
4. A concise, complete explanation (under 300 words, no cut‑offs).

Output ONLY valid JSON in this exact format:
{
  "question": "...",
  "options": ["A. ...", "B. ...", "C. ...", "D. ...", "E. ..."],
  "correct": "A",
  "explanation": "..."
}`;
  }

  function buildFollowUpPrompt(originalQuestion, userAnswer, correctAnswer) {
    return `A medical student answered the following question INCORRECTLY:
Original question: "${originalQuestion.question}"
Their answer: ${userAnswer}
Correct answer: ${correctAnswer}

Generate a NEW follow‑up multiple‑choice question on the SAME concept/topic to reinforce learning. Make it slightly easier or rephrased, but still test understanding. Keep explanation under 300 words. Output JSON format same as before.`;
  }

  // ---------- RESPONSE EXTRACTION ----------
  function extractTextFromResponse(raw) {
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object') {
      return raw.message?.content || raw.text || raw.content
        || raw.choices?.[0]?.message?.content || raw.choices?.[0]?.text
        || JSON.stringify(raw);
    }
    return String(raw || '');
  }

  // ---------- SHUFFLE OPTIONS ----------
  function shuffleOptionsAndCorrect(question) {
    if (!question || !Array.isArray(question.options) || question.options.length === 0) return question;
    const texts = question.options.map(opt => {
      const match = opt.match(/^[A-E]\.\s*(.+)/);
      return match ? match[1] : opt;
    });
    const correctLetter = question.correct.trim().toUpperCase();
    const correctText = texts['ABCDE'.indexOf(correctLetter)];
    if (!correctText) return question;
    const shuffled = [...texts];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const newOptions = shuffled.map((text, idx) => `${String.fromCharCode(65 + idx)}. ${text}`);
    const newCorrectIndex = shuffled.indexOf(correctText);
    if (newCorrectIndex === -1) return question;
    return { ...question, options: newOptions, correct: String.fromCharCode(65 + newCorrectIndex) };
  }

  function trackConcept(question) {
    const words = question.question?.split(/\s+/).slice(0, 3).join(' ') || '';
    recentConcepts.push(words);
    while (recentConcepts.length > MAX_RECENT_CONCEPTS) recentConcepts.shift();
  }

  // ---------- AI GENERATION ----------
  async function generateQuestionFromAI(prompt) {
    if (isRateLimited()) return null;
    recordCall();
    try {
      if (!window.puter?.ai) throw new Error('Puter AI not loaded.');
      const rawResponse = await puter.ai.chat(prompt, { model: 'google/gemini-2.0-flash-lite-001' });
      let jsonText = extractTextFromResponse(rawResponse);
      jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(jsonText);
      if (!parsed.question || !Array.isArray(parsed.options) || !parsed.correct) {
        throw new Error('Incomplete AI response');
      }
      const randomised = shuffleOptionsAndCorrect(parsed);
      return randomised;
    } catch (e) {
      console.error('AI generation failed:', e);
      return null;
    }
  }

  async function getOrGenerateQuestion(subject, difficulty, forceRegenerate = false, isFollowUp = false) {
    const key = `${subject}_${difficulty}`;
    if (!forceRegenerate && !isFollowUp && cache[key]) {
      const cachedQ = cache[key];
      const words = cachedQ.question?.split(/\s+/).slice(0, 3).join(' ') || '';
      if (!recentConcepts.includes(words)) return cachedQ; // else fall through to regenerate
    }
    const prompt = buildPrompt(subject, difficulty, recentConcepts);
    const newQ = await generateQuestionFromAI(prompt);
    if (newQ) {
      trackConcept(newQ);
      if (!isFollowUp) cache[key] = newQ;
      return newQ;
    }
    return null;
  }

  async function generateFollowUpQuestion() {
    if (!currentQuestion) return null;
    const prompt = buildFollowUpPrompt(currentQuestion, window._lastSelectedLetter, currentQuestion.correct);
    return await generateQuestionFromAI(prompt);
  }

  // ---------- RENDER ----------
  function renderQuestion(question) {
    const questionEl = document.getElementById('mcq-question-text');
    const optionsEl = document.getElementById('mcq-options-container');
    const explanationEl = document.getElementById('mcq-explanation');
    if (!question) {
      questionEl.innerText = '❌ Failed to generate question.';
      optionsEl.innerHTML = '';
      explanationEl.innerHTML = '';
      return;
    }
    questionEl.innerText = question.question;
    let html = '';
    question.options.forEach(opt => {
      const letter = opt.charAt(0);
      const text = opt.substring(2).trim();
      html += `<button class="mcq-option" data-letter="${letter}" onclick="window.checkMCQAnswer('${letter}')">
        <span class="mcq-opt-letter">${letter}</span><span class="mcq-opt-text">${text}</span>
      </button>`;
    });
    optionsEl.innerHTML = html;
    explanationEl.innerHTML = '';
    hasAnswered = false;
    document.querySelectorAll('.mcq-option').forEach(btn => {
      btn.classList.remove('correct', 'wrong', 'disabled');
      btn.disabled = false;
    });
  }

  function setLoading(isLoading) {
    const questionEl = document.getElementById('mcq-question-text');
    if (isLoading) {
      questionEl.innerHTML = '🧠 Generating a fresh question <span class="loading-dots">...</span>';
      document.getElementById('mcq-options-container').innerHTML = '';
      document.getElementById('mcq-explanation').innerHTML = '';
    }
  }

  async function generateQuestion(forceRegenerate = false, isFollowUp = false) {
    const subject = document.getElementById('mcq-subject').value;
    const difficulty = parseInt(document.getElementById('mcq-difficulty').value, 10);
    currentSubject = subject;
    currentDifficulty = difficulty;
    setLoading(true);
    const newQ = await getOrGenerateQuestion(subject, difficulty, forceRegenerate, isFollowUp);
    if (newQ) {
      currentQuestion = newQ;
      renderQuestion(currentQuestion);
    } else {
      document.getElementById('mcq-question-text').innerText = '⚠️ Generation failed. Try again.';
    }
  }

  async function regenerateQuestion() {
    await generateQuestion(true);
  }

  // ---------- ANSWER CHECKING ----------
  window.checkMCQAnswer = function (selectedLetter) {
    if (!currentQuestion || hasAnswered) return;
    hasAnswered = true;
    window._lastSelectedLetter = selectedLetter;
    const isCorrect = selectedLetter === currentQuestion.correct;

    document.querySelectorAll('.mcq-option').forEach(btn => {
      const letter = btn.getAttribute('data-letter');
      btn.disabled = true;
      if (letter === currentQuestion.correct) btn.classList.add('correct');
      else if (letter === selectedLetter && !isCorrect) btn.classList.add('wrong');
    });

    const correctOption = currentQuestion.options.find(opt => opt.startsWith(currentQuestion.correct));
    let explanationHtml = `
      <div class="mcq-explanation-box ${isCorrect ? 'correct' : 'incorrect'}">
        <strong>${isCorrect ? '✅ Correct!' : '❌ Incorrect'}</strong><br>
        <span>Correct: ${currentQuestion.correct}. ${correctOption?.substring(2) || ''}</span>
        <p><strong>Explanation:</strong> ${currentQuestion.explanation}</p>
      </div>`;

    // Study Mode: auto chain follow-up
    if (isStudyMode) {
      explanationHtml += `<p style="margin-top:10px;"><em>Study Mode: loading next concept check…</em></p>`;
      document.getElementById('mcq-explanation').innerHTML = explanationHtml;
      setTimeout(async () => {
        const followUp = await generateFollowUpQuestion();
        if (followUp) {
          currentQuestion = followUp;
          renderQuestion(currentQuestion);
        } else {
          generateQuestion(true);
        }
      }, 1000);
      return;
    }

    // Non-study mode: show follow-up button only if wrong and not spamming
    if (!isCorrect) {
      wrongAnswerCount++;
      if (wrongAnswerCount <= 2) {
        explanationHtml += `
          <div style="margin-top:12px; background:#f0f4ff; padding:10px; border-radius:12px;">
            <button id="follow-up-btn" class="mcq-btn primary small">🔁 Try a follow‑up question on this topic</button>
            <span style="margin-left:10px; font-size:0.9rem;">(to reinforce your understanding)</span>
          </div>`;
      }
    }

    document.getElementById('mcq-explanation').innerHTML = explanationHtml;

    // Attach event to follow-up button if present
    const followBtn = document.getElementById('follow-up-btn');
    if (followBtn) {
      followBtn.addEventListener('click', async () => {
        setLoading(true);
        const followUp = await generateFollowUpQuestion();
        if (followUp) {
          currentQuestion = followUp;
          renderQuestion(currentQuestion);
        } else {
          generateQuestion(true);
        }
      });
    }
  };

  // ---------- STUDY MODE TOGGLE ----------
  function toggleStudyMode() {
    isStudyMode = !isStudyMode;
    const btn = document.getElementById('study-mode-toggle');
    if (btn) {
      btn.innerText = isStudyMode ? '📘 Study Mode ON' : '📘 Study Mode OFF';
      btn.style.background = isStudyMode ? '#28a745' : '#6c757d';
    }
    // Reset and start fresh
    generateQuestion(true);
  }

  // ---------- UI CREATION ----------
  function createMCQSection() {
    const mainContent = document.getElementById('mainContent');
    if (!mainContent) return;
    if (document.getElementById('mcq-generator-section')) return;

    const section = document.createElement('div');
    section.id = 'mcq-generator-section';
    section.innerHTML = `
      <div class="mcq-glass-panel">
        <h2 class="mcq-title">🧬 Smart MCQ Generator</h2>
        <p class="mcq-subtitle">Nexus AI creates USMLE‑style questions. Wrong answer? Get a follow‑up to learn deeply.</p>
        <div class="mcq-controls">
          <select id="mcq-subject" class="mcq-select">
            <option value="Random">🎲 Random</option>
            <option value="Biochemistry">Biochemistry</option>
            <option value="Cardiology">Cardiology</option>
            <option value="Neurology">Neurology</option>
            <option value="Pharmacology">Pharmacology</option>
            <option value="Genetics">Genetics</option>
            <option value="Immunology">Immunology</option>
            <option value="Microbiology">Microbiology</option>
            <option value="Respiratory">Respiratory</option>
            <option value="Gastroenterology">Gastroenterology</option>
            <option value="Endocrinology">Endocrinology</option>
            <option value="Renal">Renal</option>
            <option value="Reproductive">Reproductive</option>
            <option value="Musculoskeletal">Musculoskeletal</option>
            <option value="Hematology">Hematology</option>
            <option value="Psychiatry">Psychiatry</option>
            <option value="Pediatrics">Pediatrics</option>
            <option value="Emergency">Emergency</option>
            <option value="Toxicology">Toxicology</option>
            <option value="Clinical Skills">Clinical Skills</option>
            <option value="Nutrition">Nutrition</option>
          </select>
          <select id="mcq-difficulty" class="mcq-select">
            <option value="1">⭐ Easy</option>
            <option value="2">⭐⭐ Intermediate</option>
            <option value="3">⭐⭐⭐ Hard</option>
          </select>
          <div class="mcq-buttons">
            <button id="generate-mcq-btn" class="mcq-btn primary">✨ Generate</button>
            <button id="regenerate-mcq-btn" class="mcq-btn warning">🔄 Re‑generate</button>
            <button id="study-mode-toggle" class="mcq-btn" style="background:#6c757d; color:white;">📘 Study Mode OFF</button>
          </div>
        </div>
        <div id="mcq-question-card">
          <div id="mcq-question-text" class="mcq-question-text">Click "Generate" to start.</div>
          <div id="mcq-options-container" class="mcq-options-grid"></div>
          <div id="mcq-explanation"></div>
        </div>
      </div>`;

    // Insert after About MedLib
    const about = document.getElementById('about-medlib-bottom');
    if (about && about.parentNode) {
      about.parentNode.insertBefore(section, about.nextSibling);
    } else {
      mainContent.appendChild(section);
    }

    // Events
    document.getElementById('generate-mcq-btn').addEventListener('click', () => generateQuestion(false));
    document.getElementById('regenerate-mcq-btn').addEventListener('click', regenerateQuestion);
    document.getElementById('study-mode-toggle').addEventListener('click', toggleStudyMode);
  }

  // ---------- CSS (Glassmorphism) ----------
  function injectStyles() {
    if (document.getElementById('mcq-styles')) return;
    const style = document.createElement('style');
    style.id = 'mcq-styles';
    style.textContent = `
      .mcq-glass-panel {
        background: rgba(255,255,255,0.7);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-radius: 32px;
        border: 1px solid rgba(255,255,255,0.5);
        box-shadow: 0 20px 50px rgba(0,20,40,0.15);
        padding: 2.5rem;
        margin: 2rem 0;
        color: #0a2942;
      }
      .mcq-title {
        font-size: 2rem;
        font-weight: 700;
        margin-bottom: 0.5rem;
        background: linear-gradient(135deg, #1e3c72, #2a5298);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .mcq-subtitle { margin-bottom: 2rem; opacity: 0.8; font-size: 1.1rem; }
      .mcq-controls { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; margin-bottom: 2rem; }
      .mcq-select {
        padding: 0.75rem 1.75rem; border-radius: 50px; border: 1px solid rgba(0,0,0,0.1);
        background: rgba(255,255,255,0.9); backdrop-filter: blur(10px);
        font-size: 1rem; font-weight: 500; outline: none; cursor: pointer;
      }
      .mcq-select:hover { border-color: #2c7cb0; box-shadow: 0 4px 12px rgba(44,124,176,0.2); }
      .mcq-buttons { display: flex; gap: 0.75rem; }
      .mcq-btn {
        padding: 0.75rem 2rem; border-radius: 50px; font-weight: 600; border: none; cursor: pointer;
        backdrop-filter: blur(10px); transition: all 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      }
      .mcq-btn.primary { background: linear-gradient(135deg, #2c7cb0, #1f5a82); color: white; }
      .mcq-btn.warning { background: #ffc107; color: #0a2942; }
      .mcq-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.15); }
      .mcq-btn.small { padding: 0.5rem 1.2rem; font-size: 0.85rem; }
      #mcq-question-card {
        background: white; border-radius: 24px; padding: 2rem;
        box-shadow: 0 10px 30px rgba(0,0,0,0.06);
      }
      .mcq-question-text { font-size: 1.2rem; font-weight: 600; margin-bottom: 1.5rem; line-height: 1.6; }
      .mcq-options-grid { display: flex; flex-direction: column; gap: 0.75rem; }
      .mcq-option {
        display: flex; align-items: center; gap: 1rem; padding: 1rem 1.25rem;
        border-radius: 16px; border: 2px solid #e0e7f0; background: #f9fcff;
        cursor: pointer; transition: all 0.2s; text-align: left; font-size: 1rem;
      }
      .mcq-option:hover:not(.disabled) { border-color: #2c7cb0; background: #eef6ff; transform: translateX(4px); }
      .mcq-opt-letter {
        font-weight: 800; font-size: 1.3rem; width: 2.2rem; height: 2.2rem;
        background: #dce9f5; border-radius: 50%; display: flex; align-items: center;
        justify-content: center; color: #1e3c72;
      }
      .mcq-option.correct { border-color: #28a745; background: #e8f5e9; }
      .mcq-option.correct .mcq-opt-letter { background: #28a745; color: white; }
      .mcq-option.wrong { border-color: #dc3545; background: #fbeaea; }
      .mcq-option.wrong .mcq-opt-letter { background: #dc3545; color: white; }
      .mcq-option.disabled { opacity: 0.6; cursor: default; }
      .mcq-explanation-box {
        margin-top: 2rem; padding: 1.25rem; border-radius: 18px;
        font-size: 0.95rem; line-height: 1.7; border-left: 5px solid;
      }
      .mcq-explanation-box.correct { background: #e8f5e9; border-color: #28a745; }
      .mcq-explanation-box.incorrect { background: #fbeaea; border-color: #dc3545; }
      .correct-answer { font-weight: 600; }
      .loading-dots::after { content: ''; animation: dots 1.5s steps(4, end) infinite; }
      @keyframes dots {
        0% { content: '.'; } 25% { content: '..'; } 50% { content: '...'; } 75% { content: '....'; } 100% { content: '.'; }
      }
      @media (max-width: 600px) {
        .mcq-glass-panel { padding: 1.5rem; border-radius: 24px; }
        .mcq-title { font-size: 1.5rem; }
        .mcq-controls { flex-direction: column; align-items: stretch; }
        .mcq-buttons { flex-direction: column; }
        .mcq-btn { width: 100%; }
      }
    `;
    document.head.appendChild(style);
  }

  // ---------- INIT ----------
  function init() {
    injectStyles();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(createMCQSection, 600));
    } else {
      setTimeout(createMCQSection, 600);
    }
  }
  init();
})();
