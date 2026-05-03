// mcq-generator.js – AI‑powered MCQ generator using Puter (Nexus AI)
(function() {
    // ---------- Configuration ----------
    const RATE_LIMIT_WINDOW = 60000;      // 60 seconds
    const MAX_CALLS_PER_WINDOW = 3;
    let callTimestamps = [];
    let cache = {};                        // store generated questions per subject/difficulty
    let currentQuestion = null;
    let currentSubject = 'Random';
    let currentDifficulty = 1;
    let hasAnswered = false;

    // ---------- Helper: check rate limit ----------
    function isRateLimited() {
        const now = Date.now();
        callTimestamps = callTimestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW);
        const canProceed = callTimestamps.length < MAX_CALLS_PER_WINDOW;
        if (!canProceed) {
            alert(`Please wait a moment. You can generate up to ${MAX_CALLS_PER_WINDOW} questions per minute.`);
        }
        return !canProceed;
    }

    function recordCall() {
        callTimestamps.push(Date.now());
    }

    // ---------- AI prompt construction ----------
    function buildPrompt(subject, difficulty) {
        const difficultyText = difficulty === 1 ? "easy (foundational knowledge)" :
                               difficulty === 2 ? "intermediate (clinical application)" :
                               "hard (integrative, multi‑step reasoning)";
        return `You are a medical educator creating a high‑quality USMLE‑style multiple‑choice question for medical students.
Subject: ${subject}
Difficulty: ${difficultyText} (${difficulty} star${difficulty > 1 ? 's' : ''})

Generate a single, step‑1‑style multiple‑choice question with:
1. A clinical vignette (title: "Question").
2. Five answer options labeled A, B, C, D, E.
3. One correct answer.
4. A detailed explanation (why the correct answer is right and why the others are wrong).
5. (Optional) a one‑sentence clinical pearl.

Return ONLY valid JSON in this format (no extra text, no markdown):
{
  "question": "...",
  "options": ["A. ...", "B. ...", "C. ...", "D. ...", "E. ..."],
  "correct": "A",
  "explanation": "..."
}`;
    }

    // ---------- Call AI via Puter ----------
    async function generateQuestionFromAI(subject, difficulty) {
        if (isRateLimited()) return null;
        recordCall();

        const prompt = buildPrompt(subject, difficulty);
        try {
            if (!window.puter || !window.puter.ai) {
                throw new Error('Puter AI not available. Make sure Puter script is loaded.');
            }
            const raw = await puter.ai.chat(prompt, {
                model: 'google/gemini-2.0-flash-lite-001'
            });
            let jsonText = raw.trim();
            // Remove markdown code fences if present
            jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            return JSON.parse(jsonText);
        } catch (e) {
            console.error('AI generation failed:', e);
            return null;
        }
    }

    // ---------- Get or generate question ----------
    async function getOrGenerateQuestion(subject, difficulty, forceRegenerate = false) {
        const cacheKey = `${subject}_${difficulty}`;
        if (!forceRegenerate && cache[cacheKey]) {
            return cache[cacheKey];
        }
        const newQ = await generateQuestionFromAI(subject, difficulty);
        if (newQ) {
            cache[cacheKey] = newQ;
        }
        return newQ;
    }

    // ---------- Render question in UI ----------
    function renderQuestion(question) {
        if (!question) {
            document.getElementById('mcq-question-text').innerText = '❌ Failed to generate question. Please try again later.';
            document.getElementById('mcq-options-container').innerHTML = '';
            document.getElementById('mcq-explanation').innerHTML = '';
            return;
        }
        document.getElementById('mcq-question-text').innerText = question.question;
        let optionsHtml = '';
        question.options.forEach(opt => {
            const letter = opt.charAt(0);
            const text = opt.substring(2);
            optionsHtml += `
                <div class="mcq-option" data-letter="${letter}" onclick="window.checkMCQAnswer('${letter}')">
                    <span class="mcq-opt-letter">${letter}</span>
                    <span class="mcq-opt-text">${text}</span>
                </div>
            `;
        });
        document.getElementById('mcq-options-container').innerHTML = optionsHtml;
        document.getElementById('mcq-explanation').innerHTML = '';
        hasAnswered = false;
        // Remove previous highlight classes
        document.querySelectorAll('.mcq-option').forEach(opt => {
            opt.classList.remove('correct', 'wrong');
        });
    }

    // ---------- Generate (first time or re‑generate) ----------
    async function generateQuestion(forceRegenerate = false) {
        const subjectSelect = document.getElementById('mcq-subject');
        const difficultySelect = document.getElementById('mcq-difficulty');
        currentSubject = subjectSelect.value;
        currentDifficulty = parseInt(difficultySelect.value, 10);

        // Show loading state
        const questionDiv = document.getElementById('mcq-question-text');
        questionDiv.innerText = '🧠 Generating a fresh question... (may take a few seconds)';
        document.getElementById('mcq-options-container').innerHTML = '';
        document.getElementById('mcq-explanation').innerHTML = '';

        const newQuestion = await getOrGenerateQuestion(currentSubject, currentDifficulty, forceRegenerate);
        if (newQuestion) {
            currentQuestion = newQuestion;
            renderQuestion(currentQuestion);
        } else {
            questionDiv.innerText = '⚠️ Generation failed. Please try again in a moment.';
        }
    }

    // ---------- Re‑generate (force new AI call) ----------
    async function regenerateQuestion() {
        await generateQuestion(true);
    }

    // ---------- Answer checking (global for onclick) ----------
    window.checkMCQAnswer = function(selectedLetter) {
        if (!currentQuestion || hasAnswered) return;
        hasAnswered = true;
        const isCorrect = (selectedLetter === currentQuestion.correct);

        // Highlight all options
        const options = document.querySelectorAll('.mcq-option');
        options.forEach(opt => {
            const letter = opt.getAttribute('data-letter');
            if (letter === currentQuestion.correct) {
                opt.classList.add('correct');
            } else if (letter === selectedLetter && !isCorrect) {
                opt.classList.add('wrong');
            }
        });

        // Show explanation
        const explanationDiv = document.getElementById('mcq-explanation');
        explanationDiv.innerHTML = `
            <div class="mcq-explanation-box">
                <strong>${isCorrect ? '✓ Correct!' : '✗ Incorrect'}</strong><br>
                Correct answer: ${currentQuestion.correct}. ${currentQuestion.options.find(opt => opt.startsWith(currentQuestion.correct)).substring(2)}<br><br>
                <strong>Explanation:</strong> ${currentQuestion.explanation}
            </div>
        `;
    };

    // ---------- Create and inject UI into homepage ----------
    function createMCQSection() {
        const mainContent = document.getElementById('mainContent');
        if (!mainContent) return;

        // Check if section already exists
        if (document.getElementById('mcq-generator-section')) return;

        const mcqSection = document.createElement('div');
        mcqSection.id = 'mcq-generator-section';
        mcqSection.className = 'mcq-generator';
        mcqSection.style.cssText = 'margin: 3rem 0; padding: 2rem; background: #f9fcff; border-radius: 24px; border: 1px solid #e6f0fa;';
        mcqSection.innerHTML = `
            <h2 style="color: #0a2942; margin-bottom: 1rem;">📝 Smart MCQ Generator (AI‑Powered)</h2>
            <p style="margin-bottom: 1rem;">Select a subject and difficulty – Nexus AI will generate a fresh USMLE‑style question for you.</p>
            <div style="display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; align-items: center;">
                <select id="mcq-subject" style="padding: 0.5rem 1rem; border-radius: 30px; border: 1px solid #d0e0f0;">
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
                <select id="mcq-difficulty" style="padding: 0.5rem 1rem; border-radius: 30px; border: 1px solid #d0e0f0;">
                    <option value="1">⭐ Easy</option>
                    <option value="2">⭐⭐ Intermediate</option>
                    <option value="3">⭐⭐⭐ Hard</option>
                </select>
                <button id="generate-mcq-btn" style="background: #2c7cb0; color: white; border: none; padding: 0.5rem 1.5rem; border-radius: 30px; cursor: pointer;">Generate</button>
                <button id="regenerate-mcq-btn" style="background: #ffc107; color: #0a2942; border: none; padding: 0.5rem 1.5rem; border-radius: 30px; cursor: pointer;">⟳ Re‑generate</button>
            </div>
            <div id="mcq-question-container" style="background: white; border-radius: 20px; padding: 1.5rem;">
                <div id="mcq-question-text" style="font-size: 1.2rem; font-weight: 600; margin-bottom: 1.5rem;">Click "Generate" to start.</div>
                <div id="mcq-options-container" class="mcq-options-grid"></div>
                <div id="mcq-explanation"></div>
            </div>
        `;
        // Insert after the "About MedLib" section (or at the end of mainContent)
        const aboutSection = document.getElementById('about-medlib-bottom');
        if (aboutSection && aboutSection.parentNode) {
            aboutSection.parentNode.insertBefore(mcqSection, aboutSection.nextSibling);
        } else {
            mainContent.appendChild(mcqSection);
        }

        // Attach event listeners
        document.getElementById('generate-mcq-btn').addEventListener('click', () => generateQuestion(false));
        document.getElementById('regenerate-mcq-btn').addEventListener('click', () => regenerateQuestion());
    }

    // Wait for DOM and for Puter to be ready, then inject the section
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                // Small delay to ensure mainContent is fully rendered
                setTimeout(createMCQSection, 500);
            });
        } else {
            setTimeout(createMCQSection, 500);
        }
    }
    init();
})();
