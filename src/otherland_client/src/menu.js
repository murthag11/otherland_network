// Import necessary components
import { canvas, viewerState, sceneObjects, worldController, loadAvatarObject, animationMixers, khetState, loadScene, stopAnimation, startAnimation } from './index.js';
import { khetController, clearAllKhets } from './khet.js';
import { nodeSettings, requestNewCanister, getAccessibleCanisters, getCardinalActor } from './nodeManager.js';
import { initAuth, getIdentity, login, user } from './user.js';
import { online } from './peermesh.js'
import { avatarState } from './avatar.js'
import { isTouchDevice } from './animation.js'

// Declare Variables
const startScreen = document.getElementById('start-screen');
const mainMenu = document.getElementById('main-menu');
const accountSwitcher = document.getElementById('account-switcher');
const connectIIBtn = document.getElementById('connect-ii-btn');
const continueGuestBtn = document.getElementById('continue-guest-btn');
const tabs = document.querySelectorAll('.tab');
export let userIsInWorld = false;

// ### Pointer Lock State Handling
// Listen for changes in the pointer lock state to manage game menu visibility
document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement) {
        leaveViewer();                   // Leave the viewer when pointer lock is released
    } else {
        enterViewer();                   // Enter the viewer when pointer lock is acquired
    }
});

function enterViewer() {
    userIsInWorld = true;
    document.getElementById('guiLayer').style.display = 'block'; // Hide the GUI layer when pointer lock is acquired
    if (isTouchDevice) { document.getElementById('mobile-controls').style.display = 'block'; } // Show the GUI layer when pointer lock is released

    // Hide Jump / Sprint Button depending on Avatar availability
    if (isTouchDevice && avatarState.selectedAvatarId !== null) {
        document.getElementById('jump-btn').style.display = 'block';
        document.getElementById('sprint-btn').style.display = 'block';
        document.getElementById('interact-btn').style.display = 'block';
    } else {
        document.getElementById('jump-btn').style.display = 'none';
        document.getElementById('sprint-btn').style.display = 'none';
        document.getElementById('interact-btn').style.display = 'none';
    }
    startAnimation();                // Start animation when pointer lock is acquired
}
function leaveViewer() {
    const gameMenu = document.getElementById('game-menu');
    gameMenu.style.display = 'flex'; // Show the game menu when pointer lock is released
    keys.clear();                    // Clear any active key presses
    const closeBtn = document.getElementById('close-btn');
    closeBtn.disabled = true;        // Disable the close button temporarily
    document.getElementById('guiLayer').style.display = 'none'; // Show the GUI layer when pointer lock is released
    if (isTouchDevice) { document.getElementById('mobile-controls').style.display = 'none'; } // Show the GUI layer when pointer lock is released
    setTimeout(() => {
        closeBtn.disabled = false;   // Re-enable the close button after 1.25 seconds
    }, 1250);
}

// ### Key Input Handling
// Set to track currently pressed keys
export const keys = new Set();

// Handle key presses, including the Escape key to show the game menu
document.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    keys.add(key); // Add pressed key to the set

    console.log(`Key Press detected, Key >${key}<`);

    // Handle ESC key seperatly
    if (key === 'escape') {
        escButtonPress();
    }
});

// Handle ESC Button press
export function escButtonPress() {
    const mainMenu = document.getElementById('main-menu');
    const gameMenu = document.getElementById('game-menu');
    const isMainMenuVisible = mainMenu.style.display === 'flex';
    const isGameMenuVisible = gameMenu.style.display === 'flex';

    if (!isMainMenuVisible) {
        if (!isGameMenuVisible) {
            gameMenu.style.display = 'flex'; // Show the game menu if it's not visible
            if (!isTouchDevice) {
                viewerState.controls.unlock();           // Unlock the pointer controls
            } else {   
                leaveViewer();               // Leave the viewer when pointer lock is released
            }
            keys.clear();                // Clear active keys
        }
    }
}

// Handle key releases to remove keys from the set
document.addEventListener('keyup', event => {
    keys.delete(event.key.toLowerCase());
});

// Deactivate Context Menu
document.addEventListener('contextmenu', function(e){
    e.preventDefault();
}, false);



// Function to enter the 3d World
async function enterWorld() {
    // Define the parameters for loadScene and loadAvatarObject
    const params = { sceneObjects, animationMixers, khetState };

    // Load Scene with params and nodeSettings
    await loadScene(params, nodeSettings);

    // Load Avatar with params
    await loadAvatarObject(params);

    document.getElementById('main-menu').style.display = 'none';
    const isTouchDevice = 'ontouchstart' in window;
    if (!isTouchDevice) {
        viewerState.controls.lock();      // Lock the pointer for game control
    } else {   
        enterViewer();        // Enter the viewer when pointer lock is acquired
    }
    canvas.focus();           // Focus on the canvas for input
}

