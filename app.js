// --- CONFIGURATION ---
const BOOKS_CONFIG = [
    { 
        id: 'ot', name: 'Old Testament', file: 'standard_works.txt',
        books: new Set(["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi"])
    },
    { 
        id: 'nt', name: 'New Testament', file: 'standard_works.txt',
        books: new Set(["Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"])
    },
    { 
        id: 'bom', name: 'Book of Mormon', file: 'standard_works.txt',
        books: new Set(["1 Nephi", "2 Nephi", "Jacob", "Enos", "Jarom", "Omni", "Words of Mormon", "Mosiah", "Alma", "Helaman", "3 Nephi", "4 Nephi", "Mormon", "Ether", "Moroni"])
    },
    { 
        id: 'dc', name: 'D&C', file: 'standard_works.txt',
        books: new Set(["Doctrine and Covenants", "Section", "D&C"])
    },
    { 
        id: 'pgp', name: 'Pearl of GP', file: 'standard_works.txt',
        books: new Set(["Moses", "Abraham", "Joseph Smith—Matthew", "Joseph Smith—History", "Articles of Faith"])
    }
];

const ABBREVIATIONS = {
    "d&c": "Doctrine and Covenants",
    "1 ne": "1 Nephi",
    "2 ne": "2 Nephi",
    "3 ne": "3 Nephi",
    "4 ne": "4 Nephi",
    "a of f": "Articles of Faith",
    "js-h": "Joseph Smith—History",
    "js-m": "Joseph Smith—Matthew",
    "w of m": "Words of Mormon"
};

// Global State
let allVerses = [];
let uniqueWords = [];
let chapterList = [];
let activeCategories = new Set(BOOKS_CONFIG.map(b => b.id)); 
let allBookNames = []; // Flattened list for ghost text

let currentSearchResults = [];
let currentResultIndex = -1; 
let currentChapterIndex = -1; 
let viewMode = 'verse'; 
let renderedCount = 0;
const BATCH_SIZE = 50;

let savedVerses = [];
let isViewingBookmarks = false;
let pendingConfirmAction = null; 
let pendingCancelAction = null;

let isSelectionMode = false;
let selectedVerseRefs = new Set();
let longPressTimer = null;

// New Reference Search State
let refSearchRows = ["", "", "", "", ""]; // Start with 5 empty rows

// --- 1. CORE UI HELPERS ---

function updateStatus(msg) {
    const el = document.querySelector('.placeholder-msg');
    if(el) el.innerText = msg;
}

function handleSuggestions(e) {
    const val = e.target.value.toLowerCase();
    const suggestionsArea = document.getElementById('suggestions-area');
    const input = document.getElementById('search-input');
    
    suggestionsArea.innerHTML = '';
    if (val.length < 2) return;

    const matches = uniqueWords.filter(w => w.startsWith(val)).slice(0, 15);
    matches.forEach(word => {
        const pill = document.createElement('div');
        pill.className = 'pill'; pill.innerText = word;
        pill.onclick = () => { input.value = word; suggestionsArea.innerHTML = ''; performSearch(word); };
        suggestionsArea.appendChild(pill);
    });
}

function renderFilters() {
    const filtersContainer = document.getElementById('category-filters');
    filtersContainer.innerHTML = '';

    BOOKS_CONFIG.forEach(book => {
        const btn = document.createElement('button');
        btn.className = `filter-chip ${activeCategories.has(book.id) ? 'active' : ''}`;
        btn.innerText = book.name;
        btn.onclick = () => {
            if (activeCategories.has(book.id)) { activeCategories.delete(book.id); btn.classList.remove('active'); } 
            else { activeCategories.add(book.id); btn.classList.add('active'); }
            // Re-run search if active
            const input = document.getElementById('search-input');
            if (input.value.length > 2) performSearch(input.value);
        };
        filtersContainer.appendChild(btn);
    });

    const sep = document.createElement('div');
    sep.style.cssText = "width: 1px; height: 20px; background: var(--border); margin: 0 5px;";
    filtersContainer.appendChild(sep);

    // NEW: Search By Reference Button
    const refBtn = document.createElement('button');
    refBtn.className = 'filter-chip active-secondary';
    refBtn.innerText = 'Search By Reference';
    refBtn.onclick = openRefModal;
    filtersContainer.appendChild(refBtn);
}

function createModalFooter() {
    const f = document.createElement('div');
    f.className = 'modal-footer';
    document.querySelector('.modal-content').appendChild(f);
    return f;
}

// --- 2. INITIALIZATION ---

document.addEventListener('DOMContentLoaded', async () => {
    initSettings();
    initUI();
    loadSavedVerses();
    await loadAllBooks();
});

