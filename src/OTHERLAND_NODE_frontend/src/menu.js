// Import necessary components from viewer.js and khet.js
import { controls, canvas, scene, sceneObjects, world, groundMaterial, animationMixers, khetState, cameraController, avatarMesh, avatarBody } from './viewer.js';
import { khetController, clearAllKhets, loadKhet } from './khet.js';

// ### Pointer Lock State Handling
// Listen for changes in the pointer lock state to manage menu visibility
document.addEventListener('pointerlockchange', () => {
    const menu = document.getElementById('menu');
    if (!document.pointerLockElement) {
        menu.style.display = 'flex'; // Show the menu when pointer lock is released
        keys.clear();                // Clear any active key presses
        const closeBtn = document.getElementById('close-btn');
        closeBtn.disabled = true;    // Disable the close button temporarily
        setTimeout(() => {
            closeBtn.disabled = false; // Re-enable the close button after 1.25 seconds
        }, 1250);
    }
});

// ### Key Input Handling
// Set to track currently pressed keys
export const keys = new Set();

// Handle key presses, including the Escape key to show the menu
document.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    keys.add(key); // Add pressed key to the set

    if (key === 'escape') {
        const menu = document.getElementById('menu');
        const isMenuVisible = menu.style.display === 'flex';

        if (!isMenuVisible) {
            menu.style.display = 'flex'; // Show the menu if it's not visible
            controls.unlock();           // Unlock the pointer controls
            keys.clear();                // Clear active keys
        }
    }
});

// Handle key releases to remove keys from the set
document.addEventListener('keyup', event => {
    keys.delete(event.key.toLowerCase());
});

// ### Menu Navigation and UI Toggling
// Wait for the DOM to load before setting up event listeners
document.addEventListener('DOMContentLoaded', () => {
    let selectedAvatarId = null;

    // **Main Menu**
    const mainPage = document.getElementById('main-page');

    // **Start Button**
    // Start the game by hiding the start overlay and locking controls
    const startBtn = document.getElementById('start-btn');
    startBtn.addEventListener('click', async () => {
        document.getElementById('start-overlay').style.display = 'none';
        controls.lock();          // Lock the pointer for game control
        canvas.focus();           // Focus on the canvas for input

        // Load Avatar
        if (selectedAvatarId) { 
            try {
                const { avatarMesh: newAvatarMesh, avatarBody: newAvatarBody } = await loadKhet(selectedAvatarId, {
                    scene,
                    sceneObjects,
                    world,
                    groundMaterial,
                    animationMixers,
                    khetState,
                    cameraController
                });
                if (newAvatarMesh && newAvatarBody) {
                    
                    // Update global avatar references from viewer.js
                    window.avatarMesh = newAvatarMesh;
                    window.avatarBody = newAvatarBody;
                }
            } catch (error) {
                console.error('Failed to load avatar:', error);
            }
        }
    });

    // **Clear Khets Button**
    // Clear all Khets from the backend and storage canisters
    const clearBtn = document.getElementById('clear-khets-btn');
    clearBtn.addEventListener('click', async () => {
        await clearAllKhets();    // Call the function to clear Khets
        console.log('Khets cleared from menu'); // Log confirmation
    });

    // **Home Button**
    // Return to the start overlay and unlock controls
    const homeBtn = document.getElementById('home-btn');
    homeBtn.addEventListener('click', () => {
        document.getElementById('menu').style.display = 'none';           // Hide the game menu
        document.getElementById('start-overlay').style.display = 'flex';  // Show the start overlay
        controls.unlock();                     // Unlock pointer controls
        keys.clear();                          // Clear active keys
    });

    // **Avatar Page**
    const avatarPage = document.getElementById('avatar-page');
    const avatarBtn = document.getElementById('avatar-btn');
    avatarBtn.addEventListener('click', () => {
        showPage(avatarPage); // Show avatar selection page
        populateAvatarButtons(); // Load Avatars
    });
    const backAvatarBtn = document.getElementById('back-avatar-btn');
    backAvatarBtn.addEventListener('click', () => showPage(mainPage)); // Return to main menu

    // **Settings Page**
    const settingsPage = document.getElementById('settings-page');
    const settingsBtn = document.getElementById('settings-btn');
    settingsBtn.addEventListener('click', () => showPage(settingsPage)); // Show settings page
    const backSettingsBtn = document.getElementById('back-settings-btn');
    backSettingsBtn.addEventListener('click', () => showPage(mainPage)); // Return to main menu

    // **Close Button**
    // Resume the game by hiding the menu and locking controls
    const closeBtn = document.getElementById('close-btn');
    closeBtn.addEventListener('click', () => {
        const menu = document.getElementById('menu');
        menu.style.display = 'none'; // Hide the menu
        controls.lock();             // Lock the pointer for game control
        canvas.focus();              // Focus on the canvas for input
    });

    // **UI Toggle Checkboxes**
    const chatArea = document.getElementById('chat');
    const friendsList = document.getElementById('friends-list');
    const mapArea = document.getElementById('map');
    const toggleChat = document.getElementById('toggle-chat');
    const toggleFriends = document.getElementById('toggle-friends');
    const toggleMap = document.getElementById('toggle-map');

    // Toggle visibility of chat area
    toggleChat.addEventListener('change', () => {
        chatArea.style.display = toggleChat.checked ? 'block' : 'none';
    });

    // Toggle visibility of friends list
    toggleFriends.addEventListener('change', () => {
        friendsList.style.display = toggleFriends.checked ? 'block' : 'none';
    });

    // Toggle visibility of map area
    toggleMap.addEventListener('change', () => {
        mapArea.style.display = toggleMap.checked ? 'block' : 'none';
    });

    // **Avatar Selection Buttons**
    // Populate avatar selection buttons
    function populateAvatarButtons() {
        const avatars = khetController.getAvatars();
        const avatarButtonsContainer = avatarPage.querySelector('.avatar-buttons') || avatarPage;
        avatarButtonsContainer.innerHTML = ''; // Clear existing buttons
        avatars.forEach((avatar, index) => {
            const button = document.createElement('button');
            button.textContent = `Avatar ${index + 1}`;
            button.setAttribute('data-avatar', avatar.khetId);
            button.addEventListener('click', () => {
                selectedAvatarId = avatar.khetId;
                console.log(`Selected Avatar ${avatar.khetId}`);
            });
            avatarButtonsContainer.appendChild(button);
        });
        const backButton = document.getElementById('back-avatar-btn');
        avatarButtonsContainer.appendChild(backButton); // Re-append back button
    }

    // **Page Switching Function**
    // Helper function to switch between menu pages
    function showPage(page) {
        mainPage.classList.remove('active');
        settingsPage.classList.remove('active');
        avatarPage.classList.remove('active');
        page.classList.add('active'); // Activate the selected page
    }
});