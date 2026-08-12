import { AuthClient } from "@icp-sdk/auth/client";
import { AnonymousIdentity } from "@icp-sdk/core/agent";
import { getUserNodeActor, invalidateActors } from './nodeManager.js';
import { CANISTER_IDS } from './canisterIds.js';
import { updateFriendsList, handleInvitation } from './friends.js';
import { showLoggedInUI } from './menu.js';

// Authentication client instance and identity
let authClient;
let identity;

// Promise to track authentication readiness
export let authReady = null;

// Existing user object
export const user = {
    userPrincipal: "",
    userName: "",

    setUserPrincipal(newPrincipal) {
        this.userPrincipal = newPrincipal;
    },
    getUserPrincipal() {
        return this.userPrincipal;
    },

    setUserName(newName) {
        this.userName = newName;
    },
    getUserName() {
        return this.userName;
    }
};

// Initialize the authentication client
export async function initAuth() {
    try {
        authClient = await AuthClient.create();
        if (await authClient.isAuthenticated()) {
            identity = await authClient.getIdentity();
            user.setUserPrincipal(identity.getPrincipal().toText());
        } else {
            identity = new AnonymousIdentity();
            user.setUserPrincipal(""); // No principal for anonymous users
        }
    } catch (error) {
        console.error("Error initializing auth client:", error);
        identity = new AnonymousIdentity();
        user.setUserPrincipal("");
    }
    return identity;
}

// Start authentication immediately and store the promise
authReady = initAuth();

// Get the current identity
export function getIdentity() {
    if (!identity) {
        console.warn("Identity accessed before initAuth completed");
    }
    return identity;
}

// Trigger Internet Identity login
export async function login() {
    try {
        const isLocal = (process.env.DFX_NETWORK === 'local' || !process.env.DFX_NETWORK);
        const iiProvider = isLocal
            ? `http://${CANISTER_IDS.INTERNET_IDENTITY}.localhost:4943`
            : 'https://identity.ic0.app';

        await authClient.login({
            identityProvider: iiProvider,
            onSuccess: async () => {
                identity = await authClient.getIdentity();
                user.setUserPrincipal(identity.getPrincipal().toText());
                invalidateActors();
                console.log("Logged in with principal:", user.getUserPrincipal());

                try {
                    const { getAccessibleCanisters, nodeSettings } = await import('./nodeManager.js');
                    await getAccessibleCanisters();                    // populates userOwnedNodes
                    if (nodeSettings.userOwnedNodes?.length > 0) {
                        nodeSettings.nodeId = nodeSettings.userOwnedNodes[0];
                        nodeSettings.nodeType = 0;
                        nodeSettings.displayNodeConfig?.();
                        console.log("Node initialized after II login");
                    }
                } catch (e) {
                    console.warn("Could not auto-select node after login", e);
                }

                const usernameReady = await setupUsername();

                if (usernameReady) {
                    handleInvitation();
                    showLoggedInUI();
                }
                // else: username screen is shown - it will handle continuation after save
            },
            onError: (error) => {
                console.error("Login failed:", error);
            }
        });
    } catch (error) {
        console.error("Error during login:", error);
    }
}

// Logout and revert to anonymous identity
export async function logout() {
    try {
        await authClient.logout();
        identity = new AnonymousIdentity();
        user.setUserPrincipal("");
        invalidateActors();
        console.log("Logged out, reverted to anonymous identity");
    } catch (error) {
        console.error("Error during logout:", error);
    }
}

// Setup username
async function setupUsername() {
    try {
        const actor = await getUserNodeActor();  // may return null for users without a node yet

        let hasUsername = false;
        let currentUsername = null;

        if (actor) {
            try {
                const result = await actor.getUsername();
                currentUsername = result && result[0] ? result[0] : null;
                hasUsername = !!currentUsername;
            } catch (e) {
                console.warn('Could not read username from actor):', e);
            }
        }

        if (hasUsername) {
            // Username already set → store and continue normally
            localStorage.setItem('username', currentUsername);
            user.setUserName(currentUsername);
            console.log('Username loaded:', currentUsername);
            return true;  // username ready
        } else {
            // No username yet → show the dedicated screen
            console.log('No username found - showing username setup screen');
            document.getElementById('start-screen').style.display = 'none';
            document.getElementById('username-screen').style.display = 'flex';  // use flex for centering
            return false; // username screen shown
        }
    } catch (error) {
        console.error('Error during username setup:', error);
        return false;
    }
}

// Force logout and clear session - used when user aborts username setup
export async function abortUsernameSetup() {
    try {
        if (authClient) {
            await authClient.logout();
        }
        identity = new AnonymousIdentity();
        user.setUserPrincipal("");
        user.setUserName("");
        localStorage.removeItem('username');
        invalidateActors();
        console.log("Username setup aborted - session cleared, returning to start screen");

        // Force UI back to start screen
        document.getElementById('username-screen').style.display = 'none';
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('start-screen').style.display = 'flex';
    } catch (error) {
        console.error("Error during abort:", error);
    }
}

// Unified account switcher - handles Guest and II-logged-in states with action buttons
export function updateAccountSwitcher(isGuest = false) {
    document.getElementById("info-box").style.display = 'block';
    const accountSwitcher = document.getElementById('account-switcher');
    accountSwitcher.innerHTML = '';

    const container = document.createElement('div');
    container.style.textAlign = 'center';

    if (isGuest) {
        const status = document.createElement('button');
        status.textContent = 'Guest';
        status.style.cursor = 'default';
        container.appendChild(status);

        const loginBtn = document.createElement('button');
        loginBtn.textContent = 'Login with\nInternet Identity';
        loginBtn.style.marginTop = '8px';
        loginBtn.addEventListener('click', async () => {
            const { login } = await import('./user.js');
            await login();   // triggers full II flow (will show username screen if needed)
        });
        container.appendChild(loginBtn);
    } else {
        // II Logged-in user
        const username = user.getUserName() && user.getUserName().trim() !== ''
            ? user.getUserName().trim()
            : 'Anonymous';

        const status = document.createElement('button');
        const nameEl = document.createElement('strong');
        nameEl.textContent = username;
        status.appendChild(nameEl);
        status.style.cursor = 'default';
        container.appendChild(status);

        const logoutBtn = document.createElement('button');
        logoutBtn.textContent = 'Logout';
        logoutBtn.style.marginTop = '8px';
        logoutBtn.addEventListener('click', async () => {
            const { logout } = await import('./user.js');
            await logout();
            // Return to clean start screen
            document.getElementById('main-menu').style.display = 'none';
            document.getElementById('info-box').style.display = 'none';
            document.getElementById('start-screen').style.display = 'flex';
        });
        container.appendChild(logoutBtn);
    }

    accountSwitcher.appendChild(container);
}

// Function to update and display the user profile
export function updateProfileDisplay() {
    const usernameDisplay = document.getElementById('username-display');
    const principalDisplay = document.getElementById('principal-display');

    usernameDisplay.textContent = user.getUserName() || 'Not set';
    principalDisplay.textContent = user.getUserPrincipal() || 'Not logged in';
}