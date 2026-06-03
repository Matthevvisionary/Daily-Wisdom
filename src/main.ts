// @ts-nocheck

        // Supabase client initialization 
        // Auth + RLS verified working (magic link)
        const supabaseClient = window.supabase.createClient(
            "https://mmchlykmezehfmtdtjff.supabase.co",
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tY2hseWttZXplaGZtdGR0amZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0NDQyODEsImV4cCI6MjA4NDAyMDI4MX0.J8lPRllK2BDuuME41N4G0-fB5EMdn2ePCZZwFLamP9U"
        );
        console.log("Supabase ready:", supabaseClient);

        supabaseClient.auth.onAuthStateChange((event, session) => {
            console.log("Auth event:", event);
            console.log("Session:", session);

            updateAuthUI(session);

            if (session) {
                loadQuotes(session.user.id);
                syncLocalChanges();
            }
        });

        async function loadQuotes(userId) {
            const { data, error } = await supabaseClient
                .from("quotes")
                .select("*")
                .eq("user_id", userId)
                .order("createdAt", { ascending: false });

            if (error) {
                console.error("Error loading quotes:", error);
                return;
            }

            console.log("Loaded quotes:", data);

        }

        async function saveQuoteToSupabase({ clientId, text, creator = null, source = null, imageFile = null, status = 'active', deletedAt = null }) {
            const { data: { user }, error: userErr } = await supabaseClient.auth.getUser();
            if (userErr) throw userErr;
            if (!user) throw new Error("Not signed in");

            let imagePath = null;

            // Upload image if provided
            if (imageFile) {
                imagePath = await uploadQuoteImage(imageFile);
            }

            const quotePayload = {
                client_id: clientId,
                user_id: user.id,
                text: text || null,
                creator: creator || null,
                source: source || null,
                status,
                deletedAt
            };

            if (imagePath) {
                quotePayload.image_path = imagePath;
            }

            const { data, error } = await supabaseClient
                .from("quotes")
                .upsert([quotePayload], {
                    onConflict: 'client_id'
                })
                .select()
                .single();

            if (error) throw error;

            return data;
        }

        async function softDeleteQuotesInSupabase(clientIds) {
            const { data: authData } = await supabaseClient.auth.getUser();
            const user = authData.user;

            if (!user || clientIds.length === 0) return;

            const { data: updatedata, error } = await supabaseClient
                .from('quotes')
                .update({
                    status: 'deleted',
                    deletedAt: new Date().toISOString()
                })
                .eq('user_id', user.id)
                .in('client_id', clientIds)
                .select();

            // console.log('user object:', user);
            // console.log('user.id:', user.id);
            // console.log('clientIds:', clientIds);
            // console.log('soft delete updateData:', updatedata);
            // console.log('soft delete error:', error);

            if (error) {
                console.error('Supabase soft delete failed:', error);
                throw error;
            }
        }

        async function softDeleteQuoteInSupabase(clientId) {
            return softDeleteQuotesInSupabase([clientId]);
        }

        async function updateQuoteStatusInSupabase(clientIds, status, deletedAt = null) {
            const { data: authData } = await supabaseClient.auth.getUser();
            const user = authData.user;

            if (!user || clientIds.length === 0) return;

            const { error } = await supabaseClient
                .from('quotes')
                .update({ status, deletedAt })
                .eq('user_id', user.id)
                .in('client_id', clientIds);

            if (error) {
                console.error('Supabase status update failed:', error);
                throw error;
            }
        }

        async function getCurrentUser() {
            const { data, error } = await supabaseClient.auth.getUser();
            if (error) throw error;
            return data.user;
        }

        function updateAuthUI(session) {
            const isSignedIn = Boolean(session?.user);
            const authToggleButton = document.getElementById('authToggleBtn');
            const statusDescription = document.getElementById('authStatusDescription');

            if (authToggleButton) {
                authToggleButton.textContent = isSignedIn ? 'Sign Out' : 'Sign In';
            }

            if (statusDescription) {
                statusDescription.textContent = isSignedIn ? 'You are signed in and syncing quotes.' : 'Sign in to sync your quotes across devices.';
            }
        }

        function validatePassword(password) {
            if (!password || password.length < 6) {
                return 'Password must be at least 6 characters.';
            }
            if (!/[a-zA-Z]/.test(password)) {
                return 'Password must contain at least one letter.';
            }
            if (!/[0-9]/.test(password)) {
                return 'Password must contain at least one number.';
            }
            return null;
        }

        async function handleEmailPasswordAuth(mode = 'signIn') {
            const emailInput = document.getElementById('authEmail');
            const passwordInput = document.getElementById('authPassword');
            const messageBox = document.getElementById('authMessage');
            const email = emailInput?.value.trim();
            const password = passwordInput?.value;

            if (!email) {
                if (messageBox) messageBox.textContent = 'Please enter your email.';
                return;
            }

            if (mode !== 'reset') {
                const passwordError = validatePassword(password);
                if (passwordError) {
                    if (messageBox) messageBox.textContent = passwordError;
                    return;
                }
            }

            try {
                if (mode === 'signIn') {
                    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
                    if (error) throw error;
                    if (messageBox) messageBox.textContent = 'Signed in successfully.';
                    showCustomAlert('Signed in successfully.');
                    closeAuthModal();
                } else if (mode === 'signUp') {
                    const { error } = await supabaseClient.auth.signUp({ email, password });
                    if (error) throw error;
                    if (messageBox) messageBox.textContent = 'Account created. Check your email for confirmation.';
                    showCustomAlert('Account created. Check your email for confirmation.');
                    closeAuthModal();
                } else if (mode === 'reset') {
                    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                        redirectTo: window.location.origin
                    });
                    if (error) throw error;
                    if (messageBox) messageBox.textContent = 'Password reset email sent.';
                    showCustomAlert('Password reset email sent.');
                }

                await syncLocalChanges();
                const { data } = await supabaseClient.auth.getSession();
                updateAuthUI(data.session);
            } catch (err) {
                console.error('Auth action failed:', err);
                if (messageBox) messageBox.textContent = err?.message || 'Authentication failed.';
                showCustomAlert(err?.message || 'Authentication failed.');
            }
        }

        let currentAuthMode = 'signIn';
        const modalFocusableSelector = [
            'a[href]',
            'button:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[tabindex]:not([tabindex="-1"])'
        ].join(',');
        const managedModalStack = [];

        function getVisibleModalFocusableElements(modal) {
            if (!modal) return [];

            return Array.from(modal.querySelectorAll(modalFocusableSelector))
                .filter(element => element.offsetParent !== null);
        }

        function focusModalElement(modal, initialFocus) {
            const target = initialFocus || getVisibleModalFocusableElements(modal)[0];
            target?.focus();
        }

        function trapModalTab(event, modal) {
            const focusableElements = getVisibleModalFocusableElements(modal);
            if (focusableElements.length === 0) {
                event.preventDefault();
                return;
            }

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (event.shiftKey && document.activeElement === firstElement) {
                event.preventDefault();
                lastElement.focus();
            } else if (!event.shiftKey && document.activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        }

        function openManagedModal(modal, { initialFocus = null, onClose = null } = {}) {
            if (!modal) return;

            const existingEntry = managedModalStack.find(entry => entry.modal === modal);
            modal.classList.add('active');

            if (existingEntry) {
                existingEntry.initialFocus = initialFocus;
                existingEntry.onClose = onClose || existingEntry.onClose;
                focusModalElement(modal, initialFocus);
                return;
            }

            managedModalStack.push({
                modal,
                initialFocus,
                onClose,
                returnFocusTo: document.activeElement
            });
            focusModalElement(modal, initialFocus);
        }

        function closeManagedModal(modal) {
            const entryIndex = managedModalStack.findIndex(entry => entry.modal === modal);

            if (entryIndex === -1) {
                modal?.classList.remove('active');
                return;
            }

            const entry = managedModalStack[entryIndex];
            const wasTopModal = entryIndex === managedModalStack.length - 1;
            managedModalStack.splice(entryIndex, 1);

            if (entry.onClose) {
                entry.onClose();
            } else {
                modal.classList.remove('active');
            }

            if (!wasTopModal) return;

            const nextTopModal = managedModalStack[managedModalStack.length - 1];
            if (nextTopModal) {
                focusModalElement(nextTopModal.modal, nextTopModal.initialFocus);
            } else if (entry.returnFocusTo && document.contains(entry.returnFocusTo)) {
                entry.returnFocusTo.focus();
            }
        }

        document.addEventListener('keydown', (event) => {
            const topModal = managedModalStack[managedModalStack.length - 1];
            if (!topModal) return;

            if (event.key === 'Escape') {
                event.preventDefault();
                closeManagedModal(topModal.modal);
            } else if (event.key === 'Tab') {
                trapModalTab(event, topModal.modal);
            }
        });

        function updateAuthModalUI() {
            const title = document.querySelector('#authModal .modal-title');
            const submitBtn = document.getElementById('authSubmitBtn');
            const passwordHelp = document.getElementById('authPasswordHelp');
            const passwordInput = document.getElementById('authPassword');
            const createAccountBtn = document.getElementById('createAccountBtn');

            if (title) {
                title.textContent = currentAuthMode === 'signUp' ? 'Create account' : currentAuthMode === 'reset' ? 'Reset password' : 'Sign in';
            }

            if (submitBtn) {
                submitBtn.textContent = currentAuthMode === 'signUp' ? 'Create account' : currentAuthMode === 'reset' ? 'Send reset link' : 'Sign In';
            }

            if (passwordHelp) {
                passwordHelp.classList.toggle('hidden', currentAuthMode !== 'signUp');
            }

            const passwordGroup = document.querySelector('.auth-password-group');
            if (passwordGroup) {
                passwordGroup.classList.toggle('hidden', currentAuthMode === 'reset');
            }

            if (passwordInput) {
                passwordInput.required = currentAuthMode !== 'reset';
                passwordInput.placeholder = currentAuthMode === 'signUp' ? 'Create a password' : 'Enter your password';
            }

            if (createAccountBtn) {
                createAccountBtn.textContent = currentAuthMode === 'signUp' ? 'Already have an account? Sign in' : 'Create account';
            }
        }

        function openAuthModal(mode = 'signIn') {
            currentAuthMode = mode;
            const authModal = document.getElementById('authModal');
            const authMessage = document.getElementById('authMessage');
            if (authMessage) {
                authMessage.textContent = '';
            }
            updateAuthModalUI();
            if (authModal) {
                openManagedModal(authModal, {
                    initialFocus: document.getElementById('authEmail')
                });
            }
        }

        function closeAuthModal() {
            const authModal = document.getElementById('authModal');
            if (authModal) {
                closeManagedModal(authModal);
            }
        }

        async function handleSignOut() {
            await supabaseClient.auth.signOut();
            closeAuthModal();
            updateAuthUI(null);
            showCustomAlert('You have been signed out.');
        }

        async function permanentlyDeleteQuoteFromSupabase(clientId) {
            const user = await getCurrentUser();
            if (!user) return;

            const { error } = await supabaseClient
                .from('quotes')
                .delete()
                .eq('user_id', user.id)
                .eq('client_id', clientId);

            if (error) {
                console.error('Supabase permanent delete failed:', error);
                throw error;
            }
        }

        async function uploadQuoteImage(file) {
            const { data: { user }, error: userErr } = await supabaseClient.auth.getUser();
            if (userErr) throw userErr;
            if (!user) throw new Error("Not signed in");

            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
            const filePath = `${user.id}/${fileName}`;

            const { error: uploadError } = await supabaseClient.storage
                .from('quote-images')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            return filePath;
        }

        async function getServerQuoteStatusMap() {
            const user = await getCurrentUser();
            if (!user) return new Map();

            const { data, error } = await supabaseClient
                .from('quotes')
                .select('client_id,status,deletedAt')
                .eq('user_id', user.id);

            if (error) {
                console.error('Error loading server quote statuses:', error);
                throw error;
            }

            return new Map((data || []).map(quote => [quote.client_id, quote]));
        }

        function quoteNeedsSync(quote, serverQuote) {
            if (!quote.client_id) return false;
            if (!quote.synced) return true;
            if (!serverQuote) return true;

            const localStatus = quote.status || 'active';
            const serverStatus = serverQuote.status || 'active';

            if (localStatus !== serverStatus) return true;

            const localDeletedAt = quote.deletedAt ? new Date(quote.deletedAt).getTime() : null;
            const serverDeletedAt = serverQuote.deletedAt ? new Date(serverQuote.deletedAt).getTime() : null;

            return localDeletedAt !== serverDeletedAt;
        }

        let isSyncingLocalChanges = false;

        async function syncLocalChanges() {
            if (isSyncingLocalChanges || !db || !navigator.onLine) return;

            try {
                isSyncingLocalChanges = true;
                await syncUnsyncedQuotes();
                await loadDailyQuote();
                await loadGallery(currentFilter);
                await updateSettingsStats();
            } finally {
                isSyncingLocalChanges = false;
            }
        }

        async function syncUnsyncedQuotes() {
            const quotes = await getAllQuotes();
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            const serverQuoteStatusMap = await getServerQuoteStatusMap();

            const unsyncedQuotes = quotes.filter(q => quoteNeedsSync(q, serverQuoteStatusMap.get(q.client_id)));

            for (const quote of unsyncedQuotes) {
                try {
                    if (!navigator.onLine) break;

                    // 🔥 CASE 1: deleted quote
                    if (quote.status === 'deleted') {

                        const isExpired = quote.deletedAt && quote.deletedAt < thirtyDaysAgo;

                        // 🔥 CASE 1A: expired → permanent delete
                        if (isExpired) {
                            if (quote.client_id) {
                                await permanentlyDeleteQuoteFromSupabase(quote.client_id);
                            }

                            await deleteQuote(quote.id);
                            continue; // move to next quote
                        }

                        // 🔥 CASE 1B: still within 30 days → soft delete
                        if (quote.client_id) {
                            await softDeleteQuoteInSupabase(quote.client_id);
                        }

                        await updateQuote(quote.id, { synced: true });
                        continue;
                    }

                    // 🔥 CASE 2: active or archived quote → normal sync
                    await saveQuoteToSupabase({
                        clientId: quote.client_id,
                        text: quote.text,
                        creator: quote.creator,
                        source: quote.source,
                        imageFile: null,
                        status: quote.status || 'active',
                        deletedAt: quote.deletedAt || null
                    });

                    await updateQuote(quote.id, { synced: true });

                } catch (err) {
                    console.warn("Sync failed for quote:", quote, err);
                }
            }
        }

        window.addEventListener('online', syncLocalChanges);
            



        // Dark mode detection and setup
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.classList.add('dark');
            document.getElementById('darkModeToggle').checked = true;
        }
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
            if (event.matches) {
                document.documentElement.classList.add('dark');
                document.getElementById('darkModeToggle').checked = true;
            } else {
                document.documentElement.classList.remove('dark');
                document.getElementById('darkModeToggle').checked = false;
            }
        });

        // IndexedDB Setup
        let db;
        const DB_NAME = 'DailyWisdomDB';
        const DB_VERSION = 1;
        const STORE_NAME = 'quotes';

        function initDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    db = request.result;
                    resolve(db);
                };

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                        objectStore.createIndex('status', 'status', { unique: false });
                        objectStore.createIndex('createdAt', 'createdAt', { unique: false });
                        objectStore.createIndex('deletedAt', 'deletedAt', { unique: false });
                    }
                };
            });
        }

        // Database operations
        function addQuote(quote) {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.add(quote);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        function getAllQuotes() {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        function updateQuote(id, updates) {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const getRequest = store.get(id);

                getRequest.onsuccess = () => {
                    const quote = getRequest.result;
                    Object.assign(quote, updates);
                    const updateRequest = store.put(quote);
                    transaction.oncomplete = () => resolve();
                    transaction.onerror = () => reject(transaction.error);
                    updateRequest.onerror = () => reject(updateRequest.error);
                };
                getRequest.onerror = () => reject(getRequest.error);
            });
        }

        function deleteQuote(id) {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.delete(id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        function clearAllData() {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        // State management
        let selectedQuotes = new Set();
        let currentFilter = 'active';

        // Navigation
        function switchScreen(screenId) {
            document.querySelectorAll('.screen').forEach(screen => {
                screen.classList.remove('active');
            });
            document.getElementById(screenId).classList.add('active');

            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('active');
            });
            event.target.closest('.nav-item').classList.add('active');

            // Load screen data
            if (screenId === 'homeScreen') {
                loadDailyQuote();
            } else if (screenId === 'galleryScreen') {
                loadGallery(currentFilter);
            } else if (screenId === 'settingsScreen') {
                updateSettingsStats();
            }
        }

        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const screenId = item.dataset.screen;
                switchScreen(screenId);
            });
        });

        // Date formatting
        function formatDate(date) {
            const options = { year: 'numeric', month: 'long', day: 'numeric' };
            return new Date(date).toLocaleDateString('en-US', options);
        }

        function formatDateShort(date) {
            const options = { year: 'numeric', month: 'short', day: 'numeric' };
            return new Date(date).toLocaleDateString('en-US', options);
        }

        // Display current date
        document.getElementById('currentDate').textContent = formatDate(new Date());

        // Daily Quote Logic
        let activeQuotesCache = [];
        let currentQuoteIndex = 0;
        let quoteHistory = [];          // stores indexes you’ve visited, in order
        let historyPos = -1;       // where you currently are in quoteHistory

        function renderDailyQuoteByIndex() {
        const container = document.getElementById('dailyQuoteContainer');
        const dailyQuote = activeQuotesCache[currentQuoteIndex];

        // safety guard (shouldn't happen, but prevents crashes)
        if (!dailyQuote) return;

        let quoteHTML = '<div class="quote-card">';

        if (dailyQuote.image) {
            quoteHTML += `<img src="${dailyQuote.image}" alt="Quote image" class="quote-image">`;
        }

        if (dailyQuote.text) {
            quoteHTML += `<div class="quote-text">${dailyQuote.text}</div>`;
        }

        if (dailyQuote.creator) {
            quoteHTML += `<div class="quote-creator">— ${dailyQuote.creator}</div>`;
        }

        if (dailyQuote.source) {
            quoteHTML += `<div class="quote-source">${dailyQuote.source}</div>`;
        }


        quoteHTML += `<div class="quote-meta">Added ${formatDateShort(dailyQuote.createdAt)}</div>`;
        quoteHTML += `</div>`;

        container.innerHTML = quoteHTML;
        }

        function getDailyQuoteSeed() {
        const today = new Date();
        return today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
        }

        function seededRandom(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
        }

        async function loadDailyQuote() {
        const quotes = await getAllQuotes();
        const activeQuotes = quotes.filter(q => q.status === 'active');

        const quoteContainer = document.getElementById('dailyQuoteContainer');
        const buttonContainer = document.getElementById('button-container');

        if (activeQuotes.length === 0) {
            quoteContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">✨</div>
                    <div class="empty-state-text">
                        No quotes yet. Add your first quote to get started!
                    </div>
                    <button class="btn btn-primary" onclick="openAddModal()">
                        Add Your First Quote
                    </button>
                </div>
            `;

            buttonContainer.innerHTML = ''; // 🔥 THIS WAS MISSING
            return;
        }

        buttonContainer.innerHTML = `
            <div class="unempty-state">
                <button class="btn btn-primary" id="addQuoteBtn" onclick="openAddModal()">
                    + Add New Quote
                </button>
            </div>
        `;

        activeQuotesCache = activeQuotes;

        // pick today's starting quote (seeded)
        const seed = getDailyQuoteSeed();
        currentQuoteIndex = Math.floor(seededRandom(seed) * activeQuotesCache.length);

        // initialize shuffle quoteHistory starting at today's quote
        quoteHistory = [currentQuoteIndex];
        historyPos = 0;

        renderDailyQuoteByIndex();
        }

        function showNextRandomQuote() {
        if (!activeQuotesCache.length) return;

        // if user went back and then hits next, discard forward quoteHistory (browser behavior)
        if (historyPos < quoteHistory.length - 1) {
            quoteHistory = quoteHistory.slice(0, historyPos + 1);
        }

        const currentIndex = quoteHistory[historyPos];
        let nextIndex = Math.floor(Math.random() * activeQuotesCache.length);

        // avoid repeating the same quote when possible
        if (activeQuotesCache.length > 1) {
            while (nextIndex === currentIndex) {
            nextIndex = Math.floor(Math.random() * activeQuotesCache.length);
            }
        }

        quoteHistory.push(nextIndex);
        historyPos++;

        currentQuoteIndex = nextIndex;
        renderDailyQuoteByIndex();
        }

        function showNextQuote() {
        if (!activeQuotesCache.length) return;

        // if there is forward quoteHistory, go forward
        if (historyPos < quoteHistory.length - 1) {
            historyPos++;
            currentQuoteIndex = quoteHistory[historyPos];
            renderDailyQuoteByIndex();
            return;
        }

        // otherwise generate a new random quote and append to quoteHistory
        showNextRandomQuote();
        }

        function showPreviousQuote() {
        if (historyPos <= 0) return;

        historyPos--;
        currentQuoteIndex = quoteHistory[historyPos];
        renderDailyQuoteByIndex();
        }

        // Previous and Next Quotes Buttons (guarded so it doesn't crash the whole script)
        const prevBtn = document.getElementById('prevQuoteBtn');
        const nextBtn = document.getElementById('nextQuoteBtn');

        if (prevBtn) prevBtn.addEventListener('click', showPreviousQuote);
        if (nextBtn) nextBtn.addEventListener('click', showNextQuote);

 
        // Gallery Management
        async function loadGallery(filter = 'active') {
            currentFilter = filter;
            selectedQuotes.clear();
            updateSelectionUI();

            const quotes = await getAllQuotes();
            let filteredQuotes = [];

            if (filter === 'active') {
                filteredQuotes = quotes.filter(q => q.status === 'active');
            } else if (filter === 'archived') {
                filteredQuotes = quotes.filter(q => q.status === 'archived');
            } else if (filter === 'deleted') {
                // Show deleted items that haven't expired (within 30 days)
                const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
                filteredQuotes = quotes.filter(q => {
                    if (q.status === 'deleted' && q.deletedAt) {
                        return q.deletedAt > thirtyDaysAgo;
                    }
                    return false;
                });
            }

            const grid = document.getElementById('galleryGrid');

            if (filteredQuotes.length === 0) {
                const icon = filter === 'deleted' ? '🗑️' : '📭';
                
                grid.innerHTML = `
                    <div class="empty-state" style="grid-column: 1 / -1;">
                    <div class="empty-state-icon">${icon}</div>
                    <div class="empty-state-text">No ${filter} quotes found</div>
                    </div>
                `;
                return; 
            }

            // Sort by creation date, newest first
            filteredQuotes.sort((a, b) => b.createdAt - a.createdAt);

            grid.innerHTML = filteredQuotes.map(quote => `
                <div class="gallery-item" data-id="${quote.id}">
                    <div class="selection-indicator">✓</div>
                    ${quote.image ? `<img src="${quote.image}" alt="Quote" class="gallery-item-image">` : ''}
                    <div class="gallery-item-content">
                        ${quote.text ? `<div class="gallery-item-text">${quote.text}</div>` : ''}
                        ${quote.creator ? `<div class="gallery-item-creator">- ${quote.creator}</div>` : ''}
                        ${quote.source ? `<div class="gallery-item-source">${quote.source}</div>` : ''}
                        <div class="gallery-item-date">${formatDateShort(quote.createdAt)}</div>
                    </div>
                </div>
            `).join('');

            // Add click handlers for selection
            document.querySelectorAll('.gallery-item').forEach(item => {
                item.addEventListener('click', toggleSelection);
            });
        }

        function toggleSelection(e) {
            const item = e.currentTarget;
            const id = parseInt(item.dataset.id);

            if (selectedQuotes.has(id)) {
                selectedQuotes.delete(id);
                item.classList.remove('selected');
            } else {
                selectedQuotes.add(id);
                item.classList.add('selected');
            }

            updateSelectionUI();
        }

        function updateSelectionUI() {
            const hasSelection = selectedQuotes.size > 0;

            document.getElementById('archiveSelectedBtn').classList.toggle('hidden', !hasSelection || currentFilter !== 'active');
            document.getElementById('deleteSelectedBtn').classList.toggle('hidden', !hasSelection || currentFilter === 'deleted');
            document.getElementById('recoverSelectedBtn').classList.toggle('hidden', !hasSelection || !['archived', 'deleted'].includes(currentFilter));
            document.getElementById('recoverSelectedBtn').textContent = currentFilter === 'archived' ? 'Unarchive' : 'Recover';
            document.getElementById('cancelSelectionBtn').classList.toggle('hidden', !hasSelection);
        }

        // Filter tabs
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                loadGallery(tab.dataset.filter);
            });
        });

        // Add quote modal
        function openAddModal() {
            const addQuoteModal = document.getElementById('addQuoteModal');
            document.getElementById('quoteText').value = '';
            document.getElementById('quoteCreator').value = '';
            document.getElementById('quoteSource').value = '';
            document.getElementById('quoteImage').value = '';
            document.getElementById('imagePreview').innerHTML = '';
            document.getElementById('imagePreview').classList.add('hidden');
            openManagedModal(addQuoteModal, {
                initialFocus: document.getElementById('quoteText')
            });
        }

        function closeAddModal() {
            closeManagedModal(document.getElementById('addQuoteModal'));
        }

        document.getElementById('addQuoteBtn').addEventListener('click', openAddModal);
        document.getElementById('closeAddModal').addEventListener('click', closeAddModal);
        document.getElementById('cancelAddBtn').addEventListener('click', closeAddModal);

        // File upload
        document.getElementById('fileUploadArea').addEventListener('click', () => {
            document.getElementById('quoteImage').click();
        });

        document.getElementById('quoteImage').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const preview = document.getElementById('imagePreview');
                    preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
                    preview.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            }
        });

        // Add quote form submission
            // Current app supports either:
            // 1) text quote
            // 2) image quote
            // Not both together yet
        document.getElementById('addQuoteForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const text = document.getElementById('quoteText').value.trim();
            const creator = document.getElementById('quoteCreator').value.trim();
            const source = document.getElementById('quoteSource').value.trim();
            const imageFile = document.getElementById('quoteImage').files[0];

            if (!text && !imageFile) {
                showCustomAlert('Please add either text or an image');
                return;
            }

            let imageData = null;
            if (imageFile) {
                imageData = await fileToBase64(imageFile);
            }

            const quote = {
                client_id: crypto.randomUUID(),
                text: text,
                creator: creator || null,
                source: source || null,
                image: imageData,
                status: 'active',
                createdAt: Date.now(),
                deletedAt: null,
                synced: false
            };


            let cloudSaved = false;

            try {
                // Save to Supabase if signed in
                    await saveQuoteToSupabase({
                        clientId: quote.client_id,
                        text: quote.text,
                        creator: quote.creator,
                        source: quote.source,
                        imageFile: imageFile,
                        status: quote.status,
                        deletedAt: quote.deletedAt
                    });
                
                cloudSaved = true;
            } catch (err) {
                console.warn("Supabase save failed:", err);
            }

           quote.synced = cloudSaved; 

            await addQuote(quote);
            closeAddModal();
            loadGallery(currentFilter);
            loadDailyQuote();
            showCustomAlert('Quote added successfully!');
            });


        function fileToBase64(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        // Gallery actions
        document.getElementById('archiveSelectedBtn').addEventListener('click', async () => {
            if (selectedQuotes.size === 0) return;

            showCustomConfirm(`Archive ${selectedQuotes.size} quote(s)?`, async () => {
                const quotes = await getAllQuotes();

                for (const id of selectedQuotes) {
                    const quote = quotes.find(q => q.id === id);

                    await updateQuote(id, { status: 'archived', deletedAt: null, synced: false });

                    try {
                        if (navigator.onLine && quote?.client_id) {
                            await updateQuoteStatusInSupabase([quote.client_id], 'archived');
                            await updateQuote(id, { synced: true });
                        }
                    } catch (err) {
                        console.warn('Archive sync failed, will retry later:', err);
                    }
                }
                selectedQuotes.clear();
                loadGallery(currentFilter);
                loadDailyQuote();
            });
        });

        document.getElementById('deleteSelectedBtn').addEventListener('click', async () => {
            if (selectedQuotes.size === 0) return;

            const message = currentFilter === 'archived'
                ? `Move ${selectedQuotes.size} quote(s) to trash? They will be permanently deleted after 30 days.`
                : `Delete ${selectedQuotes.size} quote(s)? They will be moved to trash for 30 days.`;

            showCustomConfirm(message, async () => {
                const quotes = await getAllQuotes();

                for (const id of selectedQuotes) {
                    const quote = quotes.find(q => q.id === id);

                    await updateQuote(id, { 
                        status: 'deleted', 
                        deletedAt: Date.now(),
                        synced: false
                    });

                    try {
                        if (navigator.onLine && quote?.client_id) {
                            await softDeleteQuoteInSupabase(quote.client_id);

                            await updateQuote(id, { synced: true });
                        }
                    } catch (err) {
                        console.warn('Soft delete sync failed, will retry later:', err);
                    }
                }

                selectedQuotes.clear();
                loadGallery(currentFilter);
                loadDailyQuote();
            });
        });

        document.getElementById('recoverSelectedBtn').addEventListener('click', async () => {
            if (selectedQuotes.size === 0) return;

            const quotes = await getAllQuotes();

            for (const id of selectedQuotes) {
                const quote = quotes.find(q => q.id === id);

                await updateQuote(id, { status: 'active', deletedAt: null, synced: false });

                try {
                    if (navigator.onLine && quote?.client_id) {
                        await updateQuoteStatusInSupabase([quote.client_id], 'active');
                        await updateQuote(id, { synced: true });
                    }
                } catch (err) {
                    console.warn('Recover sync failed, will retry later:', err);
                }
            }
            selectedQuotes.clear();
            loadGallery(currentFilter);
            loadDailyQuote();
            showCustomAlert(currentFilter === 'archived' ? 'Quote(s) unarchived successfully!' : 'Quote(s) recovered successfully!');
        });

        document.getElementById('cancelSelectionBtn').addEventListener('click', () => {
            selectedQuotes.clear();
            document.querySelectorAll('.gallery-item').forEach(item => {
                item.classList.remove('selected');
            });
            updateSelectionUI();
        });

        // Search functionality
        let searchTimeout;
        document.getElementById('searchInput').addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(performSearch, 300);
        });

        document.getElementById('searchFromDate').addEventListener('change', performSearch);
        document.getElementById('searchToDate').addEventListener('change', performSearch);

        async function performSearch() {
            const keyword = document.getElementById('searchInput').value.toLowerCase().trim();
            const fromDate = document.getElementById('searchFromDate').value;
            const toDate = document.getElementById('searchToDate').value;

            let quotes = await getAllQuotes();
            quotes = quotes.filter(q => q.status === 'active');

            // Filter by keyword
            if (keyword) {
                quotes = quotes.filter(q =>
                    q.text && q.text.toLowerCase().includes(keyword)
                );
            }

            // Filter by date range
            if (fromDate) {
                const fromTime = new Date(fromDate).getTime();
                quotes = quotes.filter(q => q.createdAt >= fromTime);
            }
            if (toDate) {
                const toTime = new Date(toDate).getTime() + (24 * 60 * 60 * 1000) - 1;
                quotes = quotes.filter(q => q.createdAt <= toTime);
            }

            // Sort by relevance (most recent first)
            quotes.sort((a, b) => b.createdAt - a.createdAt);

            // Display results
            const resultsCount = document.getElementById('searchResultsCount');
            const resultsGrid = document.getElementById('searchResultsGrid');

            resultsCount.textContent = `${quotes.length} result${quotes.length !== 1 ? 's' : ''} found`;

            if (quotes.length === 0) {
                resultsGrid.innerHTML = `
                    <div class="empty-state" style="grid-column: 1/-1;">
                        <div class="empty-state-icon">🔍</div>
                        <div class="empty-state-text">No quotes match your search</div>
                    </div>
                `;
                return;
            }

            resultsGrid.innerHTML = quotes.map(quote => `
                <div class="gallery-item">
                    ${quote.image ? `<img src="${quote.image}" alt="Quote" class="gallery-item-image">` : ''}
                    <div class="gallery-item-content">
                        ${quote.text ? `<div class="gallery-item-text">${quote.text}</div>` : ''}
                        <div class="gallery-item-date">${formatDateShort(quote.createdAt)}</div>
                    </div>
                </div>
            `).join('');
        }

        // Settings
        document.getElementById('darkModeToggle').addEventListener('change', (e) => {
            if (e.target.checked) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        });

        async function updateSettingsStats() {
            const quotes = await getAllQuotes();
            const activeQuotes = quotes.filter(q => q.status === 'active');
            document.getElementById('totalQuotesCount').textContent =
                `${activeQuotes.length} quote${activeQuotes.length !== 1 ? 's' : ''} in collection`;
        }

        document.getElementById('authToggleBtn').addEventListener('click', async () => {
            const session = await supabaseClient.auth.getSession();

            if (session.data.session) {
                await handleSignOut();
                return;
            }

            openAuthModal();
        });

        document.getElementById('closeAuthModal').addEventListener('click', closeAuthModal);

        document.getElementById('authForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            await handleEmailPasswordAuth(currentAuthMode);
        });

        document.getElementById('forgotPasswordBtn').addEventListener('click', () => openAuthModal('reset'));

        document.getElementById('createAccountBtn').addEventListener('click', () => {
            const nextMode = currentAuthMode === 'signUp' ? 'signIn' : 'signUp';
            openAuthModal(nextMode);
        });

        document.getElementById('clearDataBtn').addEventListener('click', () => {
            showCustomConfirm('Are you sure you want to permanently delete all quotes? This action cannot be undone.', async () => {
                await clearAllData();
                loadGallery(currentFilter);
                loadDailyQuote();
                updateSettingsStats();
                showCustomAlert('All data has been cleared');
            });
        });

        // Cleanup expired deleted quotes on app load
        async function cleanupExpiredQuotes() {
            const quotes = await getAllQuotes();
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

            for (const quote of quotes) {
                if (
                    quote.status === 'deleted' &&
                    quote.deletedAt &&
                    quote.deletedAt < thirtyDaysAgo
                ) {
                    try {
                        // 🧠 Step 1: delete from Supabase FIRST
                        if (navigator.onLine && quote.client_id) {
                            await permanentlyDeleteQuoteFromSupabase(quote.client_id);
                        } else {
                            // ❗ IMPORTANT: skip if offline to avoid desync
                            continue;
                        }

                        // 🧠 Step 2: delete locally AFTER success
                        await deleteQuote(quote.id);

                    } catch (err) {
                        console.warn('Failed to permanently delete expired quote:', err);
                    }
                }
            }
        }

        // Custom alert/confirm dialogs
        function showCustomAlert(message) {
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h2 class="modal-title">Notice</h2>
                    </div>
                    <p style="color: var(--text-secondary); margin-bottom: 20px;">${message}</p>
                    <button class="btn btn-primary alert-ok-btn" style="width: 100%;">OK</button>
                </div>
            `;
            document.body.appendChild(modal);

            const okButton = modal.querySelector('.alert-ok-btn');
            okButton.addEventListener('click', () => closeManagedModal(modal));
            openManagedModal(modal, {
                initialFocus: okButton,
                onClose: () => modal.remove()
            });
        }

        function showCustomConfirm(message, onConfirm) {
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h2 class="modal-title">Confirm</h2>
                    </div>
                    <p style="color: var(--text-secondary); margin-bottom: 20px;">${message}</p>
                    <div style="display: flex; gap: 12px;">
                        <button class="btn btn-secondary cancel-btn" style="flex: 1;">Cancel</button>
                        <button class="btn btn-primary confirm-btn" style="flex: 1;">Confirm</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            modal.querySelector('.cancel-btn').addEventListener('click', () => {
                closeManagedModal(modal);
            });

            modal.querySelector('.confirm-btn').addEventListener('click', () => {
                closeManagedModal(modal);
                onConfirm();
            });

            openManagedModal(modal, {
                initialFocus: modal.querySelector('.cancel-btn'),
                onClose: () => modal.remove()
            });
        }

        // Initialize app
        async function initApp() {
            // Check initial auth state and update UI
            const { data } = await supabaseClient.auth.getSession();
            updateAuthUI(data.session);

            await initDB();
            await cleanupExpiredQuotes();
            await syncLocalChanges();
            await loadDailyQuote();
            await updateSettingsStats();
        }

        initApp();