function loadSavedVerses() {
    try {
        const stored = localStorage.getItem('saved_scriptures');
        if (stored) savedVerses = JSON.parse(stored);
    } catch (e) { console.error("Error loading saved verses", e); }
}

function saveToLocalStorage() {
    localStorage.setItem('saved_scriptures', JSON.stringify(savedVerses));
}

function initSettings() {
    const savedTheme = localStorage.getItem('app_theme') || 'theme-light-blue';
    document.body.className = savedTheme;

    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.onclick = () => {
            const theme = btn.getAttribute('data-theme');
            document.body.className = theme;
            localStorage.setItem('app_theme', theme);
        };
    });

    const settingsBtn = document.getElementById('settings-btn');
    const settingsOverlay = document.getElementById('settings-overlay');
    const settingsCloseBtn = document.querySelector('.settings-close');

    if(settingsBtn) settingsBtn.onclick = () => settingsOverlay.classList.remove('hidden');
    if(settingsCloseBtn) settingsCloseBtn.onclick = () => settingsOverlay.classList.add('hidden');
    if(settingsOverlay) settingsOverlay.onclick = (e) => { if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden'); };
}

function initUI() {
    const input = document.getElementById('search-input');
    const sendBtn = document.getElementById('send-btn');
    const bookmarksBtn = document.getElementById('bookmarks-btn');
    
    input.addEventListener('input', handleSuggestions);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') performSearch(input.value); });
    sendBtn.addEventListener('click', () => performSearch(input.value));
    
    if(bookmarksBtn) bookmarksBtn.addEventListener('click', toggleBookmarkView);

    renderFilters();

    // Confirm Modal
    const confirmOverlay = document.getElementById('confirm-overlay');
    const confirmCancel = document.getElementById('confirm-cancel');
    const confirmYes = document.getElementById('confirm-yes');

    if(confirmCancel) confirmCancel.onclick = () => {
        if(pendingCancelAction) pendingCancelAction(); 
        confirmOverlay.classList.add('hidden');
    };
    if(confirmYes) confirmYes.onclick = () => {
        if(pendingConfirmAction) pendingConfirmAction();
        confirmOverlay.classList.add('hidden');
    };

    // Main Modal & Selection Buttons
    const modalOverlay = document.getElementById('modal-overlay');
    const mainCloseBtn = document.querySelector('.main-close');
    
    if(mainCloseBtn) mainCloseBtn.onclick = () => { modalOverlay.classList.add('hidden'); exitSelectionMode(); };
    if(modalOverlay) modalOverlay.onclick = (e) => { if (e.target === modalOverlay) { modalOverlay.classList.add('hidden'); exitSelectionMode(); } };

    const closeSel = document.getElementById('sel-close-btn');
    const copySel = document.getElementById('sel-copy-btn');
    const bookSel = document.getElementById('sel-bookmark-btn');

    if(closeSel) closeSel.onclick = exitSelectionMode;
    if(copySel) copySel.onclick = copySelectedVerses;
    if(bookSel) bookSel.onclick = saveSelectedVerses;

    // Ref Modal Buttons
    const refModal = document.getElementById('ref-modal');
    const refClose = document.querySelector('.ref-close');
    const addRefBtn = document.getElementById('add-ref-btn');
    const clearRefBtn = document.getElementById('clear-refs-btn');
    const searchRefBtn = document.getElementById('search-refs-btn');

    if(refClose) refClose.onclick = () => refModal.classList.add('hidden');
    if(refModal) refModal.onclick = (e) => { if (e.target === refModal) refModal.classList.add('hidden'); };
    if(addRefBtn) addRefBtn.onclick = addReferenceRow;
    if(clearRefBtn) clearRefBtn.onclick = confirmClearRefs;
    if(searchRefBtn) searchRefBtn.onclick = performMultiRefSearch;

    // Swipe Nav
    const modalContent = document.querySelector('.modal-content');
    let touchStartX = 0;
    let touchStartY = 0;
    
    if(modalContent) {
        modalContent.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, {passive: true});
        
        modalContent.addEventListener('touchend', (e) => {
            const dist = touchStartX - e.changedTouches[0].screenX;
            const distY = touchStartY - e.changedTouches[0].screenY;
            
            if (Math.abs(distY) > Math.abs(dist) * 1.5) return; // Vertical Lock

            if (dist > 40) handleNavigation(1); 
            else if (dist < -40) handleNavigation(-1);
        }, {passive: true});
    }

    const legalLink = document.getElementById('legal-link');
    if(legalLink) legalLink.onclick = (e) => { e.preventDefault(); openPopup("Legal Disclosure", legalTextContent); };

    const prevBtn = document.getElementById('prev-chapter-btn');
    const nextBtn = document.getElementById('next-chapter-btn');
    if(prevBtn) prevBtn.onclick = () => handleNavigation(-1);
    if(nextBtn) nextBtn.onclick = () => handleNavigation(1);
}

