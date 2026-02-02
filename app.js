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
    "d & c": "Doctrine and Covenants",
    "doctrine & covenants": "Doctrine and Covenants",
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
let allBookNames = []; 

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

let refSearchRows = ["", "", "", "", ""]; 

// --- 1. CORE LOGIC & HELPERS ---

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
            const input = document.getElementById('search-input');
            if (input.value.length > 2) performSearch(input.value);
        };
        filtersContainer.appendChild(btn);
    });

    const sep = document.createElement('div');
    sep.style.cssText = "width: 1px; height: 20px; background: var(--border); margin: 0 5px;";
    filtersContainer.appendChild(sep);

    const refBtn = document.createElement('button');
    refBtn.className = 'filter-chip active-secondary';
    refBtn.innerText = 'Search By Reference';
    refBtn.onclick = openRefModal;
    filtersContainer.appendChild(refBtn);
}

function createModalFooter() {
    const f = document.createElement('div');
    f.className = 'modal-footer';
    return f;
}

// --- 2. MULTI-SELECT LOGIC ---

function enterSelectionMode() {
    isSelectionMode = true;
    selectedVerseRefs.clear();
    document.getElementById('selection-toolbar').classList.remove('hidden');
}

function exitSelectionMode() {
    isSelectionMode = false;
    selectedVerseRefs.clear();
    document.getElementById('selection-toolbar').classList.add('hidden');
    document.querySelectorAll('.chapter-verse.selected').forEach(el => el.classList.remove('selected'));
}

function toggleVerseSelection(ref) {
    const verseId = `v-${ref.replace(/[^a-zA-Z0-9]/g, '-')}`;
    const el = document.getElementById(verseId);
    
    if (selectedVerseRefs.has(ref)) {
        selectedVerseRefs.delete(ref);
        if (el) el.classList.remove('selected');
    } else {
        selectedVerseRefs.add(ref);
        if (el) el.classList.add('selected');
    }
    
    updateSelectionUI();
}

function updateSelectionUI() {
    const count = selectedVerseRefs.size;
    document.getElementById('selection-count').innerText = `${count} selected`;
    if (count === 0) exitSelectionMode();
}

function copySelectedVerses() {
    const sortedVerses = allVerses.filter(v => selectedVerseRefs.has(v.ref));
    if (sortedVerses.length === 0) return;

    const firstRefParts = sortedVerses[0].ref.split(':');
    const bookAndChapter = firstRefParts[0];
    const startNum = parseInt(firstRefParts[1]);
    const endNum = parseInt(sortedVerses[sortedVerses.length - 1].ref.split(':')[1]);
    
    const rangeHeader = sortedVerses.length > 1 
        ? `${bookAndChapter}:${startNum}-${endNum}` 
        : sortedVerses[0].ref;

    const bodyText = sortedVerses.map(v => {
        const num = v.ref.split(':')[1];
        return `${num} ${v.text}`;
    }).join('\n\n');

    const finalText = `"${rangeHeader}\n${bodyText}"`;
    
    navigator.clipboard.writeText(finalText).then(() => {
        alert("Verses copied to clipboard!");
        exitSelectionMode();
    });
}

function saveSelectedVerses() {
    const sortedVerses = allVerses.filter(v => selectedVerseRefs.has(v.ref));
    if (sortedVerses.length === 0) return;

    const firstVerse = sortedVerses[0];
    const lastVerse = sortedVerses[sortedVerses.length - 1];
    const isRange = sortedVerses.length > 1;
    
    let mergedRef = firstVerse.ref;
    if (isRange) {
        const parts = firstVerse.ref.split(':'); 
        const endNum = lastVerse.ref.split(':')[1];
        mergedRef = `${parts[0]}:${parts[1]}-${endNum}`;
    }

    const mergedText = sortedVerses.map(v => {
        const num = v.ref.split(':')[1];
        return `<b>${num}</b> ${v.text}`; 
    }).join('\n\n');

    const mergedObj = {
        id: `merged-${Date.now()}`,
        ref: mergedRef,
        text: mergedText,
        source: firstVerse.source,
        chapterId: firstVerse.chapterId
    };

    if (!savedVerses.some(sv => sv.ref === mergedRef)) {
        savedVerses.unshift(mergedObj);
        saveToLocalStorage();
        alert(`Saved bookmark: ${mergedRef}`);
        if (isViewingBookmarks) showSavedVerses();
    } else {
        alert("This selection is already bookmarked.");
    }
    
    exitSelectionMode();
}

