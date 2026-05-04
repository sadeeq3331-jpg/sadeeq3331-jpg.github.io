// login.js – Enhanced Google Sign‑In for MedLib
(function() {
    // Wait until Firebase is available (in case scripts load out of order)
    if (typeof firebase === 'undefined' || !firebase.auth) {
        console.warn('Firebase not yet loaded. Retrying in 200ms...');
        setTimeout(arguments.callee, 200);
        return;
    }

    const auth = firebase.auth();
    const provider = new firebase.auth.GoogleAuthProvider();

    // ---------- DOM elements ----------
    const loginBtn = document.getElementById('google-login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userNameEl = document.getElementById('user-name');
    // Optional: add an <img id="user-avatar" ...> in your top-bar for the avatar
    const userAvatarEl = document.getElementById('user-avatar');

    // ---------- Helper: loading state ----------
    function setLoading(btn, isLoading) {
        if (!btn) return;
        if (isLoading) {
            btn.classList.add('loading');
            btn.disabled = true;
        } else {
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    }

    // ---------- Helper: show error (reuses existing notification system) ----------
    function notify(msg) {
        // Use the global notification function if it exists
        if (typeof showNotification === 'function') {
            showNotification(msg);
        } else {
            console.warn(msg);
            // Fallback: alert (not great, but better than silence)
            alert(msg);
        }
    }

    // ---------- Auth state observer ----------
    auth.onAuthStateChanged((user) => {
        setLoading(loginBtn, false);
        setLoading(logoutBtn, false);

        if (user) {
            // Signed in
            if (userNameEl) {
                userNameEl.textContent = user.displayName || 'User';
            }
            // Show avatar if element exists and user has a photo
            if (userAvatarEl) {
                if (user.photoURL) {
                    userAvatarEl.src = user.photoURL;
                    userAvatarEl.alt = user.displayName || 'User avatar';
                    userAvatarEl.classList.add('show');
                } else {
                    userAvatarEl.classList.remove('show');
                }
            }
            loginBtn.style.display = 'none';
            logoutBtn.style.display = 'inline-flex';
        } else {
            // Signed out
            if (userNameEl) {
                userNameEl.textContent = 'Not signed in';
            }
            if (userAvatarEl) {
                userAvatarEl.classList.remove('show');
                userAvatarEl.src = '';
            }
            loginBtn.style.display = 'inline-flex';
            logoutBtn.style.display = 'none';
        }
    });

    // ---------- Sign In ----------
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            setLoading(loginBtn, true);
            try {
                await auth.signInWithPopup(provider);
                // onAuthStateChanged will handle success UI
            } catch (error) {
                setLoading(loginBtn, false);
                console.error('Sign-in error:', error);
                // Friendly messages for common errors
                if (error.code === 'auth/popup-closed-by-user') {
                    notify('Sign-in popup closed. If this keeps happening, check your browser’s popup settings or disable any ad blocker.');
                } else if (error.code === 'auth/cancelled-popup-request') {
                    // User just closed the popup – ignore quietly
                } else {
                    notify(error.message || 'Sign-in failed. Please try again.');
                }
            }
        });
    }

    // ---------- Sign Out ----------
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            setLoading(logoutBtn, true);
            try {
                await auth.signOut();
                // onAuthStateChanged handles UI
            } catch (error) {
                setLoading(logoutBtn, false);
                console.error('Sign-out error:', error);
                notify('Sign-out failed. Please try again.');
            }
        });
    }

    // ---------- Ripple effect for all icon buttons ----------
    function createRipple(event) {
        const btn = event.currentTarget;
        const ripple = document.createElement('span');
        const rect = btn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
        ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
        ripple.className = 'ripple';
        btn.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove());
    }

    document.querySelectorAll('.icon-btn').forEach(btn => {
        btn.addEventListener('click', createRipple);
    });
})();