// Update Khet Table
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
    if (khets.length > 0) {
        document.getElementById("khet-table").style.display = "block";
        document.getElementById("clear-khets-btn").style.display = "block";
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
            editKhetButton.textContent = "Edit";
            editKhetButton.addEventListener('click', async () => {

                // Switch to Edit Display
                changekhetEditorDrawer('open');
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
            
            // Delete column
            const tdDelete = document.createElement('td');
            const deleteKhetButton = document.createElement('button');
            deleteKhetButton.textContent = "Delete";
            deleteKhetButton.addEventListener('click', async () => {

                // Delete Khet from Khetcontroller, keep asset in cache
                await khetController.removeEntry(khet.khetId);
                console.log('Khet deleted'); // Log confirmation
                await updateKhetTable();
            });
            tdDelete.appendChild(deleteKhetButton);
            tr.appendChild(tdDelete);
            
            // Append the row to the table
            table.appendChild(tr);
        }
    } else {
        document.getElementById("khet-table").style.display = "none";
        document.getElementById("clear-khets-btn").style.display = "none";
    }
    return;
}

// Update Node List
export async function updateNodeList() {

    // Select the table
    const table = document.querySelector('#node-table');
            
    // Clear existing data rows (keep the header row)
    const rows = table.querySelectorAll('tr');
    for (let i = 1; i < rows.length; i++) {
        rows[i].remove();
    }

    // Get the user's principal
    const userPrincipal = user.getUserPrincipal();

    // Populate the table with Node data
    const nodes = nodeSettings.availableNodes;
    if (nodes.length > 0) {
        document.getElementById("node-table").style.display = "block";
        for (const node of nodes) {
            const tr = document.createElement('tr');

            // Highlight the row if the owner is the current user
            if (node.owner === userPrincipal) {
                tr.style.color = "#00d4ff";
            }
            
            // NodeID column
            const tdId = document.createElement('td');
            tdId.textContent = node.canisterId;
            tr.appendChild(tdId);
            
            // Owner column
            const tdOwner = document.createElement('td');
            tdOwner.textContent = node.owner;
            tr.appendChild(tdOwner);
            
            // Connect column
            const tdConnect = document.createElement('td');
            const connectNodeBtn = document.createElement('button');
            connectNodeBtn.textContent = "Connect";
            connectNodeBtn.addEventListener('click', async () => {

                // Switch Node Type
                document.getElementById("enter-node-btn").style.display = "block";
                if (node.owner === userPrincipal) {
                
                    await nodeSettings.changeNode({type: 2, id: node.canisterId})
                    document.getElementById("edit-node-btn").style.display = "block";
                    document.getElementById("node-settings-btn").style.display = "block";
                } else {
                    await nodeSettings.changeNode({type: 3, id: node.canisterId})
                }
            });
            tdConnect.appendChild(connectNodeBtn);
            tr.appendChild(tdConnect);
            
            // Append the row to the table
            table.appendChild(tr);
        }
    } else {
        document.getElementById("node-table").style.display = "none";
    }
    return;
}

// Open / Close KhetEditor
function changekhetEditorDrawer(goal) {
    if (goal == "open") {
        document.getElementById("khet-editor").style.bottom = "240px";
        document.getElementById("draw-up-btn").style.display = "none";
        document.getElementById("draw-close-btn").style.display = "block";
    } else if (goal == "close") {
        document.getElementById("khet-editor").style.bottom = "-20px";
        document.getElementById("draw-up-btn").style.display = "block";
        document.getElementById("draw-close-btn").style.display = "none";
    }
    return;
}