function handleLongPress(verseRef) {
    if (viewMode !== 'chapter') return;
    if (!isSelectionMode) {
        enterSelectionMode();
        toggleVerseSelection(verseRef);
        if (navigator.vibrate) navigator.vibrate(50);
    }
}

function handleVerseTap(verseRef) {
    if (isSelectionMode) {
        toggleVerseSelection(verseRef);
    }
}

// --- 3. REFERENCE SEARCH LOGIC ---

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
        
        input.addEventListener('input', (e) => {
            refSearchRows[idx] = e.target.value;
            expandAbbreviations(e.target); 
            handleGhostText(e.target, ghost);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' || e.key === 'ArrowRight') {
                acceptGhostText(input, ghost);
            }
        });

        let touchStartX = 0;
        input.addEventListener('touchstart', (e) => touchStartX = e.changedTouches[0].screenX, {passive: true});
        input.addEventListener('touchend', (e) => {
            const dist = e.changedTouches[0].screenX - touchStartX;
            if (dist > 30) acceptGhostText(input, ghost); 
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
        refSearchRows = ["", "", "", "", ""]; 
        renderRefInputs();
    });
}

function expandAbbreviations(inputEl) {
    const val = inputEl.value.toLowerCase();
    let key = val.trim();
    if (ABBREVIATIONS[key]) {
        inputEl.value = ABBREVIATIONS[key] + " "; 
    }
}

function handleGhostText(inputEl, ghostEl) {
    const val = inputEl.value;
    ghostEl.innerText = ""; 
    
    if (val.length < 2) return; 

    const match = allBookNames.find(book => book.toLowerCase().startsWith(val.toLowerCase()));
    
    if (match) {
        ghostEl.innerText = match;
    }
}

function acceptGhostText(inputEl, ghostEl) {
    if (ghostEl.innerText && ghostEl.innerText.length > inputEl.value.length) {
        inputEl.value = ghostEl.innerText + " "; 
        ghostEl.innerText = "";
        refSearchRows[refSearchRows.indexOf(inputEl.value.trim())] = inputEl.value; 
        inputEl.dispatchEvent(new Event('input'));
    }
}

function performMultiRefSearch() {
    document.getElementById('ref-modal').classList.add('hidden');
    isViewingBookmarks = false;
    
    const resultsArea = document.getElementById('results-area');
    resultsArea.innerHTML = '';
    
    currentSearchResults = [];
    
    const rangeRegex = /^((?:[1-4]\s)?[A-Za-z\s]+)(\d+):(\d+)-(\d+)$/;
    const singleVerseRegex = /^((?:[1-4]\s)?[A-Za-z\s]+)(\d+):(\d+)$/;

    refSearchRows.forEach(query => {
        if (!query.trim()) return;
        const q = query.trim();
        let batchResults = [];

        const rangeMatch = q.match(rangeRegex);
        const singleMatch = q.match(singleVerseRegex);

        if (rangeMatch) {
            const bookName = rangeMatch[1].trim().toLowerCase();
            const chapterNum = rangeMatch[2];
            const startVerse = parseInt(rangeMatch[3]);
            const endVerse = parseInt(rangeMatch[4]);
            
            batchResults = allVerses.filter(v => {
                if (v.ref.toLowerCase().startsWith(`${bookName} ${chapterNum}:`)) {
                    const parts = v.ref.split(':');
                    if (parts.length > 1) {
                        const vNum = parseInt(parts[1]);
                        return vNum >= startVerse && vNum <= endVerse;
                    }
                }
                return false;
            });
        } 
        else if (singleMatch) {
            const bookName = singleMatch[1].trim().toLowerCase();
            const chapterNum = singleMatch[2];
            const verseNum = parseInt(singleMatch[3]);

            batchResults = allVerses.filter(v => {
                if (v.ref.toLowerCase().startsWith(`${bookName} ${chapterNum}:`)) {
                    const parts = v.ref.split(':');
                    return parseInt(parts[1]) === verseNum;
                }
                return false;
            });
        }
        else {
            batchResults = allVerses.filter(v => v.ref.toLowerCase().startsWith(q.toLowerCase()));
        }
        
        currentSearchResults = [...currentSearchResults, ...batchResults];
    });

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
        renderNextBatch(""); 
    }
}

