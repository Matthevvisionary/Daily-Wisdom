const appUrl = 'app/';
const startedKey = 'dailyInspoStarted';
const supabaseSessionKey = 'sb-mmchlykmezehfmtdtjff-auth-token';
const landingMenuToggle = document.getElementById('landingMenuToggle');
const landingNav = document.getElementById('landingNav');
const onboardingModal = document.getElementById('onboardingModal');
const onboardingNext = document.getElementById('onboardingNext');
const onboardingBack = document.getElementById('onboardingBack');
let onboardingStep = 1;

function revealLanding() {
    document.documentElement.classList.remove('entry-routing');
}

function hasStoredQuotes() {
    return new Promise(resolve => {
        if (!('indexedDB' in window)) {
            resolve(false);
            return;
        }

        const request = indexedDB.open('DailyWisdomDB', 1);

        request.onerror = () => resolve(false);
        request.onupgradeneeded = () => {
            // A first-time visitor has no database yet. Avoid creating app schema here.
            request.transaction?.abort();
            resolve(false);
        };
        request.onsuccess = () => {
            const database = request.result;

            if (!database.objectStoreNames.contains('quotes')) {
                database.close();
                resolve(false);
                return;
            }

            const transaction = database.transaction('quotes', 'readonly');
            const countRequest = transaction.objectStore('quotes').count();
            countRequest.onsuccess = () => {
                database.close();
                resolve(countRequest.result > 0);
            };
            countRequest.onerror = () => {
                database.close();
                resolve(false);
            };
        };
    });
}

function hasStoredSession() {
    try {
        const savedSession = localStorage.getItem(supabaseSessionKey);
        if (!savedSession) return false;

        const session = JSON.parse(savedSession);
        return Boolean(session?.user && session?.access_token);
    } catch (error) {
        console.warn('Could not check the saved Daily Inspo session:', error);
        return false;
    }
}

async function routeReturningVisitor() {
    try {
        const hasStarted = localStorage.getItem(startedKey) === 'true';
        if (hasStarted || await hasStoredQuotes() || hasStoredSession()) {
            localStorage.setItem(startedKey, 'true');
            window.location.replace(appUrl);
            return;
        }
    } catch (error) {
        console.warn('Could not check returning-visitor state:', error);
    }

    revealLanding();
}

// Never leave the marketing page hidden if a browser storage API stalls.
const routingFallback = window.setTimeout(revealLanding, 1800);
routeReturningVisitor().finally(() => window.clearTimeout(routingFallback));

function getFocusableElements(container) {
    return Array.from(container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
}

function renderOnboardingStep() {
    document.querySelectorAll('.onboarding-step').forEach(step => {
        step.classList.toggle('active', Number(step.dataset.onboardingStep) === onboardingStep);
    });

    document.getElementById('onboardingStepLabel').textContent = `Step ${onboardingStep} of 3`;
    document.getElementById('onboardingProgressBar').style.width = `${onboardingStep * 33.333}%`;
    onboardingBack.classList.toggle('hidden', onboardingStep === 1);
    onboardingNext.innerHTML = onboardingStep === 3
        ? 'Open Daily Inspo <span>→</span>'
        : 'Continue <span>→</span>';
}

function openOnboarding() {
    onboardingStep = 1;
    renderOnboardingStep();
    onboardingModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    onboardingModal.querySelector('.choice-chip')?.focus();
}

function closeOnboarding() {
    onboardingModal.classList.remove('active');
    document.body.style.overflow = '';
    document.getElementById('getStartedBtn')?.focus();
}

landingMenuToggle?.addEventListener('click', () => {
    const isOpen = landingMenuToggle.getAttribute('aria-expanded') === 'true';
    landingMenuToggle.setAttribute('aria-expanded', String(!isOpen));
    landingNav.classList.toggle('open', !isOpen);
});

landingNav?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
        landingMenuToggle?.setAttribute('aria-expanded', 'false');
        landingNav.classList.remove('open');
    });
});

document.getElementById('getStartedBtn')?.addEventListener('click', openOnboarding);
document.getElementById('closeOnboarding')?.addEventListener('click', closeOnboarding);

document.querySelectorAll('.choice-chip').forEach(choice => {
    choice.addEventListener('click', () => choice.classList.toggle('selected'));
});

document.querySelectorAll('.starter-choice').forEach(choice => {
    choice.addEventListener('click', () => {
        document.querySelectorAll('.starter-choice').forEach(item => item.classList.remove('selected'));
        choice.classList.add('selected');
    });
});

onboardingBack?.addEventListener('click', () => {
    if (onboardingStep > 1) {
        onboardingStep -= 1;
        renderOnboardingStep();
    }
});

onboardingNext?.addEventListener('click', () => {
    if (onboardingStep < 3) {
        onboardingStep += 1;
        renderOnboardingStep();
        return;
    }

    const preferences = {
        inspiration: Array.from(document.querySelectorAll('.choice-chip.selected')).map(choice => choice.textContent.trim()),
        starterQuotes: document.querySelector('.starter-choice.selected')?.dataset.starterQuotes === 'yes',
        firstCollection: document.getElementById('firstCollectionName').value.trim()
    };

    sessionStorage.setItem('dailyInspoPendingOnboarding', JSON.stringify(preferences));
    localStorage.setItem(startedKey, 'true');
    window.location.href = `${appUrl}?action=finish-onboarding`;
});

document.addEventListener('keydown', event => {
    if (!onboardingModal.classList.contains('active')) return;

    if (event.key === 'Escape') {
        closeOnboarding();
        return;
    }

    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements(onboardingModal);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
});
