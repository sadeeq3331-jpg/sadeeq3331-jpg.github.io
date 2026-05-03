// mcq-generator.js – Smart MCQ Generator
(function() {
    let questionsDatabase = [];
    let currentQuestion = null;
    let currentSubject = 'Random';
    let currentDifficulty = 1;
    let hasAnswered = false;

    // Load questions from JSON
    async function loadQuestions() {
        try {
            const response = await fetch('questions.json');
            if (!response.ok) throw new Error('Failed to load questions');
            questionsDatabase = await response.json();
            console.log(`Loaded ${questionsDatabase.length} questions`);
        } catch (e) {
            console.error('MCQ Generator: error loading questions', e);
        }
    }

    // Filter questions by subject and difficulty
    function getFilteredQuestions() {
        let filtered = questionsDatabase;
        if (currentSubject !== 'Random') {
            filtered = filtered.filter(q => q.subject === currentSubject);
        }
        filtered = filtered.filter(q => q.difficulty === currentDifficulty);
        return filtered;
    }

    // Pick a random question from filtered list
    function pickRandomQuestion() {
        const filtered = getFilteredQuestions();
        if (filtered.length === 0) {
            return null;
        }
        const randomIndex = Math.floor(Math.random() * filtered.length);
        return filtered[randomIndex];
    }

    // Display question in the UI
    function renderQuestion(question) {
        if (!question) {
            document.getElementById('mcq-question-text').innerText = 'No questions available for this subject/difficulty. Please add more questions.';
            document.getElementById('mcq-options-container').innerHTML = '';
            document.getElementById('mcq-explanation').innerHTML = '';
            return;
        }
        document.getElementById('mcq-question-text').innerText = question.text;
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
        // Remove any previous highlight classes
        document.querySelectorAll('.mcq-option').forEach(opt => {
            opt.classList.remove('correct', 'wrong');
        });
    }

    // Generate a new question
    function generateQuestion() {
        const subject = document.getElementById('mcq-subject').value;
        const difficulty = parseInt(document.getElementById('mcq-difficulty').value, 10);
        currentSubject = subject;
        currentDifficulty = difficulty;
        const newQuestion = pickRandomQuestion();
        if (!newQuestion) {
            renderQuestion(null);
            return;
        }
        currentQuestion = newQuestion;
        renderQuestion(currentQuestion);
    }

    // Check answer (called from option click)
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

    // Create the UI section and inject into homepage
    function createMCQSection() {
        const mainContent = document.getElementById('mainContent');
        if (!mainContent) return;

        const mcqSection = document.createElement('div');
        mcqSection.id = 'mcq-generator-section';
        mcqSection.className = 'mcq-generator';
        mcqSection.style.cssText = 'margin: 3rem 0; padding: 2rem; background: #f9fcff; border-radius: 24px; border: 1px solid #e6f0fa;';
        mcqSection.innerHTML = `
            <h2 style="color: #0a2942; margin-bottom: 1rem;">📝 Smart MCQ Generator</h2>
            <p style="margin-bottom: 1rem;">Select a subject and difficulty level – we'll generate a random multiple‑choice question for you.</p>
            <div style="display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
                <select id="mcq-subject" style="padding: 0.5rem 1rem; border-radius: 30px; border: 1px solid #d0e0f0; background: white;">
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
                    <option value="Hematology">Hematology</option>
                    <option value="Psychiatry">Psychiatry</option>
                    <option value="Pediatrics">Pediatrics</option>
                </select>
                <select id="mcq-difficulty" style="padding: 0.5rem 1rem; border-radius: 30px; border: 1px solid #d0e0f0; background: white;">
                    <option value="1">⭐ Easy</option>
                    <option value="2">⭐⭐ Intermediate</option>
                    <option value="3">⭐⭐⭐ Hard</option>
                </select>
                <button id="generate-mcq-btn" style="background: #2c7cb0; color: white; border: none; padding: 0.5rem 1.5rem; border-radius: 30px; cursor: pointer;">Generate Question</button>
            </div>
            <div id="mcq-question-container" style="background: white; border-radius: 20px; padding: 1.5rem; margin-top: 1rem;">
                <div id="mcq-question-text" style="font-size: 1.2rem; font-weight: 600; margin-bottom: 1.5rem;">Click "Generate Question" to start.</div>
                <div id="mcq-options-container" class="mcq-options-grid"></div>
                <div id="mcq-explanation"></div>
            </div>
        `;
        // Insert after the "About MedLib" section (or at the end of mainContent)
        const aboutSection = document.getElementById('about-medlib-bottom');
        if (aboutSection) {
            aboutSection.parentNode.insertBefore(mcqSection, aboutSection.nextSibling);
        } else {
            mainContent.appendChild(mcqSection);
        }

        // Attach event listeners
        document.getElementById('generate-mcq-btn').addEventListener('click', generateQuestion);
        // Load questions and generate first one
        loadQuestions().then(() => generateQuestion());
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createMCQSection);
    } else {
        createMCQSection();
    }
})();