// --- 4. INITIALIZATION ---

document.addEventListener('DOMContentLoaded', async () => {
    try {
        initSettings();
        initUI();
        loadSavedVerses();
        await loadAllBooks();
    } catch (e) {
        console.error("Initialization Error:", e);
        updateStatus("Error loading app: " + e.message);
    }
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
            
            if (Math.abs(distY) > Math.abs(dist) * 1.5) return;

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

// --- 5. DATA LOADING ---

async function loadAllBooks() {
    updateStatus("Loading Library...");
    allVerses = [];
    let tempWords = new Set();
    let tempChapters = new Set();
    let tempBooks = new Set(); 
    const loadedFiles = {}; 

    const uniqueFiles = [...new Set(BOOKS_CONFIG.map(b => b.file))];
    await Promise.all(uniqueFiles.map(async (filename) => {
        try {
            const response = await fetch(filename);
            if (response.ok) loadedFiles[filename] = await response.text();
        } catch (e) { console.warn(`Failed to load ${filename}`, e); }
    }));

    BOOKS_CONFIG.forEach(config => {
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

// --- 6. SEARCH (TEXT ONLY) ---

function performSearch(query) {
    if (isViewingBookmarks) {
        toggleBookmarkView();
        document.getElementById('search-input').value = query; 
    }

    const resultsArea = document.getElementById('results-area');
    const input = document.getElementById('search-input');
    input.placeholder = "Search text...";

    if (!query) return;
    resultsArea.innerHTML = '';
    const q = query.toLowerCase().trim();
    
    let textMatches = [];
    allVerses.forEach(v => {
        if (!activeCategories.has(v.source)) return;
        if (v.text.toLowerCase().includes(q)) {
            textMatches.push(v);
        }
    });
    currentSearchResults = textMatches;

    if (currentSearchResults.length === 0) { resultsArea.innerHTML = '<div class="placeholder-msg full-width-header">No matches found.</div>'; return; }

    renderedCount = 0;
    renderNextBatch(q);
}

function renderNextBatch(highlightQuery) {
    const resultsArea = document.getElementById('results-area');
    
    if (!isViewingBookmarks && renderedCount === 0) resultsArea.innerHTML = '';
    
    const start = renderedCount;
    const end = Math.min(renderedCount + BATCH_SIZE, currentSearchResults.length);
    const batch = currentSearchResults.slice(start, end);

    const existingBtn = document.getElementById('load-more-btn');
    if (existingBtn) existingBtn.remove();

    batch.forEach((verse, idx) => {
        const globalIndex = start + idx;
        const box = document.createElement('div'); 
        box.className = 'verse-box';
        
        if (isViewingBookmarks) {
            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn-desktop visible';
            delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
            delBtn.onclick = (e) => {
                e.stopPropagation(); 
                deleteBookmark(verse); 
            };
            box.appendChild(delBtn);

            let touchStartX = 0;
            let touchStartY = 0;
            
            box.addEventListener('touchstart', (e) => {
                touchStartX = e.changedTouches[0].screenX;
                touchStartY = e.changedTouches[0].screenY;
                box.style.transition = 'none';
            }, {passive: true});
            
            box.addEventListener('touchmove', (e) => {
                const diff = touchStartX - e.changedTouches[0].screenX;
                const diffY = touchStartY - e.changedTouches[0].screenY;
                if (Math.abs(diffY) > Math.abs(diff) * 1.5) return; 

                if (diff > 0) { 
                    const limit = Math.min(diff, 90);
                    box.style.transform = `translateX(-${limit}px)`;
                    const opacity = Math.min(diff / 150, 0.4);
                    box.style.backgroundColor = `rgba(239, 68, 68, ${opacity})`;
                }
            }, {passive: true});

            box.addEventListener('touchend', (e) => {
                const dist = touchStartX - e.changedTouches[0].screenX;
                const distY = touchStartY - e.changedTouches[0].screenY;
                
                if (Math.abs(distY) > Math.abs(dist) * 1.5) {
                    box.style.transform = 'translateX(0)'; box.style.backgroundColor = ''; return;
                }

                box.style.transition = 'transform 0.3s, background-color 0.3s';
                
                if (dist > 70) { 
                    box.style.transform = `translateX(-90px)`; 
                    deleteBookmark(verse, () => {
                        box.style.transform = 'translateX(0)';
                        box.style.backgroundColor = '';
                    });
                } else {
                    box.style.transform = 'translateX(0)';
                    box.style.backgroundColor = ''; 
                }
            }, {passive: true});
        }
        
        let snippet = verse.text;
        let refDisplay = verse.ref;

        if (!isViewingBookmarks && highlightQuery) {
            snippet = verse.text.replace(new RegExp(`(${highlightQuery})`, 'gi'), '<b style="color:var(--primary);">$1</b>');
        }

        const sourceBadge = BOOKS_CONFIG.find(b => b.id === verse.source).name;

        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="verse-ref">${refDisplay}</span>
                <span style="font-size:0.7rem; color:var(--text-light); border:1px solid var(--border); padding:2px 6px; border-radius:4px;">${sourceBadge}</span>
            </div>
            <div class="verse-snippet">${snippet}</div>`;
        box.appendChild(contentDiv);
        
        box.onclick = () => openVerseView(verse, globalIndex);
        resultsArea.appendChild(box);
    });

    renderedCount = end;

    if (renderedCount < currentSearchResults.length) {
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.id = 'load-more-btn';
        loadMoreBtn.className = 'full-width-header'; 
        loadMoreBtn.innerText = `Load More (${currentSearchResults.length - renderedCount} remaining)`;
        loadMoreBtn.style.cssText = "width:100%; padding:15px; margin-top:10px; background:var(--bg); border:1px solid var(--border); border-radius:12px; color:var(--primary); font-weight:600; cursor:pointer;";
        loadMoreBtn.onclick = () => renderNextBatch(highlightQuery);
        resultsArea.appendChild(loadMoreBtn);
    }
}

// --- 7. BOOKMARKS & DELETE ---

function toggleBookmarkView() {
    const filters = document.getElementById('category-filters');
    const searchContainer = document.getElementById('search-container');
    const title = document.getElementById('bookmarks-title');
    const resultsArea = document.getElementById('results-area');
    const input = document.getElementById('search-input');
    const btn = document.getElementById('bookmarks-btn');

    if (isViewingBookmarks) {
        isViewingBookmarks = false;
        filters.classList.remove('hidden');
        searchContainer.classList.remove('hidden');
        title.classList.add('hidden');
        input.value = "";
        resultsArea.innerHTML = '<div class="placeholder-msg">Ready to search.</div>';
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;
    } else {
        isViewingBookmarks = true;
        filters.classList.add('hidden');
        searchContainer.classList.add('hidden');
        title.classList.remove('hidden');
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
        showSavedVerses();
    }
}

function showSavedVerses() {
    const resultsArea = document.getElementById('results-area');
    currentSearchResults = savedVerses;
    renderedCount = 0;
    
    resultsArea.innerHTML = '';
    
    if (savedVerses.length === 0) {
        resultsArea.innerHTML = '<div class="placeholder-msg full-width-header">No saved scriptures yet.<br>Tap "Save" on any verse to add it here.</div>';
        return;
    }
    
    resultsArea.innerHTML = `
        <div class="full-width-header" style="display:flex; justify-content:space-between; align-items:center; padding:0 10px 10px 10px; color:var(--text-light); font-size:0.9rem;">
            <span>Swipe left to delete</span>
            <button id="clear-all-btn" style="background:none; border:none; color:#ef4444; font-weight:bold; cursor:pointer;">Clear All</button>
        </div>
    `;
    
    const clearBtn = document.getElementById('clear-all-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            showConfirmation("Delete ALL saved scriptures?", () => {
                savedVerses = [];
                saveToLocalStorage();
                showSavedVerses();
            });
        });
    }
    
    renderNextBatch(""); 
}

function toggleSaveVerse(verse) {
    const existingIdx = savedVerses.findIndex(v => v.ref === verse.ref);
    if (existingIdx > -1) {
        savedVerses.splice(existingIdx, 1);
    } else {
        savedVerses.unshift(verse);
    }
    saveToLocalStorage();
    if (isViewingBookmarks) showSavedVerses();
    openVerseView(verse, currentResultIndex);
}

function deleteBookmark(verse, onCancel = null) {
    showConfirmation(
        `Remove "${verse.ref}"?`, 
        () => executeDelete(verse),
        onCancel 
    );
}

function executeDelete(verse) {
    const idx = savedVerses.findIndex(v => v.ref === verse.ref);
    if (idx > -1) {
        savedVerses.splice(idx, 1);
        saveToLocalStorage();
        showSavedVerses(); 
    }
}

function showConfirmation(msg, confirmCallback, cancelCallback = null) {
    const overlay = document.getElementById('confirm-overlay');
    const msgEl = document.getElementById('confirm-msg');
    if(overlay && msgEl) {
        msgEl.innerText = msg;
        pendingConfirmAction = confirmCallback;
        pendingCancelAction = cancelCallback;
        overlay.classList.remove('hidden');
    }
}

// --- 8. MODALS & NAV ---

function openPopup(title, text) {
    const modalOverlay = document.getElementById('modal-overlay');
    const modalRef = modalOverlay.querySelector('.modal-ref'); 
    const modalText = modalOverlay.querySelector('.modal-body'); 
    const modalContent = modalOverlay.querySelector('.modal-content');
    
    let modalFooter = modalOverlay.querySelector('.modal-footer');
    if (!modalFooter) {
        modalFooter = document.createElement('div');
        modalFooter.className = 'modal-footer';
        modalContent.appendChild(modalFooter);
    }
    
    viewMode = 'verse';
    modalContent.classList.add('short');
    modalOverlay.classList.remove('hidden');
    
    modalRef.innerText = title;
    modalText.innerText = text;
    modalFooter.innerHTML = '';
    
    modalOverlay.querySelector('#prev-chapter-btn').classList.add('hidden');
    modalOverlay.querySelector('#next-chapter-btn').classList.add('hidden');
}

function openVerseView(verse, index) {
    viewMode = 'verse';
    currentResultIndex = index;
    
    const modalOverlay = document.getElementById('modal-overlay');
    const modalRef = modalOverlay.querySelector('.modal-ref');
    const modalText = modalOverlay.querySelector('.modal-body');
    const modalContent = modalOverlay.querySelector('.modal-content');
    let modalFooter = modalOverlay.querySelector('.modal-footer');
    if (!modalFooter) {
        modalFooter = document.createElement('div');
        modalFooter.className = 'modal-footer';
        modalContent.appendChild(modalFooter);
    }

    const prevBtn = modalOverlay.querySelector('#prev-chapter-btn');
    const nextBtn = modalOverlay.querySelector('#next-chapter-btn');

    modalOverlay.classList.remove('hidden');
    modalContent.classList.add('short'); 

    modalRef.innerText = verse.ref;
    modalText.innerHTML = verse.text; 
    modalText.scrollTop = 0;

    prevBtn.classList.remove('hidden');
    nextBtn.classList.remove('hidden');
    
    prevBtn.style.opacity = index <= 0 ? '0.3' : '1';
    nextBtn.style.opacity = index >= currentSearchResults.length - 1 ? '0.3' : '1';

    modalFooter.innerHTML = '';

    const chapterBtn = document.createElement('button'); 
    chapterBtn.className = 'action-btn';
    chapterBtn.innerText = `View Chapter`; 
    chapterBtn.onclick = () => viewChapter(verse.chapterId, verse.ref);
    modalFooter.appendChild(chapterBtn);

    const isSaved = savedVerses.some(v => v.ref === verse.ref);
    const saveBtn = document.createElement('button');
    saveBtn.className = isSaved ? 'save-icon-btn saved' : 'save-icon-btn';
    saveBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;
    saveBtn.onclick = () => toggleSaveVerse(verse);
    modalFooter.appendChild(saveBtn);
}

function viewChapter(chapterId, highlightRef = null) {
    viewMode = 'chapter';
    currentChapterIndex = chapterList.indexOf(chapterId); 
    if (currentChapterIndex === -1) return;
    
    const modalContent = document.querySelector('#modal-overlay .modal-content'); 
    modalContent.classList.remove('short'); 
    
    loadChapterContent(chapterId, highlightRef);
    
    document.querySelector('#modal-overlay .modal-footer').innerHTML = ''; 
}

function loadChapterContent(chapterId, highlightRef = null) {
    const modalOverlay = document.getElementById('modal-overlay');
    const modalRef = modalOverlay.querySelector('.modal-ref'); 
    const modalText = modalOverlay.querySelector('.modal-body'); 
    const prevBtn = modalOverlay.querySelector('#prev-chapter-btn'); 
    const nextBtn = modalOverlay.querySelector('#next-chapter-btn'); 
    
    const chapterVerses = allVerses.filter(v => v.chapterId === chapterId);
    
    const fullText = chapterVerses.map(v => {
        const parts = v.ref.split(':'); 
        const num = parts.length > 1 ? parts[1].trim() : '';
        const isTarget = v.ref === highlightRef;
        const highlightClass = isTarget ? 'highlight-verse' : '';
        const verseId = `v-${v.ref.replace(/[^a-zA-Z0-9]/g, '-')}`;
        return `<div id="${verseId}" class="chapter-verse ${highlightClass}" data-ref="${v.ref}"><b>${num}</b> ${v.text}</div>`;
    }).join(''); 
    
    modalRef.innerText = chapterId; 
    modalText.innerHTML = fullText; 

    // Inject Desktop Select Button
    const headerRight = modalOverlay.querySelector('.header-right'); 
    const existingSelBtn = headerRight.querySelector('.desktop-select-btn-injected');
    if (existingSelBtn) existingSelBtn.remove();

    const closeBtn = headerRight.querySelector('.main-close');
    const selectBtn = document.createElement('button');
    selectBtn.className = 'desktop-select-btn desktop-select-btn-injected';
    selectBtn.innerText = 'Select';
    selectBtn.onclick = enterSelectionMode;
    
    if (closeBtn && headerRight) {
        headerRight.insertBefore(selectBtn, closeBtn);
    }

    const verseElements = modalText.querySelectorAll('.chapter-verse');
    verseElements.forEach(el => {
        const ref = el.getAttribute('data-ref');
        el.addEventListener('click', () => handleVerseTap(ref));
        el.addEventListener('touchstart', (e) => {
            longPressTimer = setTimeout(() => handleLongPress(ref), 500); 
        }, {passive: true});
        el.addEventListener('touchend', () => clearTimeout(longPressTimer));
        el.addEventListener('touchmove', () => clearTimeout(longPressTimer));
    });

    if (highlightRef) {
        setTimeout(() => {
            const targetId = `v-${highlightRef.replace(/[^a-zA-Z0-9]/g, '-')}`;
            const el = document.getElementById(targetId);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 400); 
    } else {
        modalText.scrollTop = 0;
    }

    prevBtn.classList.remove('hidden');
    nextBtn.classList.remove('hidden');
    
    prevBtn.style.opacity = currentChapterIndex <= 0 ? '0.3' : '1';
    nextBtn.style.opacity = currentChapterIndex >= chapterList.length - 1 ? '0.3' : '1';
}

function handleNavigation(direction) {
    if (viewMode === 'verse') {
        const newIndex = currentResultIndex + direction;
        if (newIndex >= 0 && newIndex < currentSearchResults.length) {
            currentResultIndex = newIndex;
            openVerseView(currentSearchResults[newIndex], newIndex);
        }
    } else {
        const newIndex = currentChapterIndex + direction;
        if (newIndex >= 0 && newIndex < chapterList.length) {
            currentChapterIndex = newIndex;
            const newChapterId = chapterList[newIndex];
            
            const modalText = document.querySelector('#modal-overlay .modal-body');
            modalText.style.opacity = 0;
            setTimeout(() => { 
                loadChapterContent(newChapterId);
                modalText.style.opacity = 1; 
            }, 150);
        }
    }
}