// --- 3. DATA LOADING ---

async function loadAllBooks() {
    updateStatus("Loading Library...");
    allVerses = [];
    let tempWords = new Set();
    let tempChapters = new Set();
    let tempBooks = new Set(); // For ghost text
    const loadedFiles = {}; 

    const uniqueFiles = [...new Set(BOOKS_CONFIG.map(b => b.file))];
    await Promise.all(uniqueFiles.map(async (filename) => {
        try {
            const response = await fetch(filename);
            if (response.ok) loadedFiles[filename] = await response.text();
        } catch (e) { console.warn(`Failed to load ${filename}`, e); }
    }));

    BOOKS_CONFIG.forEach(config => {
        // Add books to set for ghost text
        config.books.forEach(b => tempBooks.add(b));
        
        const text = loadedFiles[config.file];
        if (text) parseBookText(text, config, tempWords, tempChapters);
    });

    uniqueWords = Array.from(tempWords).sort();
    chapterList = Array.from(tempChapters);
    allBookNames = Array.from(tempBooks).sort();
    
    if (allVerses.length === 0) updateStatus("Error: standard_works.txt not found.");
    else updateStatus("Ready to search.");
}

function parseBookText(fullText, config, wordSet, chapterSet) {
    const allLines = fullText.split(/\r?\n/);
    const lineRegex = /^((?:[1-4]\s)?[A-Za-z\s]+\d+:\d+)\s+(.*)$/;

    allLines.forEach((line) => {
        const cleanLine = line.trim();
        if (!cleanLine) return;
        const match = cleanLine.match(lineRegex);
        
        if (match) {
            const reference = match[1].trim(); 
            const text = match[2].trim();
            
            let shouldInclude = false;
            if (config.books) {
                for (const bookName of config.books) {
                    if (reference.startsWith(bookName + " ")) { shouldInclude = true; break; }
                }
            } else { shouldInclude = true; } 

            if (shouldInclude) {
                const lastColonIndex = reference.lastIndexOf(':');
                const chapterId = reference.substring(0, lastColonIndex).trim();

                allVerses.push({
                    id: allVerses.length, source: config.id,
                    ref: reference, text: text, chapterId: chapterId
                });
                chapterSet.add(chapterId);

                const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g);
                if (words) words.forEach(w => wordSet.add(w));
            }
        }
    });
}

// --- 4. NEW REFERENCE SEARCH LOGIC ---

function openRefModal() {
    renderRefInputs();
    document.getElementById('ref-modal').classList.remove('hidden');
}

function renderRefInputs() {
    const container = document.getElementById('ref-inputs-container');
    container.innerHTML = '';
    
    refSearchRows.forEach((val, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'ref-input-wrapper';
        
        const ghost = document.createElement('span');
        ghost.className = 'ghost-text';
        ghost.id = `ghost-${idx}`;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'ref-input';
        input.value = val;
        input.placeholder = `Reference ${idx + 1}`;
        input.autocomplete = "off";
        
        // Input Event: Update Array + Ghost Logic
        input.addEventListener('input', (e) => {
            refSearchRows[idx] = e.target.value;
            expandAbbreviations(e.target); // Check D&C etc
            handleGhostText(e.target, ghost);
        });

        // Keydown: Tab/Right Arrow accept ghost
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' || e.key === 'ArrowRight') {
                acceptGhostText(input, ghost);
            }
        });

        // Touch: Swipe Right accept ghost
        let touchStartX = 0;
        input.addEventListener('touchstart', (e) => touchStartX = e.changedTouches[0].screenX, {passive: true});
        input.addEventListener('touchend', (e) => {
            const dist = e.changedTouches[0].screenX - touchStartX;
            if (dist > 30) acceptGhostText(input, ghost); // Swipe Right
        }, {passive: true});

        wrapper.appendChild(ghost);
        wrapper.appendChild(input);
        container.appendChild(wrapper);
    });
}

function addReferenceRow() {
    if (refSearchRows.length < 20) {
        refSearchRows.push("");
        renderRefInputs();
    }
}

function confirmClearRefs() {
    showConfirmation("Clear all reference inputs?", () => {
        refSearchRows = ["", "", "", "", ""]; // Reset to 5
        renderRefInputs();
    });
}

// Auto-Expand Abbreviations
function expandAbbreviations(inputEl) {
    const val = inputEl.value.toLowerCase();
    if (ABBREVIATIONS[val]) {
        inputEl.value = ABBREVIATIONS[val] + " "; // Add space
    }
}

