// login.js
(function() {
    const auth = firebase.auth();
    const provider = new firebase.auth.GoogleAuthProvider();
    const loginBtn = document.getElementById('google-login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userSpan = document.getElementById('user-name');

    auth.onAuthStateChanged((user) => {
        if (user) {
            userSpan.textContent = user.displayName;
            loginBtn.style.display = 'none';
            logoutBtn.style.display = 'inline-block';
            // Load user data from Firestore
            loadUserData(user.uid);
        } else {
            userSpan.textContent = 'Not signed in';
            loginBtn.style.display = 'inline-block';
            logoutBtn.style.display = 'none';
        }
    });

    loginBtn.onclick = () => auth.signInWithPopup(provider);
    logoutBtn.onclick = () => auth.signOut();
})();
