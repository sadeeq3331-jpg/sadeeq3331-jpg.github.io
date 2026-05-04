// app.js – Main MedLib logic (books, categories, favorites, bookmarks, viewer, etc.)
let books = [];
let recentBooks = [];
let favorites = [];
let bookmarks = [];
const BOOKMARKS_KEY = 'medlib_bookmarks';

function getStaticCount() { return Math.floor(Math.random() * 800) + 700; }

function loadUserData() {
    const storedRecent = localStorage.getItem('medlib_recent');
    if (storedRecent) recentBooks = JSON.parse(storedRecent);
    const storedFav = localStorage.getItem('medlib_favorites');
    if (storedFav) favorites = JSON.parse(storedFav);
    const storedBookmarks = localStorage.getItem(BOOKMARKS_KEY);
    if (storedBookmarks) bookmarks = JSON.parse(storedBookmarks);
}
function saveRecent() { localStorage.setItem('medlib_recent', JSON.stringify(recentBooks)); }
function saveFavorites() { localStorage.setItem('medlib_favorites', JSON.stringify(favorites)); }
function saveBookmarks() { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks)); }

function addToRecent(bookId) {
    recentBooks = recentBooks.filter(id => id !== bookId);
    recentBooks.unshift(bookId);
    if (recentBooks.length > 5) recentBooks.pop();
    saveRecent();
    renderRecent();
}

window.toggleFavorite = function(bookId) {
    if (favorites.includes(bookId)) {
        favorites = favorites.filter(id => id !== bookId);
    } else {
        favorites.push(bookId);
    }
    saveFavorites();
    if (typeof window.syncFavoritesUpdate === 'function') window.syncFavoritesUpdate(favorites);
    renderFavorites();
    if (document.querySelector('.book-grid')) renderCurrentBooks();
};

function isFavorite(bookId) { return favorites.includes(bookId); }

function addBookmark(bookId, title, url) {
    if (bookmarks.some(b => b.bookId === bookId)) {
        showNotification('Already bookmarked!');
        return;
    }
    bookmarks.push({ bookId, title, url, timestamp: Date.now() });
    saveBookmarks();
    if (typeof window.syncBookmarksUpdate === 'function') window.syncBookmarksUpdate(bookmarks);
    renderBookmarks();
    showNotification('Bookmarked!');
}

function removeBookmark(bookId) {
    bookmarks = bookmarks.filter(b => b.bookId !== bookId);
    saveBookmarks();
    if (typeof window.syncBookmarksUpdate === 'function') window.syncBookmarksUpdate(bookmarks);
    renderBookmarks();
}