// ### Menu Navigation and UI Toggling
// Wait for the DOM to load before setting up event listeners
document.addEventListener('DOMContentLoaded', async () => {

    viewerState.init();

    // **Page Switching Function**
    // Helper function to switch between menu pages
    function showPage(page) {
        mainPage.classList.remove('active');
        settingsPage.classList.remove('active');
        avatarPage.classList.remove('active');
        page.classList.add('active'); // Activate the selected page
    }
    
    // Function to move button to account switcher
    function moveToAccountSwitcher(button) {
        document.getElementById("info-box").style.display = 'block';
        const clonedButton = button.cloneNode(true);
        accountSwitcher.innerHTML = '';
        accountSwitcher.appendChild(clonedButton);
    }

    // **Main Menu**
    const mainPage = document.getElementById('main-page');

    // **Otherland Tab**
    // Connect to Cardinal
    const cardinalConnectBtn = document.getElementById("cardinal-connect-btn");
    cardinalConnectBtn.addEventListener('click', async () => {
        
        // Get Node List
        nodeSettings.availableNodes = await getAccessibleCanisters()
        
        console.log(nodeSettings.availableNodes);
        updateNodeList();
        document.getElementById("node-list").style.display = "block";
        cardinalConnectBtn.innerHTML = "Refresh Node List";
    });

    // Enter Node World
    const enterNodeBtn = document.getElementById("enter-node-btn");
    enterNodeBtn.addEventListener('click', async () => {

        if (nodeSettings.nodeType == 2 || nodeSettings.nodeType == 3) {
            enterWorld();
        }
    });

    // Create new user node
    const requestCanisterBtn = document.getElementById("request-new-canister");
    requestCanisterBtn.addEventListener('click', async () => {
        const userNodeId = await requestNewCanister();
        nodeSettings.userOwnedNodes.push(userNodeId);
        nodeSettings.availableNodes.push(userNodeId);
        updateNodeList();
    });

    // Edit Node Button
    const editNodeBtn = document.getElementById('edit-node-btn');
    editNodeBtn.addEventListener('click', async () => {

        if (nodeSettings.nodeType == 2) {
            await updateKhetTable();

            document.getElementById("upload-btn").disabled = false;
            document.getElementById("cache-btn").disabled = true;
            document.getElementById("assets-title").innerHTML = "My Node > Assets";
            showTab("assets-tab")
        };
    });

    // **TreeHouse Tab**
    // Enter TreeHouse
    const enterTreehouseBtn = document.getElementById('enter-treehouse-btn');
    enterTreehouseBtn.addEventListener('click', async () => {

        // Switch Node Type
        if (nodeSettings.nodeType == 0 || nodeSettings.nodeType == 1) {
            enterWorld();
        }
    });

    // Join QuickConnect Button
    const joinQuickConnectBtn = document.getElementById("join-quick-connect");
    joinQuickConnectBtn.addEventListener('click', async () => {
        
        // Switch Node Type
        await nodeSettings.changeNode({type: 1, id: "TreeHouse"})

        // Connect to Host
        online.openPeer();                                       // Evtl if not already exists from other source check
    })

    // Reset Peer Button
    const resetPeerBtn = document.getElementById("reset-p2p-btn");
    resetPeerBtn.addEventListener('click', async () => {
        nodeSettings.togglePeerNetworkAllowed();
    })

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
            url: (thisurl + '?canisterId=be2us-64aaa-aaaaa-qaabq-cai&peerId=' + online.ownID),
        });
    });

    // **Clear Khets Button**
    // Clear all Khets from the backend and storage canisters
    const clearBtn = document.getElementById('clear-khets-btn');
    clearBtn.addEventListener('click', async () => {
        
        if (nodeSettings.nodeType == 0) {
            await khetController.clearKhet();   // Call the function to clear Khets on treehouse
            console.log('Khets cleared from treehouse'); // Log confirmation
        } else if (nodeSettings.nodeType == 2) {
            await clearAllKhets();              // Call the function to clear Khets on backend
            console.log('Khets cleared from node'); // Log confirmation
        }
        await updateKhetTable();
    });

    // Edit TreeHouse Button
    const editTreeHouseBtn = document.getElementById('edit-treehouse-btn');
    editTreeHouseBtn.addEventListener('click', async () => {

        // Switch Node Type
        if (nodeSettings.nodeType !== 0) {
            await nodeSettings.changeNode({type: 0, id: "TreeHouse"})
        }
        
        if (nodeSettings.nodeType == 0) {
            await updateKhetTable();

            document.getElementById("upload-btn").disabled = true;
            document.getElementById("cache-btn").disabled = false;
            document.getElementById("assets-title").innerHTML = "My TreeHouse > Assets";
            showTab("assets-tab")
        };
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

        await updateKhetTable();
    });

    // Save Edit and Close
    const saveEditButton = document.getElementById("save-edit-btn");
    saveEditButton.addEventListener('click', async () => {
        if (!currentEditingKhetId) {
            console.error('No Khet selected for editing');
            return;
        }
        const khet = khetController.getKhet(currentEditingKhetId);
        if (!khet) {
            console.error(`Khet ${currentEditingKhetId} not found`);
            return;
        }
    
        // Update position and scale from input fields
        khet.position = [
            parseFloat(document.getElementById('pos-x').value) || 0,
            parseFloat(document.getElementById('pos-y').value) || 0,
            parseFloat(document.getElementById('pos-z').value) || 0
        ];
        khet.scale = [
            parseFloat(document.getElementById('scale-x').value) || 1,
            parseFloat(document.getElementById('scale-y').value) || 1,
            parseFloat(document.getElementById('scale-z').value) || 1
        ];
    
        // Handle based on nodeType
        if (nodeSettings.nodeType == 0) {
            // Update metadata in nodeSettings.localKhets
            const khetMetadata = { ...khet };
            delete khetMetadata.gltfData; // Exclude gltfData
            nodeSettings.localKhets[khet.khetId] = khetMetadata;
            nodeSettings.saveLocalKhets();
    
            // Update full Khet in cache
            await saveToCache(khet.khetId, khet);
        } else if (nodeSettings.nodeType == 2) {
            // Existing logic for Own Node (unchanged)
        }
    
        // Update khetController.khets
        khetController.khets[khet.khetId] = khet;
    
        changekhetEditorDrawer('close');
        document.getElementById("edit-group").style.display = "none";
        document.getElementById("upload-group").style.display = "block";
        await updateKhetTable();
        currentEditingKhetId = null;
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

    // **Home Button**
    // Return to the start overlay and unlock controls
    const homeBtn = document.getElementById('home-btn');
    homeBtn.addEventListener('click', () => {
        document.getElementById('game-menu').style.display = 'none';           // Hide the game menu
        document.getElementById('main-menu').style.display = 'flex';  // Show the start overlay
        
        userIsInWorld = false;
        stopAnimation();

        if (!isTouchDevice) {
            viewerState.controls.unlock();           // Unlock the pointer controls
        } else {   
            // leaveViewer();               // Leave the viewer when pointer lock is released
        }
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
        const isTouchDevice = 'ontouchstart' in window;
        if (!isTouchDevice) {
            viewerState.controls.lock();      // Lock the pointer for game control
        } else {   
            enterViewer();        // Enter the viewer when pointer lock is acquired
        }
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
                await worldController.setAvatar(avatar.khetId, { sceneObjects, animationMixers, khetState });
                //startAnimation(); // Start animation loop
                //stopAnimation();  // Stop animation loop
                console.log(`Avatar loaded sucessfully`);
            });
            avatarButtonsContainer.appendChild(button);
        });
    }

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

    // Initialize authentication and get identity
    await initAuth();
    const identity = getIdentity();

    // Check if the user is authenticated
    if (identity.getPrincipal().isAnonymous()) {
        // User is not logged in
        startScreen.style.display = 'flex';
        mainMenu.style.display = 'none';
        connectIIBtn.textContent = "Connect to Internet Identity";

        cardinalConnectBtn.disabled = true;
        requestCanisterBtn.disabled = true;
        //uploadBtn.disabled = true;
        //clearBtn.disabled = true;
    } else {
        // User is logged in
        user.setUserPrincipal(identity.getPrincipal().toText());
        connectIIBtn.textContent = `Logged in as ${user.getUserPrincipal().slice(0, 5)}...`;
        moveToAccountSwitcher(connectIIBtn); // Move button to account switcher
        
        console.log("Moving the main Menu");
        document.getElementById('start-screen').style.display = 'none';
        document.getElementById('main-menu').style.display = 'block';
    }

    // Event listener for login button
    connectIIBtn.addEventListener('click', async () => {
        await login(); // Triggers authentication flow
    });

    // Event listener for guest button
    continueGuestBtn.addEventListener('click', () => {
        moveToAccountSwitcher(continueGuestBtn);
        
        startScreen.style.display = 'none';
        mainMenu.style.display = 'block';
    });

    // Upload WASM module
    const wasmFileInput = document.getElementById('wasm-file-input');
    wasmFileInput.addEventListener('change', async () => {
        const file = wasmFileInput.files[0];
        if (!file) return;
        if (document.getElementById("wasm-pw").value != "Grail2025") return;

        const reader = new FileReader();
        reader.onload = async () => {
            const wasmArrayBuffer = reader.result;
            const wasmBlob = new Uint8Array(wasmArrayBuffer);

            try {
                const actor = await getCardinalActor(); // Your actor initialization
                await actor.uploadWasmModule(wasmBlob);
                console.log('WASM module uploaded successfully');
            } catch (error) {
                console.error('Error uploading WASM module:', error);
            }
        };
        reader.readAsArrayBuffer(file);
    });
});