// Ghost Text Logic
function handleGhostText(inputEl, ghostEl) {
    const val = inputEl.value;
    ghostEl.innerText = ""; // Clear current ghost
    
    if (val.length < 2) return; // Too short

    // Find a book that starts with this text (case insensitive)
    const match = allBookNames.find(book => book.toLowerCase().startsWith(val.toLowerCase()));
    
    if (match) {
        // If the user typed "1 ne", match is "1 Nephi"
        // We need to display "phi" offset by the width of "1 ne"
        // Ideally, we just show the whole word in ghost, but invisible chars for what user typed.
        
        // CSS Trick: Set ghost text to "1 Ne" (invisible) + "phi" (visible)
        // But simply setting text content works because input is on top.
        // We just need casing to match for the "hidden" part? No, input bg is transparent.
        // Solution: Ghost text contains the FULL match. 
        // But we need the part user typed to be invisible so it doesn't double render with different kerning?
        // Actually, opacity 0.5 works okay if fonts match perfectly.
        
        // Better: Ghost text only shows the suffix.
        const suffix = match.slice(val.length);
        
        // Create invisible prefix to push suffix to right pos
        const invisiblePrefix = val.replace(/./g, ' '); // Spaces usually narrower...
        // Let's stick to the "Value + Suffix" approach in JS, 
        // actually simple "match" as ghost text behind input works if input bg is transparent.
        
        ghostEl.innerText = match;
    }
}

function acceptGhostText(inputEl, ghostEl) {
    if (ghostEl.innerText && ghostEl.innerText.length > inputEl.value.length) {
        inputEl.value = ghostEl.innerText + " "; // Accept + space
        ghostEl.innerText = "";
        refSearchRows[refSearchRows.indexOf(inputEl.value.trim())] = inputEl.value; // Update state? logic complex here
        // Update state based on input index (need to pass idx or find it)
        // Re-trigger input event to save state
        inputEl.dispatchEvent(new Event('input'));
    }
}

function performMultiRefSearch() {
    // 1. Close Modal
    document.getElementById('ref-modal').classList.add('hidden');
    isViewingBookmarks = false;
    
    const resultsArea = document.getElementById('results-area');
    resultsArea.innerHTML = '';
    
    currentSearchResults = [];
    
    // 2. Iterate and Search
    const rangeRegex = /^((?:[1-4]\s)?[A-Za-z\s]+)(\d+):(\d+)-(\d+)$/;
    const simpleRefRegex = /^((?:[1-4]\s)?[A-Za-z\s]+)(\d+)(?::(\d+))?$/; // Matches "1 Nephi 3" or "1 Nephi 3:4"

    refSearchRows.forEach(query => {
        if (!query.trim()) return;
        const q = query.trim().toLowerCase();
        
        let batchResults = [];

        // Try Range
        const rangeMatch = q.match(rangeRegex);
        if (rangeMatch) {
            const bookName = rangeMatch[1].trim();
            const chapterNum = rangeMatch[2];
            const startVerse = parseInt(rangeMatch[3]);
            const endVerse = parseInt(rangeMatch[4]);
            
            batchResults = allVerses.filter(v => {
                const vRefLower = v.ref.toLowerCase();
                if (vRefLower.startsWith(`${bookName} ${chapterNum}:`)) {
                    const parts = v.ref.split(':');
                    if (parts.length > 1) {
                        const vNum = parseInt(parts[1]);
                        return vNum >= startVerse && vNum <= endVerse;
                    }
                }
                return false;
            });
        } 
        // Try Simple Ref (Chapter or Single Verse)
        else {
            // "1 nephi 3" -> match start
            batchResults = allVerses.filter(v => v.ref.toLowerCase().startsWith(q));
        }
        
        currentSearchResults = [...currentSearchResults, ...batchResults];
    });

    // Remove Duplicates (by ref)
    const uniqueIds = new Set();
    currentSearchResults = currentSearchResults.filter(v => {
        if (uniqueIds.has(v.ref)) return false;
        uniqueIds.add(v.ref);
        return true;
    });

    if (currentSearchResults.length === 0) {
        resultsArea.innerHTML = '<div class="placeholder-msg full-width-header">No matches found.</div>';
    } else {
        renderedCount = 0;
        renderNextBatch(""); // No highlight query for ref search
    }
}

// --- 5. STANDARD SEARCH (Single Input) ---

function performSearch(query) {
    if (isViewingBookmarks) toggleBookmarkView();
    if(document.getElementById('search-input').value !== query) document.getElementById('search-input').value = query;

    const resultsArea = document.getElementById('results-area');
    if (!query) return;
    resultsArea.innerHTML = '';
    const q = query.toLowerCase().trim();
    
    const rangeRegex = /^((?:[1-4]\s)?[A-Za-z\s]+)(\d+):(\d+)-(\d+)$/;
    const rangeMatch = q
