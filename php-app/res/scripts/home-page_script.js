
function resetHomePageUI() {
    const introScreen = document.getElementById('intro-screen');
    const loadingScreen = document.getElementById('loading-screen');
    const welcomeText = document.getElementById('welcome-text');
    const transitionBg = document.getElementById('transition-bg');
    const bravoImage = document.getElementById('bravo-img');
    const compassButton = document.getElementById('compass-btn');
    const loginBtn = document.getElementById('admin-login-btn');

    if (!introScreen || !loadingScreen) return;

    // Reset Visuals
    introScreen.classList.remove('hidden', 'zoom-effect');
    loadingScreen.classList.add('hidden');
    loadingScreen.classList.remove('fade-in');
    
    if (welcomeText) welcomeText.classList.remove('text-fade-out');
    if (transitionBg) transitionBg.classList.remove('bg-fade-in');
    if (bravoImage) bravoImage.classList.remove('bravo-hover-effect');
    
    // Unlock Controls
    if (compassButton) compassButton.style.pointerEvents = 'auto';
    if (loginBtn) loginBtn.style.display = 'block';
    
    console.log("UI Reset to Entry State");
}

document.addEventListener('DOMContentLoaded', () => {
    // 2. Silent Logout on Load
    fetch('http://localhost:3000/api/logout', { 
        method: 'POST', 
        credentials: 'include' 
    }).catch(() => {});

    // 3. Initial UI Reset
    resetHomePageUI();

    const elements = {
        compassButton: document.getElementById('compass-btn'),
        bravoImage: document.getElementById('bravo-img'),
        introScreen: document.getElementById('intro-screen'),
        loadingScreen: document.getElementById('loading-screen'),
        welcomeText: document.getElementById('welcome-text'),
        transitionBg: document.getElementById('transition-bg'),
        loginBtn: document.getElementById('admin-login-btn')
    };

    if (elements.compassButton && elements.bravoImage) {
        // Hover Effects
        elements.compassButton.addEventListener('mouseenter', () => {
            elements.bravoImage.classList.add('bravo-hover-effect');
        });

        elements.compassButton.addEventListener('mouseleave', () => {
            elements.bravoImage.classList.remove('bravo-hover-effect');
        });

        // Click Logic
        elements.compassButton.addEventListener('click', () => {
            // Lock UI
            elements.compassButton.style.pointerEvents = 'none';
            elements.bravoImage.classList.remove('bravo-hover-effect');
            
            // Start Animation
            if(elements.welcomeText) elements.welcomeText.classList.add('text-fade-out');
            elements.introScreen.classList.add('zoom-effect');
            if(elements.transitionBg) elements.transitionBg.classList.add('bg-fade-in');
            if(elements.loginBtn) elements.loginBtn.style.display = 'none';

            // Show Loading after 1s
            setTimeout(() => {
                elements.introScreen.classList.add('hidden');
                elements.loadingScreen.classList.remove('hidden');
                elements.loadingScreen.classList.add('fade-in');
            }, 1000);

            // Navigate after 2s
            setTimeout(() => {
                window.location.href = 'mainpage.html';
            }, 2000);
        });
    }
});

// This event fires every time the page appears, including "Back" navigation.
window.addEventListener('pageshow', (event) => {
    resetHomePageUI();
});