// Import necessary components
import { controls, canvas, scene, sceneObjects, world, groundMaterial, animationMixers, khetState, cameraController, loadScene, stopAnimation, startAnimation } from './viewer.js';
import { khetController, clearAllKhets, worldController, loadAvatarObject } from './khet.js';
import { Actor, HttpAgent } from '@dfinity/agent';
import { idlFactory as backendIdlFactory } from '../../declarations/OTHERLAND_NODE_backend';
import { nodeSettings } from './nodeManager.js';
import { user } from './user.js';
import { online } from './peermesh.js'

// ### Pointer Lock State Handling
// Listen for changes in the pointer lock state to manage game menu visibility
document.addEventListener('pointerlockchange', () => {
    const gameMenu = document.getElementById('game-menu');
    if (!document.pointerLockElement) {
        stopAnimation();                 // Stop animation when pointer lock is released
        gameMenu.style.display = 'flex'; // Show the game menu when pointer lock is released
        keys.clear();                    // Clear any active key presses
        const closeBtn = document.getElementById('close-btn');
        closeBtn.disabled = true;        // Disable the close button temporarily
        document.getElementById('guiLayer').style.display = 'none'; // Show the GUI layer when pointer lock is released
        setTimeout(() => {
            closeBtn.disabled = false;   // Re-enable the close button after 1.25 seconds
        }, 1250);
    } else {
        document.getElementById('guiLayer').style.display = 'block'; // Hide the GUI layer when pointer lock is acquired
        startAnimation();                // Start animation when pointer lock is acquired
    }
});

// ### Key Input Handling
// Set to track currently pressed keys
export const keys = new Set();

// Handle key presses, including the Escape key to show the game menu
document.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    keys.add(key); // Add pressed key to the set

    // Handle ESC key seperatly
    if (key === 'escape') {
        const mainMenu = document.getElementById('main-menu');
        const gameMenu = document.getElementById('game-menu');
        const isMainMenuVisible = mainMenu.style.display === 'flex';
        const isGameMenuVisible = gameMenu.style.display === 'flex';

        if (!isMainMenuVisible) {
            if (!isGameMenuVisible) {
                gameMenu.style.display = 'flex'; // Show the game menu if it's not visible
                controls.unlock();           // Unlock the pointer controls
                keys.clear();                // Clear active keys
            }
        }
    }
});

// Handle key releases to remove keys from the set
document.addEventListener('keyup', event => {
    keys.delete(event.key.toLowerCase());
});

// Deactivate Context Menu
document.addEventListener('contextmenu', function(e){
    e.preventDefault();
}, false);

export async function updateKhetTable() {
    // Select the table
    const table = document.querySelector('#khet-table');
            
    // Clear existing data rows (keep the header row)
    const rows = table.querySelectorAll('tr');
    for (let i = 1; i < rows.length; i++) {
        rows[i].remove();
    }

    // Load Khets from the backend
    await khetController.loadAllKhets();

    // Populate the table with Khet data
    const khets = Object.values(khetController.khets);
    for (const khet of khets) {
        const tr = document.createElement('tr');
        
        // KhetID column
        const tdId = document.createElement('td');
        tdId.textContent = khet.khetId;
        tr.appendChild(tdId);
        
        // KhetType column
        const tdType = document.createElement('td');
        tdType.textContent = khet.khetType;
        tr.appendChild(tdType);
        
        // Position column
        const tdPosition = document.createElement('td');
        tdPosition.textContent = `[${khet.position.join(', ')}]`;
        tr.appendChild(tdPosition);
        
        // Scale column
        const tdScale = document.createElement('td');
        tdScale.textContent = `[${khet.scale.join(', ')}]`;
        tr.appendChild(tdScale);
        
        // Code column
        const tdCode = document.createElement('td');
        tdCode.textContent = khet.code ? khet.code.join(', ') : '';
        tr.appendChild(tdCode);
        
        // Edit column
        const tdEdit = document.createElement('td');
        const editKhetButton = document.createElement('button');
        editKhetButton.textContent = "Edit Khet";
        editKhetButton.addEventListener('click', async () => {

            // Switch to Edit Display
            document.getElementById("edit-group").style.display = 'block';
            document.getElementById("upload-group").style.display = 'none';

            // Display Type and ID
            document.getElementById("edit-khet-type").innerHTML = khet.khetType;
            document.getElementById("edit-khet-id").innerHTML = khet.khetId;

            // Display position and scale to input fields
            document.getElementById('pos-x').value = khet.position[0];
            document.getElementById('pos-y').value = khet.position[1];
            document.getElementById('pos-z').value = khet.position[2];
            document.getElementById('scale-x').value = khet.scale[0];
            document.getElementById('scale-y').value = khet.scale[1];
            document.getElementById('scale-z').value = khet.scale[2];
        });
        tdEdit.appendChild(editKhetButton);
        tr.appendChild(tdEdit);
        
        // Append the row to the table
        table.appendChild(tr);
    }
    return;
}

