// pronunciation.js – Standalone pronunciation tool
(function() {
    let usSpeed = 1.0;
    let ukSpeed = 1.0;
    let voicesLoaded = false;
    let usVoice = null;
    let ukVoice = null;

    function loadVoices() {
        if (!window.speechSynthesis) return;
        const voices = window.speechSynthesis.getVoices();
        if (voices.length) selectVoices(voices);
        window.speechSynthesis.onvoiceschanged = () => selectVoices(window.speechSynthesis.getVoices());
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
        if (!window.speechSynthesis) { alert('Speech not supported'); return; }
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
    window.speakUS = (text) => speak(text, 'US', usSpeed);
    window.speakUK = (text) => speak(text, 'UK', ukSpeed);
    window.toggleUSSpeed = () => { usSpeed = usSpeed === 1.0 ? 0.5 : 1.0; return usSpeed; };
    window.toggleUKSpeed = () => { ukSpeed = ukSpeed === 1.0 ? 0.5 : 1.0; return ukSpeed; };
    loadVoices();
})();
