<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in with Google</title>
  <!-- Firebase SDKs (updated for modular CDN) -->
  <script src="https://www.gstatic.com/firebasejs/10.11.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.11.0/firebase-auth-compat.js"></script>
  <style>
    /* ---------- CSS Reset & Base ---------- */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      transition: background 0.6s ease;
    }

    /* ---------- Card Container ---------- */
    .auth-card {
      width: 100%;
      max-width: 400px;
      background: rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-radius: 2rem;
      padding: 2.5rem 2rem;
      box-shadow: 0 25px 45px rgba(0, 0, 0, 0.2);
      text-align: center;
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.2);
      transition: transform 0.3s ease, box-shadow 0.3s ease;
      animation: fadeSlideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .auth-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 30px 50px rgba(0, 0, 0, 0.3);
    }

    @keyframes fadeSlideUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* ---------- User Info Area ---------- */
    .user-avatar {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid rgba(255, 255, 255, 0.6);
      margin: 0 auto 1rem;
      background: rgba(255, 255, 255, 0.2);
      display: none; /* shown only when signed in */
      transition: transform 0.3s ease, opacity 0.3s ease;
    }

    .user-avatar.show {
      display: block;
      animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    @keyframes popIn {
      0% { transform: scale(0); opacity: 0; }
      80% { transform: scale(1.1); }
      100% { transform: scale(1); opacity: 1; }
    }

    .user-name {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      word-break: break-word;
    }

    .user-email {
      font-size: 0.9rem;
      opacity: 0.85;
      margin-bottom: 1.5rem;
      word-break: break-word;
    }

    /* ---------- Buttons ---------- */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      border: none;
      border-radius: 3rem;
      padding: 0.85rem 2rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.25s ease;
      outline: none;
      width: 100%;
      max-width: 280px;
      margin: 0.4rem auto;
      position: relative;
      overflow: hidden;
    }

    .btn:active {
      transform: scale(0.96);
    }

    .btn-google {
      background: #ffffff;
      color: #1f1f1f;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
    }

    .btn-google:hover {
      background: #f1f3f4;
      box-shadow: 0 12px 25px rgba(0, 0, 0, 0.2);
    }

    .btn-google:focus-visible {
      outline: 3px solid #fff;
      outline-offset: 2px;
    }

    .btn-logout {
      background: rgba(255, 255, 255, 0.2);
      color: #fff;
      backdrop-filter: blur(5px);
      border: 1px solid rgba(255, 255, 255, 0.3);
    }

    .btn-logout:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .btn .icon {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    /* ---------- Loading Spinner ---------- */
    .spinner {
      display: inline-block;
      width: 18px;
      height: 18px;
      border: 2px solid transparent;
      border-top-color: currentColor;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      margin-right: 0.25rem;
      display: none;
    }

    .btn.loading .spinner {
      display: inline-block;
    }

    .btn.loading .btn-text {
      opacity: 0.7;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* ---------- Error / Status Message ---------- */
    .status-message {
      margin-top: 1rem;
      padding: 0.7rem 1rem;
      border-radius: 0.75rem;
      font-size: 0.9rem;
      background: rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(4px);
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.3s ease, transform 0.3s ease;
      word-break: break-word;
    }

    .status-message.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .status-message.error {
      background: rgba(255, 80, 80, 0.25);
      border-left: 4px solid #ff5e5e;
    }

    /* ---------- Responsive Tweaks ---------- */
    @media (max-width: 480px) {
      .auth-card {
        padding: 2rem 1.5rem;
        border-radius: 1.5rem;
      }
      .btn {
        max-width: 100%;
        padding: 0.75rem 1.5rem;
      }
      .user-name {
        font-size: 1.3rem;
      }
    }
  </style>
</head>
<body>
  <div class="auth-card">
    <!-- Avatar shown when signed in -->
    <img id="user-avatar" class="user-avatar" src="" alt="User avatar" />

    <!-- User name display -->
    <div id="user-name" class="user-name">Not signed in</div>
    <div id="user-email" class="user-email"></div>

    <!-- Google Sign-In Button -->
    <button id="google-login-btn" class="btn btn-google">
      <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      <span class="btn-text">Sign in with Google</span>
      <span class="spinner"></span>
    </button>

    <!-- Logout Button -->
    <button id="logout-btn" class="btn btn-logout" style="display: none;">
      <svg class="icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1"/>
      </svg>
      <span class="btn-text">Sign out</span>
      <span class="spinner"></span>
    </button>

    <!-- Status / Error message -->
    <div id="status-message" class="status-message"></div>
  </div>

  <script>
    (function() {
      // -------------------- Firebase config --------------------
      // Replace with your own Firebase project configuration
      const firebaseConfig = {
        apiKey: "YOUR_API_KEY",
        authDomain: "YOUR_PROJECT.firebaseapp.com",
        projectId: "YOUR_PROJECT_ID",
        storageBucket: "YOUR_PROJECT.appspot.com",
        messagingSenderId: "YOUR_SENDER_ID",
        appId: "YOUR_APP_ID"
      };

      // Initialize Firebase (if not already initialized elsewhere)
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }

      const auth = firebase.auth();
      const provider = new firebase.auth.GoogleAuthProvider();

      // DOM elements
      const loginBtn = document.getElementById('google-login-btn');
      const logoutBtn = document.getElementById('logout-btn');
      const userNameEl = document.getElementById('user-name');
      const userEmailEl = document.getElementById('user-email');
      const userAvatarEl = document.getElementById('user-avatar');
      const statusMsgEl = document.getElementById('status-message');

      // Helper: show status message (auto-hide after delay for non-errors)
      function showStatus(message, isError = false) {
        statusMsgEl.textContent = message;
        statusMsgEl.classList.toggle('error', isError);
        statusMsgEl.classList.add('visible');
        if (!isError) {
          setTimeout(() => {
            statusMsgEl.classList.remove('visible');
          }, 4000);
        }
      }

      function clearStatus() {
        statusMsgEl.classList.remove('visible', 'error');
      }

      // Helper: set loading state on a button
      function setLoading(btn, isLoading) {
        if (isLoading) {
          btn.classList.add('loading');
          btn.disabled = true;
        } else {
          btn.classList.remove('loading');
          btn.disabled = false;
        }
      }

      // -------------------- Auth state observer --------------------
      auth.onAuthStateChanged((user) => {
        // Reset loading states whenever auth state changes
        setLoading(loginBtn, false);
        setLoading(logoutBtn, false);
        clearStatus();

        if (user) {
          // Signed in
          userNameEl.textContent = user.displayName || 'User';
          userEmailEl.textContent = user.email || '';
          userEmailEl.style.display = 'block';

          // Avatar
          if (user.photoURL) {
            userAvatarEl.src = user.photoURL;
            userAvatarEl.alt = user.displayName || 'User avatar';
            userAvatarEl.classList.add('show');
          } else {
            userAvatarEl.classList.remove('show');
          }

          loginBtn.style.display = 'none';
          logoutBtn.style.display = 'inline-flex';
          showStatus(`Welcome, ${user.displayName || 'user'}!`);
        } else {
          // Signed out
          userNameEl.textContent = 'Not signed in';
          userEmailEl.textContent = '';
          userEmailEl.style.display = 'none';
          userAvatarEl.classList.remove('show');
          userAvatarEl.src = '';

          loginBtn.style.display = 'inline-flex';
          logoutBtn.style.display = 'none';
        }
      });

      // -------------------- Sign In --------------------
      loginBtn.addEventListener('click', async () => {
        clearStatus();
        setLoading(loginBtn, true);
        try {
          await auth.signInWithPopup(provider);
          // onAuthStateChanged will handle UI update
        } catch (error) {
          console.error('Sign-in error:', error);
          setLoading(loginBtn, false);
          // Provide user-friendly messages for common errors
          if (error.code === 'auth/popup-closed-by-user') {
            showStatus('Sign-in popup closed. Please try again.', true);
          } else if (error.code === 'auth/cancelled-popup-request') {
            // Ignore; user just closed the popup
          } else {
            showStatus(error.message || 'Sign-in failed. Please try again.', true);
          }
        }
      });

      // -------------------- Sign Out --------------------
      logoutBtn.addEventListener('click', async () => {
        clearStatus();
        setLoading(logoutBtn, true);
        try {
          await auth.signOut();
          // onAuthStateChanged will update UI
        } catch (error) {
          console.error('Sign-out error:', error);
          setLoading(logoutBtn, false);
          showStatus('Sign-out failed. Please try again.', true);
        }
      });

      // -------------------- Responsive & Engaging details --------------------
      // Button ripple effect for tactile feedback (optional)
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

      // Add ripple CSS dynamically
      const styleSheet = document.createElement('style');
      styleSheet.textContent = `
        .btn {
          position: relative;
          overflow: hidden;
        }
        .ripple {
          position: absolute;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.4);
          transform: scale(0);
          animation: rippleEffect 0.6s linear;
          pointer-events: none;
        }
        @keyframes rippleEffect {
          to {
            transform: scale(4);
            opacity: 0;
          }
        }
        .btn-google .ripple {
          background: rgba(0,0,0,0.1);
        }
      `;
      document.head.appendChild(styleSheet);

      loginBtn.addEventListener('click', createRipple);
      logoutBtn.addEventListener('click', createRipple);

      // Adjust ripple on touch devices (passive)
      loginBtn.addEventListener('touchstart', function(e) {
        // just to ensure mobile click fires properly
      }, {passive: true});

      // Keyboard accessibility: Enter/Space should activate buttons
      [loginBtn, logoutBtn].forEach(btn => {
        btn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            btn.click();
          }
        });
      });
    })();
  </script>
</body>
</html>