function renderBookmarks() {
    const container = document.getElementById('bookmarks-section');
    if (!container) return;
    if (bookmarks.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';
    let html = `<div class="section-title"><h2><i class="fas fa-bookmark"></i> My Bookmarks</h2></div><div class="bookmarks-grid">`;
    bookmarks.forEach(b => {
        const book = books.find(bk => bk.id === b.bookId);
        const img = book ? getCategoryImage(book.category) : 'https://placehold.co/500x300/0a2942/white?text=Book';
        html += `<div class="bookmark-card" onclick="openBook('${b.url}', ${b.bookId})" style="background-image: url('${img}');">
                    <i class="fas fa-bookmark"></i>
                    <h3>${b.title}</h3>
                    <p>Click to open</p>
                    <button class="delete-bookmark" onclick="event.stopPropagation(); removeBookmark(${b.bookId})">Remove</button>
                </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

function shareBook(title, filename) {
    const url = `${window.location.origin}/#book=${encodeURIComponent(filename)}`;
    navigator.clipboard.writeText(url).then(() => showNotification('Book link copied!'));
}

function shareCategory(catName) {
    const url = `${window.location.origin}/#cat=${encodeURIComponent(catName)}`;
    navigator.clipboard.writeText(url).then(() => showNotification('Category link copied!'));
}

function showNotification(msg) {
    const notif = document.getElementById('notification');
    const span = document.getElementById('notificationMessage');
    if (notif && span) {
        span.innerText = msg;
        notif.style.display = 'block';
        setTimeout(() => notif.style.display = 'none', 3000);
    }
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('mainPanel').classList.remove('shifted');
}

function closeSidebarAndDo(action) {
    closeSidebar();
    setTimeout(() => action(), 50);
}

function openBookWithSidebarClose(filename, bookId) {
    closeSidebar();
    setTimeout(() => openBook(filename, bookId), 50);
}

function selectCategory(catName) {
    closeSidebarAndDo(() => {
        window.location.hash = 'cat=' + encodeURIComponent(catName);
        filterCategory(catName);
    });
}

function goToHome() {
    closeSidebar();
    window.location.hash = '';
    renderHome();
}

function filterCategory(catName) {
    const results = books.filter(b => b.category === catName);
    displayBooks(results, catName + ' Textbooks');
}

function showAllBooks() {
    displayBooks(books, 'All Textbooks');
}

function searchBooks() {
    const input = document.getElementById('searchInput');
    const term = input.value.toLowerCase().trim();
    if (!term) { showNotification('Enter a search term'); return; }
    const results = books.filter(b =>
        b.title.toLowerCase().includes(term) ||
        b.author.toLowerCase().includes(term) ||
        b.category.toLowerCase().includes(term) ||
        (b.subcat && b.subcat.toLowerCase().includes(term))
    );
    if (results.length === 0) {
        showNotification('No books found');
        document.getElementById('mainContent').innerHTML =
            `<div style="text-align:center; padding:3rem; color:#555;">
                <i class="fas fa-search" style="font-size:3rem; opacity:0.3;"></i>
                <h3 style="margin-top:1rem;">No results for "${term}"</h3>
                <p>Try a different keyword or browse categories.</p>
            </div>`;
    } else {
        displayBooks(results, `Search: "${term}"`);
        window.location.hash = '';
    }
    // Show clear button if text present
    updateClearSearchButton();
}

function clearSearchInput() {
    const input = document.getElementById('searchInput');
    input.value = '';
    updateClearSearchButton();
    input.focus();
}

function updateClearSearchButton() {
    const btn = document.getElementById('clearSearch');
    const input = document.getElementById('searchInput');
    if (btn) {
        btn.classList.toggle('visible', input.value.length > 0);
    }
}

let currentViewerBookId = null;
let progressInterval = null;
let viewerActive = false;

function openBook(filename, bookId) {
    const viewer = document.getElementById('bookViewer');
    const frame = document.getElementById('bookFrame');
    if (!viewer || !frame) return;
    frame.src = filename;
    viewer.style.display = 'block';
    document.body.style.overflow = 'hidden';
    addToRecent(bookId);
    currentViewerBookId = bookId;
    window.currentBookId = bookId; // for notes.js
    viewerActive = true;

    if (progressInterval) clearInterval(progressInterval);
    progressInterval = setInterval(() => {
        try {
            const doc = frame.contentDocument || frame.contentWindow.document;
            const scrollTop = doc.documentElement.scrollTop || doc.body.scrollTop;
            const scrollHeight = doc.documentElement.scrollHeight || doc.body.scrollHeight;
            const clientHeight = doc.documentElement.clientHeight || doc.body.clientHeight;
            const percent = (scrollTop / (scrollHeight - clientHeight)) * 100;
            const progressBar = document.getElementById('readingProgress');
            if (progressBar) progressBar.style.width = percent + '%';
        } catch(e) { /* cross-origin or blank – ignore */ }
    }, 200);

    history.pushState({ viewerOpen: true, bookId, filename }, '', window.location.href);
}

function closeViewer() {
    const viewer = document.getElementById('bookViewer');
    const frame = document.getElementById('bookFrame');
    if (viewer) viewer.style.display = 'none';
    if (frame) frame.src = '';
    document.body.style.overflow = 'auto';
    if (progressInterval) clearInterval(progressInterval);
    currentViewerBookId = null;
    window.currentBookId = null;
    viewerActive = false;
}

window.addEventListener('popstate', function(event) {
    if (viewerActive) {
        closeViewer();
        history.replaceState({}, '', window.location.href);
        // No event.preventDefault() needed – popstate is not cancellable
        return;
    }
});

function loadFromHash() {
    const hash = window.location.hash.slice(1);
    if (hash.startsWith('cat=')) {
        try {
            const cat = decodeURIComponent(hash.substring(4));
            filterCategory(cat);
        } catch(e) {
            console.warn('Invalid hash, resetting');
            window.location.hash = '';
        }
    } else if (hash.startsWith('book=')) {
        const filename = decodeURIComponent(hash.substring(5));
        const book = books.find(b => b.filename === filename);
        if (book) openBook(book.filename, book.id);
    }
}

window.addEventListener('hashchange', function() {
    const hash = window.location.hash.slice(1);
    if (hash.startsWith('cat=')) {
        try {
            const cat = decodeURIComponent(hash.substring(4));
            filterCategory(cat);
        } catch(e) {
            console.warn('Invalid hash, resetting');
            window.location.hash = '';
        }
    } else if (hash === '') {
        renderHome();
    }
});

async function displayBooks(bookList, title) {
    const main = document.getElementById('mainContent');
    let html = `<div class="section-title"><h2><i class="fas fa-book-open"></i> ${title}</h2><span class="view-all" onclick="goToHome()">Back to Home</span></div>`;
    html += '<div class="book-grid">';
    for (const book of bookList) {
        const count = getStaticCount();
        html += createBookCard(book, count);
    }
    html += '</div>';
    main.innerHTML = html;
}

function createBookCard(book, count) {
    const favClass = isFavorite(book.id) ? 'fas fa-star' : 'far fa-star';
    const favColor = isFavorite(book.id) ? '#ffd966' : '#888';
    return `
        <div class="book-card" data-id="${book.id}">
            <div class="book-cover" style="background-image: url('${getCategoryImage(book.category)}');" onclick="openBook('${book.filename}', ${book.id})">
                <i class="fas fa-book"></i>
                <span class="book-category">${book.category}</span>
            </div>
            <div class="book-info">
                <div class="book-title">
                    ${book.title}
                    <div class="book-actions">
                        <button onclick="event.stopPropagation(); toggleFavorite(${book.id})" style="color:${favColor}" aria-label="Favorite"><i class="${favClass}"></i></button>
                        <button onclick="event.stopPropagation(); shareBook('${book.title.replace(/'/g, "\\'")}', '${book.filename}')" aria-label="Share link"><i class="fas fa-link"></i></button>
                        <button onclick="event.stopPropagation(); addBookmark(${book.id}, '${book.title.replace(/'/g, "\\'")}', '${book.filename}')" aria-label="Bookmark"><i class="fas fa-bookmark"></i></button>
                    </div>
                </div>
                <div class="book-author">by ${book.author}</div>
                <div class="book-stats">
                    <span><i class="fas fa-file-alt"></i> ${book.pages} pages</span>
                    <span><i class="fas fa-users"></i> ${count} readers</span>
                </div>
                <button class="read-btn" onclick="event.stopPropagation(); openBook('${book.filename}', ${book.id})">Read Now</button>
            </div>
        </div>
    `;
}

function getCategoryIcon(cat) {
    const icons = {
        'Biochemistry':'fa-flask','Genetics':'fa-dna','Immunology':'fa-shield-alt',
        'Microbiology':'fa-bacteria','General Pathology':'fa-microscope','General Pharmacology':'fa-pills',
        'Research':'fa-chart-bar','Respiratory':'fa-lungs','Cardiology':'fa-heart','Neurology':'fa-brain',
        'Gastroenterology':'fa-stomach','Endocrinology':'fa-hormone','Renal':'fa-kidney','Reproductive':'fa-venus-mars',
        'Musculoskeletal':'fa-bone','Hematology':'fa-blood','Dermatology':'fa-hand','Psychiatry':'fa-brain',
        'Ophthalmology':'fa-eye','Pediatrics':'fa-child','Emergency':'fa-ambulance','Clinical Skills':'fa-stethoscope',
        'Nutrition':'fa-apple-alt','Question Bank':'fa-question-circle'
    };
    return icons[cat] || 'fa-book';
}

function getCategoryImage(cat) {
    const images = {
        'Biochemistry': 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=500',
        'Genetics': 'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=500',
        'Immunology': 'https://images.unsplash.com/photo-1576086212638-5f2a8d3d4f5b?w=500',
        'Microbiology': 'https://images.unsplash.com/photo-1581091226033-d5c48150dbaa?w=500',
        'General Pathology': 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=500',
        'General Pharmacology': 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=500',
        'Research': 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=500',
        'Respiratory': 'https://images.unsplash.com/photo-1584636633446-2d1f5b4f4b4a?w=500',
        'Cardiology': 'https://images.unsplash.com/photo-1549737221-bef5e5607b7a?w=500',
        'Neurology': 'https://images.unsplash.com/photo-1559757175-7cb057fbaedc?w=500',
        'Gastroenterology': 'https://images.unsplash.com/photo-1579158951263-7a0e6f8a5b0e?w=500',
        'Endocrinology': 'https://images.unsplash.com/photo-1579158951263-7a0e6f8a5b0e?w=500',
        'Renal': 'https://images.unsplash.com/photo-1579158951263-7a0e6f8a5b0e?w=500',
        'Reproductive': 'https://images.unsplash.com/photo-1579158951263-7a0e6f8a5b0e?w=500',
        'Musculoskeletal': 'https://images.unsplash.com/photo-1579158951263-7a0e6f8a5b0e?w=500',
        'Hematology': 'https://images.unsplash.com/photo-1579158951263-7a0e6f8a5b0e?w=500',
        'Dermatology': 'https://images.unsplash.com/photo-1579158951263-7a0e6f8a5b0e?w=500',
        'Psychiatry': 'https://images.unsplash.com/photo-1579158951263-7a0e6f8a5b0e?w=500',
        'Ophthalmology': 'https://images.unsplash.com/photo-1579158951263-7a0e6f8a5b0e?w=500',
        'Pediatrics': 'https://images.unsplash.com/photo-1579158951263-7a0e6f8a5b0e?w=500',
        'Emergency': 'https://images.unsplash.com/photo-1579158951263-7a0e6f8a5b0e?w=500',
        'Clinical Skills': 'https://images.unsplash.com/photo-1579158951263-7a0e6f8a5b0e?w=500',
        'Nutrition': 'https://images.unsplash.com/photo-1579158951263-7a0e6f8a5b0e?w=500',
        'Question Bank': 'https://images.unsplash.com/photo-1509228627152-72ae9ae6848d?w=500'
    };
    return images[cat] || 'https://placehold.co/500x300/0a2942/white?text=Medical';
}

function renderAnalytics() {
    const container = document.getElementById('analytics-section');
    if (!container) return;
    const counts = {};
    recentBooks.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0,5);
    if (sorted.length === 0) return;
    let html = `<div class="section-title"><h2><i class="fas fa-chart-line"></i> Most Read Books</h2></div><div class="book-grid">`;
    for (let [id, count] of sorted) {
        const book = books.find(b => b.id == id);
        if (book) {
            html += createBookCard(book, count);
        }
    }
    html += '</div>';
    container.innerHTML = html;
}

function renderRecent() {
    const container = document.getElementById('recent-section');
    if (!container) return;
    if (recentBooks.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';
    const recentData = recentBooks.map(id => books.find(b => b.id === id)).filter(b => b);
    let html = `<div class="section-title"><h2><i class="fas fa-history"></i> Recently Viewed</h2></div><div class="recent-grid">`;
    recentData.forEach(book => {
        html += `<div class="recent-card" onclick="openBook('${book.filename}', ${book.id})" style="background-image: url('${getCategoryImage(book.category)}');">
                    <i class="fas ${getCategoryIcon(book.category)}"></i>
                    <h3>${book.title}</h3>
                    <p>${book.category}</p>
                </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

function renderFavorites() {
    const container = document.getElementById('favorites-section');
    if (!container) return;
    if (favorites.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';
    const favData = favorites.map(id => books.find(b => b.id === id)).filter(b => b);
    let html = `<div class="section-title"><h2><i class="fas fa-star"></i> Your Favorites</h2></div><div class="favorites-grid">`;
    favData.forEach(book => {
        html += `<div class="favorite-card" onclick="openBook('${book.filename}', ${book.id})" style="background-image: url('${getCategoryImage(book.category)}');">
                    <i class="fas ${getCategoryIcon(book.category)}"></i>
                    <h3>${book.title}</h3>
                    <p>${book.category}</p>
                </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

function renderCurrentBooks() {
    const main = document.getElementById('mainContent');
    if (!main) return;
    const allCategories = [...new Set(books.map(b => b.category))];
    allCategories.sort();
    let html = `<div class="section-title"><h2><i class="fas fa-tags"></i> Browse by Subject</h2></div>`;
    html += '<div class="categories">';
    allCategories.forEach(cat => {
        const icon = getCategoryIcon(cat);
        const count = books.filter(b => b.category === cat).length;
        const imgUrl = getCategoryImage(cat);
        html += `<div class="category-card" style="background-image: url('${imgUrl}');" onclick="selectCategory('${cat}')">
                    <i class="fas ${icon}"></i>
                    <h3>${cat}</h3>
                    <p>${count} books</p>
                </div>`;
    });
    html += '</div>';
    html += `<div class="blog-section" style="margin-top:3rem;">
                <div class="section-title"><h2><i class="fas fa-blog"></i> Study Tips & Articles</h2></div>
                <div class="blog-grid">
                    <div class="blog-card" style="background-image: url('https://images.unsplash.com/photo-1513258496099-48168024aec0?w=500');" onclick="window.open('blog/how-to-study-for-usmle.html','_blank')">
                        <i class="fas fa-chalkboard-teacher"></i>
                        <h3>How to Ace USMLE Step 1</h3>
                        <p>Study strategies from top scorers</p>
                    </div>
                    <div class="blog-card" style="background-image: url('https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?w=500');" onclick="window.open('blog/biochemistry-mnemonics.html','_blank')">
                        <i class="fas fa-dna"></i>
                        <h3>Biochemistry Mnemonics</h3>
                        <p>Remember pathways easily</p>
                    </div>
                    <div class="blog-card" style="background-image: url('https://images.unsplash.com/photo-1579684453423-843a6c5d8b1a?w=500');" onclick="window.open('blog/cardiology-review.html','_blank')">
                        <i class="fas fa-heart"></i>
                        <h3>Cardiology Quick Review</h3>
                        <p>High‑yield topics for clerkship</p>
                    </div>
                </div>
            </div>`;
    main.innerHTML = html;
}

async function renderHome() {
    const main = document.getElementById('mainContent');
    renderCurrentBooks();

    const recentDiv = document.createElement('div');
    recentDiv.id = 'recent-section';
    recentDiv.className = 'recent-section';
    const favDiv = document.createElement('div');
    favDiv.id = 'favorites-section';
    favDiv.className = 'favorites-section';
    const bookmarksDiv = document.createElement('div');
    bookmarksDiv.id = 'bookmarks-section';
    bookmarksDiv.className = 'bookmarks-section';
    const analyticsDiv = document.createElement('div');
    analyticsDiv.id = 'analytics-section';
    analyticsDiv.className = 'analytics-section';
    main.appendChild(recentDiv);
    main.appendChild(favDiv);
    main.appendChild(bookmarksDiv);
    main.appendChild(analyticsDiv);
    renderRecent();
    renderFavorites();
    renderBookmarks();
    renderAnalytics();

    const aboutSection = document.createElement('div');
    aboutSection.id = 'about-medlib-bottom';
    aboutSection.style.cssText = 'max-width: 1200px; margin: 3rem auto 0; padding: 2rem; background: #f9fcff; border-radius: 24px; border: 1px solid #e6f0fa;';
    aboutSection.innerHTML = `
        <h2 style="color: #0a2942; margin-bottom: 1rem;">📚 About MedLib – Free Medical Textbook Library</h2>
        <p><strong>MedLib</strong> is a completely free, open‑access medical education platform created by <strong>Abubakar Sadeeq</strong>. It provides medical students, residents, and healthcare professionals with a comprehensive collection of textbooks, interactive MCQ banks, and an AI‑powered study assistant – all without any cost or registration.</p>
        <h3 style="color: #0a2942; margin: 1.5rem 0 0.5rem;">📖 What You'll Find Here</h3>
        <ul style="margin-left: 1.5rem; margin-bottom: 1rem;">
            <li><strong>150+ Medical Textbooks</strong> – Covering basic sciences, organ systems, and clinical specialties.</li>
            <li><strong>500+ USMLE Step 1 MCQs</strong> – High‑yield questions with detailed explanations.</li>
            <li><strong>500+ USMLE Step 2 CK MCQs</strong> – Clinical vignettes for clerkship preparation.</li>
            <li><strong>Interactive Book Viewer</strong> – Clean, responsive viewer with table of contents.</li>
            <li><strong>Nexus AI Assistant</strong> – Evidence‑based medical chatbot with pronunciation (US/UK).</li>
            <li><strong>Study Tools</strong> – Favourites, bookmarks, recently viewed, export.</li>
        </ul>
        <h3 style="color: #0a2942; margin: 1.5rem 0 0.5rem;">👨‍⚕️ Who Is MedLib For?</h3>
        <p>Medical students preparing for USMLE Step 1 & 2, residents, and educators – all free.</p>
        <h3 style="color: #0a2942; margin: 1.5rem 0 0.5rem;">💡 Why Free?</h3>
        <p>Medical education should be accessible. MedLib removes financial barriers. Supported by minimal, non‑intrusive advertising.</p>
        <p><strong>Start exploring by clicking any category below – or use the search bar to find specific topics.</strong></p>
    `;
    main.appendChild(aboutSection);
}

document.addEventListener('click', function(e) {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('menuToggle');
    if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== toggleBtn && !toggleBtn.contains(e.target)) {
        closeSidebar();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeViewer();
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        showNotification('Shortcuts: Esc = close viewer, Ctrl+K = focus search, ? = this help');
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('searchInput').focus();
    }
});

let touchStartX = 0;
let touchEndX = 0;
document.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
});
document.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    const sidebar = document.getElementById('sidebar');
    if (touchStartX < 50 && touchEndX > 150 && !sidebar.classList.contains('open')) {
        sidebar.classList.add('open');
        document.getElementById('mainPanel').classList.add('shifted');
    } else if (touchStartX > 250 && touchEndX < 100 && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        document.getElementById('mainPanel').classList.remove('shifted');
    }
});

async function loadAllResources() {
    loadUserData();
    const cached = localStorage.getItem('medlib_books');
    if (cached) {
        try {
            books = JSON.parse(cached);
            loadFromHash();
            renderHome();
            document.getElementById('loading-skeleton').style.display = 'none';
            return;
        } catch(e) { console.warn('Cache parse failed'); }
    }
    try {
        const response = await fetch('books.json');
        if (!response.ok) throw new Error('books.json not found');
        books = await response.json();
        localStorage.setItem('medlib_books', JSON.stringify(books));
        loadFromHash();
        renderHome();
    } catch(e) {
        console.error('Error loading books', e);
        document.getElementById('mainContent').innerHTML = '<div style="text-align:center; padding:2rem;">Failed to load content. Please ensure books.json exists.</div>';
    }
    document.getElementById('loading-skeleton').style.display = 'none';
}

// Attach search input event for clear button visibility
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', updateClearSearchButton);
        updateClearSearchButton(); // initial state
    }
});

loadAllResources();

const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');
const mainPanel = document.getElementById('mainPanel');
menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    mainPanel.classList.toggle('shifted');
});

const backToTop = document.getElementById('backToTop');
window.addEventListener('scroll', () => {
    if (window.scrollY > 300) backToTop.style.display = 'flex';
    else backToTop.style.display = 'none';
});
backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

const themeToggle = document.getElementById('themeToggle');
const currentTheme = localStorage.getItem('theme');
if (currentTheme === 'dark') document.body.classList.add('dark');
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});

// Expose functions for inline onclick
window.selectCategory = selectCategory;
window.filterCategory = filterCategory;
window.showAllBooks = showAllBooks;
window.searchBooks = searchBooks;
window.openBook = openBook;
window.closeViewer = closeViewer;
window.goToHome = goToHome;
window.toggleFavorite = toggleFavorite;
window.addBookmark = addBookmark;
window.removeBookmark = removeBookmark;
window.shareBook = shareBook;
window.clearSearchInput = clearSearchInput;
window.getStaticCount = getStaticCount;
window.createBookCard = createBookCard;
window.sendMessage = null; // will be overridden by Nexus