function changekhetEditorDrawer(goal) {
    if (goal == "open") {
        document.getElementById("khet-editor").style.bottom = "0px";
        document.getElementById("draw-up-btn").style.display = "none";
        document.getElementById("draw-close-btn").style.display = "block";
    } else if (goal == "close") {
        document.getElementById("khet-editor").style.bottom = "-20px";
        document.getElementById("draw-up-btn").style.display = "block";
        document.getElementById("draw-close-btn").style.display = "close";
    }
    return;
}

// ### Menu Navigation and UI Toggling
// Wait for the DOM to load before setting up event listeners
document.addEventListener('DOMContentLoaded', () => {

    // Declare Variables
    const startScreen = document.getElementById('start-screen');
    const mainMenu = document.getElementById('main-menu');
    const accountSwitcher = document.getElementById('account-switcher');
    const welcomeMessage = document.getElementById('welcome-message');
    const tabs = document.querySelectorAll('.tab');

    // **Main Menu**
    const mainPage = document.getElementById('main-page');

    // Enter TreeHouse
    const enterTreehouseBtn = document.getElementById('enter-treehouse-btn');
    enterTreehouseBtn.addEventListener('click', async () => {

        // Define the parameters for loadScene and loadAvatarObject
        const params = { scene, sceneObjects, world, groundMaterial, animationMixers, khetState, cameraController };

        // Load Scene with params and nodeSettings
        await loadScene(params, nodeSettings);

        // Load Avatar with params
        await loadAvatarObject(params);

        document.getElementById('main-menu').style.display = 'none';
        controls.lock();          // Lock the pointer for game control
        canvas.focus();           // Focus on the canvas for input
    });

    // Toogle Peer Network Button
    const togglePeerButton = document.getElementById("toggle-p2p-btn");
    togglePeerButton.addEventListener('click', async () => {
        nodeSettings.togglePeerNetworkAllowed();
    })

    // Sharing Dialog
    const shareThButton = document.getElementById("share-th-link-btn");
    shareThButton.addEventListener('click', async () => {

        let thisurl = window.location.protocol + "//" + window.location.host;

        navigator.share({
            title: 'Otherland Invite',
            text: 'Come visit my TreeHouse!\u000d\u000d',
            url: (thisurl + '?id=' + online.ownID),
        });
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
        document.getElementById('game-menu').style.display = 'none';           // Hide the game menu
        document.getElementById('main-menu').style.display = 'flex';  // Show the start overlay
        controls.unlock();                     // Unlock pointer controls
        keys.clear();                          // Clear active keys
    });

    // **Avatar Page**
    const avatarPage = document.getElementById('avatar-page');
    const avatarBtn = document.getElementById('avatar-btn');
    avatarBtn.addEventListener('click', () => {
        populateAvatarButtons(); // Load Avatars
        showPage(avatarPage); // Show avatar selection page
    });
    const backAvatarBtn = document.getElementById('back-avatar-btn');
    backAvatarBtn.addEventListener('click', () => showPage(mainPage)); // Return to main menu

    // **Settings Page**
    const settingsPage = document.getElementById('settings-page');
    const settingsBtn = document.getElementById('game-settings-btn');
    settingsBtn.addEventListener('click', () => showPage(settingsPage)); // Show settings page
    const backSettingsBtn = document.getElementById('back-settings-btn');
    backSettingsBtn.addEventListener('click', () => showPage(mainPage)); // Return to main menu

    // **Close Button**
    // Resume the game by hiding the game menu and locking controls
    const closeBtn = document.getElementById('close-btn');
    closeBtn.addEventListener('click', () => {
        const gameMenu = document.getElementById('game-menu');
        gameMenu.style.display = 'none'; // Hide the game menu
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
        const avatarButtonsContainer = document.getElementById("avatar-container");
        avatarButtonsContainer.innerHTML = ""; // Clear existing buttons
        avatars.forEach((avatar, index) => {
            const button = document.createElement('button');
            button.textContent = `Avatar ${avatar.khetId}`;
            button.setAttribute('data-avatar', avatar.khetId);
            button.addEventListener('click', async () => {
                console.log(`Selected Avatar ${avatar.khetId}`);

                // Load Avatar
                await worldController.setAvatar(avatar.khetId, { scene, sceneObjects, world, groundMaterial, animationMixers, khetState, cameraController });
                startAnimation(); // Start animation loop
                stopAnimation();  // Stop animation loop
                console.log(`Avatar loaded sucessfully`);
            });
            avatarButtonsContainer.appendChild(button);
        });
    }

    // **Page Switching Function**
    // Helper function to switch between menu pages
    function showPage(page) {
        mainPage.classList.remove('active');
        settingsPage.classList.remove('active');
        avatarPage.classList.remove('active');
        page.classList.add('active'); // Activate the selected page
    }

    // Start Screen Buttons
    const connectIIBtn = document.getElementById('connect-ii-btn');
    const continueGuestBtn = document.getElementById('continue-guest-btn');
    connectIIBtn.addEventListener('click', () => {
        console.log('Connecting to Internet Identity...');
        user.setPrincipal("Test");
        moveToAccountSwitcher(connectIIBtn);
        showMainMenu();
    });
    continueGuestBtn.addEventListener('click', () => {
        console.log('Continuing as guest...');
        moveToAccountSwitcher(connectIIBtn);
        showMainMenu();
    });

    // Function to show main menu and hide start screen
    function showMainMenu() {
        startScreen.style.display = 'none';
        mainMenu.style.display = 'block';
    }

    // Function to move button to account switcher
    function moveToAccountSwitcher(button) {
        const clonedButton = button.cloneNode(true);
        accountSwitcher.innerHTML = '';
        accountSwitcher.appendChild(clonedButton);
    }

    // Edit Environment Button
    const editEnvBtn = document.getElementById('edit-env-btn');
    editEnvBtn.addEventListener('click', async () => {

        updateKhetTable();
        
        document.getElementById("assets-title").innerHTML = "TreeHouse > Assets";
        showTab("assets-tab");
    });

    // Discard Edit and Close
    const discardEditButton = document.getElementById("discard-edit-btn");
    discardEditButton.addEventListener('click', async () => {
        
        // Reset position and scale in input fields
        document.getElementById('pos-x').value = 0;
        document.getElementById('pos-y').value = 0;
        document.getElementById('pos-z').value = 0;
        document.getElementById('scale-x').value = 1;
        document.getElementById('scale-y').value = 1;
        document.getElementById('scale-z').value = 1;

        // Switch to Upload & Close
        changekhetEditorDrawer('close');
        document.getElementById("edit-group").style.display = "none";
        document.getElementById("upload-group").style.display = "block";
    });

    // Save Edit and Close
    const saveEditButton = document.getElementById("save-edit-btn");
    saveEditButton.addEventListener('click', async () => {

        // Retrieve position and scale from input fields
        const posX = parseFloat(document.getElementById('pos-x').value) || 0;
        const posY = parseFloat(document.getElementById('pos-y').value) || 0;
        const posZ = parseFloat(document.getElementById('pos-z').value) || 0;
        const scaleX = parseFloat(document.getElementById('scale-x').value) || 1;
        const scaleY = parseFloat(document.getElementById('scale-y').value) || 1;
        const scaleZ = parseFloat(document.getElementById('scale-z').value) || 1;

        // Save Khet: overwrite
        // khet.js: await saveToCache(khet.khetId, khet);

        // Switch to Upload & Close
        changekhetEditorDrawer('close');
        document.getElementById("edit-group").style.display = "none";
        document.getElementById("upload-group").style.display = "block";
    });

    // Draw Up Button
    const drawUpButton = document.getElementById("draw-up-btn");
    drawUpButton.addEventListener('click', async () => {
        changekhetEditorDrawer('open');
    })

    // Draw Close Button
    const drawCloseButton = document.getElementById("draw-close-btn");
    drawCloseButton.addEventListener('click', async () => {
        changekhetEditorDrawer('close');
    })

    // Main Menu Buttons
    const menuButtons = document.querySelectorAll('#side-bar-buttons button');
    menuButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.id.replace('-btn', '-tab');
            showTab(tabId);
        });
    });

    // Function to show a specific tab
    function showTab(tabId) {
        tabs.forEach(tab => {
            tab.style.display = tab.id === tabId ? 'block' : 'none';
        });
    }

    // Initially, show the start screen
    startScreen.style.display = 'flex';
    mainMenu.style.display = 'none';
});