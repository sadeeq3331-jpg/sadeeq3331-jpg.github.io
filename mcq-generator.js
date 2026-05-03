// mcq-generator.js – AI-powered MCQ generator (Puter Nexus AI) – v2.0 (fixed + cool UI)
(function () {
  // ---------- CONFIGURATION ----------
  const RATE_LIMIT_WINDOW = 60_000;      // 1 minute
  const MAX_CALLS_PER_WINDOW = 3;
  let callTimestamps = [];
  const cache = {};
  let currentQuestion = null;
  let currentSubject = 'Random';
  let currentDifficulty = 1;
  let hasAnswered = false;

  // ---------- RATE LIMITER ----------
  function isRateLimited() {
    const now = Date.now();
    callTimestamps = callTimestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW);
    if (callTimestamps.length >= MAX_CALLS_PER_WINDOW) {
      alert(`⏳ You've reached the limit. Please wait a moment (${MAX_CALLS_PER_WINDOW} per minute).`);
      return true;
    }
    return false;
  }

  function recordCall() {
    callTimestamps.push(Date.now());
  }

  // ---------- AI PROMPT ----------
  function buildPrompt(subject, difficulty) {
    const levels = {
      1: 'easy (foundational knowledge)',
      2: 'intermediate (clinical application)',
      3: 'hard (integrative, multi‑step reasoning)'
    };
    const diffText = levels[difficulty] || levels[2];
    return `You are a medical educator creating a high-quality USMLE-style multiple-choice question.
Subject: ${subject}
Difficulty: ${diffText} (${'⭐'.repeat(difficulty)})

Generate ONE multiple‑choice question with:
1. A clinical vignette (field: "question").
2. Five answer options labeled A–E (list of strings).
3. One correct answer (field: "correct", just the letter).
4. A detailed explanation (field: "explanation").

Output ONLY valid JSON in this exact format:
{
  "question": "...",
  "options": ["A. ...", "B. ...", "C. ...", "D. ...", "E. ..."],
  "correct": "A",
  "explanation": "..."
}`;
  }

  // ---------- SAFELY EXTRACT TEXT FROM PUTER RESPONSE ----------
  function extractTextFromResponse(raw) {
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object') {
      // common shapes: { message: { content: "..." } }, { text: "..." }, { choices: [...] }, etc.
      return raw.message?.content
          || raw.text
          || raw.content
          || raw.choices?.[0]?.message?.content
          || raw.choices?.[0]?.text
          || JSON.stringify(raw);  // fallback
    }
    return String(raw || '');
  }

  // ---------- AI GENERATION (with fix) ----------
  async function generateQuestionFromAI(subject, difficulty) {
    if (isRateLimited()) return null;
    recordCall();

    const prompt = buildPrompt(subject, difficulty);
    try {
      if (!window.puter?.ai) {
        throw new Error('Puter AI not loaded. Please refresh the page.');
      }
      const rawResponse = await puter.ai.chat(prompt, {
        model: 'google/gemini-2.0-flash-lite-001'
      });

      // 1. extract the actual text from the response
      let jsonText = extractTextFromResponse(rawResponse);

      // 2. strip markdown code fences if present
      jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

      // 3. parse JSON
      const parsed = JSON.parse(jsonText);

      // basic validation
      if (!parsed.question || !Array.isArray(parsed.options) || !parsed.correct) {
        throw new Error('Incomplete AI response');
      }
      return parsed;
    } catch (error) {
      console.error('AI generation failed:', error);
      return null;
    }
  }

  // ---------- CACHE LAYER ----------
  async function getOrGenerateQuestion(subject, difficulty, force = false) {
    const key = `${subject}_${difficulty}`;
    if (!force && cache[key]) return cache[key];
    const q = await generateQuestionFromAI(subject, difficulty);
    if (q) cache[key] = q;
    return q;
  }

  // ---------- RENDER QUESTION IN UI ----------
  function renderQuestion(question) {
    const questionEl = document.getElementById('mcq-question-text');
    const optionsEl = document.getElementById('mcq-options-container');
    const explanationEl = document.getElementById('mcq-explanation');

    if (!question) {
      questionEl.innerText = '❌ Failed to generate question. Try again later.';
      optionsEl.innerHTML = '';
      explanationEl.innerHTML = '';
      return;
    }

    questionEl.innerText = question.question;
    let html = '';
    question.options.forEach(opt => {
      const letter = opt.charAt(0);
      const text = opt.substring(2).trim();
      html += `
        <button class="mcq-option" data-letter="${letter}" onclick="window.checkMCQAnswer('${letter}')">
          <span class="mcq-opt-letter">${letter}</span>
          <span class="mcq-opt-text">${text}</span>
        </button>`;
    });
    optionsEl.innerHTML = html;
    explanationEl.innerHTML = '';
    hasAnswered = false;

    // Reset option styling
    document.querySelectorAll('.mcq-option').forEach(btn => {
      btn.classList.remove('correct', 'wrong', 'disabled');
      btn.disabled = false;
    });
  }

  // ---------- LOADING STATE ----------
  function setLoading(isLoading) {
    const questionEl = document.getElementById('mcq-question-text');
    if (isLoading) {
      questionEl.innerHTML = '🧠 Generating a fresh question <span class="loading-dots">...</span>';
      document.getElementById('mcq-options-container').innerHTML = '';
      document.getElementById('mcq-explanation').innerHTML = '';
    }
  }

  // ---------- GENERATE / REGENERATE ----------
  async function generateQuestion(forceRegenerate = false) {
    const subject = document.getElementById('mcq-subject').value;
    const difficulty = parseInt(document.getElementById('mcq-difficulty').value, 10);
    currentSubject = subject;
    currentDifficulty = difficulty;

    setLoading(true);
    const newQ = await getOrGenerateQuestion(subject, difficulty, forceRegenerate);
    if (newQ) {
      currentQuestion = newQ;
      renderQuestion(currentQuestion);
    } else {
      document.getElementById('mcq-question-text').innerText = '⚠️ Generation failed. Please try again in a moment.';
    }
  }

  async function regenerateQuestion() {
    await generateQuestion(true);
  }

  // ---------- ANSWER CHECKING ----------
  window.checkMCQAnswer = function (selectedLetter) {
    if (!currentQuestion || hasAnswered) return;
    hasAnswered = true;

    const isCorrect = selectedLetter === currentQuestion.correct;

    // Highlight all option buttons
    document.querySelectorAll('.mcq-option').forEach(btn => {
      const letter = btn.getAttribute('data-letter');
      btn.disabled = true;
      if (letter === currentQuestion.correct) {
        btn.classList.add('correct');
      } else if (letter === selectedLetter && !isCorrect) {
        btn.classList.add('wrong');
      }
    });

    // Show explanation
    const correctOption = currentQuestion.options.find(opt => opt.startsWith(currentQuestion.correct));
    const explanationHtml = `
      <div class="mcq-explanation-box ${isCorrect ? 'correct' : 'incorrect'}">
        <strong>${isCorrect ? '✅ Correct!' : '❌ Incorrect'}</strong><br>
        <span class="correct-answer">Correct answer: ${currentQuestion.correct}. ${correctOption?.substring(2) || ''}</span>
        <p><strong>Explanation:</strong> ${currentQuestion.explanation}</p>
      </div>`;
    document.getElementById('mcq-explanation').innerHTML = explanationHtml;
  };

  // ---------- BUILD AND INJECT THE UI ----------
  function createMCQSection() {
    const mainContent = document.getElementById('mainContent');
    if (!mainContent) return;
    if (document.getElementById('mcq-generator-section')) return;

    const section = document.createElement('div');
    section.id = 'mcq-generator-section';
    section.innerHTML = `
      <div class="mcq-glass-panel">
        <h2 class="mcq-title">🧬 Smart MCQ Generator</h2>
        <p class="mcq-subtitle">Nexus AI will create a fresh USMLE‑style question just for you.</p>

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
          </div>
        </div>

        <div id="mcq-question-card">
          <div id="mcq-question-text" class="mcq-question-text">Click "Generate" to start.</div>
          <div id="mcq-options-container" class="mcq-options-grid"></div>
          <div id="mcq-explanation"></div>
        </div>
      </div>
    `;

    // Insert after About MedLib or at the end
    const about = document.getElementById('about-medlib-bottom');
    if (about && about.parentNode) {
      about.parentNode.insertBefore(section, about.nextSibling);
    } else {
      mainContent.appendChild(section);
    }

    // Attach events
    document.getElementById('generate-mcq-btn').addEventListener('click', () => generateQuestion(false));
    document.getElementById('regenerate-mcq-btn').addEventListener('click', regenerateQuestion);
  }

  // ---------- INJECT CSS (once) ----------
  function injectStyles() {
    if (document.getElementById('mcq-styles')) return;
    const style = document.createElement('style');
    style.id = 'mcq-styles';
    style.textContent = `
      /* ---------- COOL GLASS PANEL ---------- */
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

      .mcq-subtitle {
        margin-bottom: 2rem;
        opacity: 0.8;
        font-size: 1.1rem;
      }

      /* ---------- CONTROLS ---------- */
      .mcq-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        align-items: center;
        margin-bottom: 2rem;
      }

      .mcq-select {
        padding: 0.75rem 1.75rem;
        border-radius: 50px;
        border: 1px solid rgba(0,0,0,0.1);
        background: rgba(255,255,255,0.9);
        backdrop-filter: blur(10px);
        font-size: 1rem;
        font-weight: 500;
        outline: none;
        transition: all 0.2s;
        cursor: pointer;
      }

      .mcq-select:hover {
        border-color: #2c7cb0;
        box-shadow: 0 4px 12px rgba(44,124,176,0.2);
      }

      .mcq-buttons {
        display: flex;
        gap: 0.75rem;
      }

      .mcq-btn {
        padding: 0.75rem 2rem;
        border-radius: 50px;
        font-weight: 600;
        border: none;
        cursor: pointer;
        backdrop-filter: blur(10px);
        transition: all 0.2s;
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      }

      .mcq-btn.primary {
        background: linear-gradient(135deg, #2c7cb0, #1f5a82);
        color: white;
      }

      .mcq-btn.warning {
        background: #ffc107;
        color: #0a2942;
      }

      .mcq-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(0,0,0,0.15);
      }

      /* ---------- QUESTION CARD ---------- */
      #mcq-question-card {
        background: white;
        border-radius: 24px;
        padding: 2rem;
        box-shadow: 0 10px 30px rgba(0,0,0,0.06);
      }

      .mcq-question-text {
        font-size: 1.2rem;
        font-weight: 600;
        margin-bottom: 1.5rem;
        line-height: 1.6;
      }

      .mcq-options-grid {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .mcq-option {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1rem 1.25rem;
        border-radius: 16px;
        border: 2px solid #e0e7f0;
        background: #f9fcff;
        cursor: pointer;
        transition: all 0.2s;
        text-align: left;
        font-size: 1rem;
      }

      .mcq-option:hover:not(.disabled) {
        border-color: #2c7cb0;
        background: #eef6ff;
        transform: translateX(4px);
      }

      .mcq-opt-letter {
        font-weight: 800;
        font-size: 1.3rem;
        width: 2.2rem;
        height: 2.2rem;
        background: #dce9f5;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #1e3c72;
      }

      .mcq-option.correct {
        border-color: #28a745;
        background: #e8f5e9;
      }

      .mcq-option.correct .mcq-opt-letter {
        background: #28a745;
        color: white;
      }

      .mcq-option.wrong {
        border-color: #dc3545;
        background: #fbeaea;
      }

      .mcq-option.wrong .mcq-opt-letter {
        background: #dc3545;
        color: white;
      }

      .mcq-option.disabled {
        opacity: 0.6;
        cursor: default;
      }

      /* ---------- EXPLANATION ---------- */
      .mcq-explanation-box {
        margin-top: 2rem;
        padding: 1.25rem;
        border-radius: 18px;
        font-size: 0.95rem;
        line-height: 1.7;
        border-left: 5px solid;
      }

      .mcq-explanation-box.correct {
        background: #e8f5e9;
        border-color: #28a745;
      }

      .mcq-explanation-box.incorrect {
        background: #fbeaea;
        border-color: #dc3545;
      }

      .correct-answer {
        font-weight: 600;
      }

      /* Loading animation */
      .loading-dots::after {
        content: '';
        animation: dots 1.5s steps(4, end) infinite;
      }

      @keyframes dots {
        0% { content: '.'; }
        25% { content: '..'; }
        50% { content: '...'; }
        75% { content: '....'; }
        100% { content: '.'; }
      }

      /* ---------- MOBILE ---------- */
      @media (max-width: 600px) {
        .mcq-glass-panel {
          padding: 1.5rem;
          border-radius: 24px;
        }
        .mcq-title {
          font-size: 1.5rem;
        }
        .mcq-controls {
          flex-direction: column;
          align-items: stretch;
        }
        .mcq-buttons {
          flex-direction: column;
        }
        .mcq-btn {
          width: 100%;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ---------- INIT ----------
  function init() {
    injectStyles();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(createMCQSection, 600);
      });
    } else {
      setTimeout(createMCQSection, 600);
    }
  }

  init();
})();
