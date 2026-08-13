import { initAuth, getIdentity, login, user, updateAccountSwitcher } from '../user.js';
import { updateFriendsList, handleInvitation } from '../friends.js';
import { getUserNodeActor } from '../nodeManager.js';
import { online } from '../peermesh.js';
import { showTab } from './tabs.js';

const startScreen = document.getElementById('start-screen');
const mainMenu = document.getElementById('main-menu');
const connectIIBtn = document.getElementById('connect-ii-btn');
const continueGuestBtn = document.getElementById('continue-guest-btn');

/** Show main menu after a successful login / username setup. */
export function showLoggedInUI() {
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('main-menu').style.display = 'block';
    updateAccountSwitcher(false);
    showTab('otherland-tab');
    updateFriendsList();
    online.openPeer();
}

function initUsernameSetup() {
    const usernameScreen = document.getElementById('username-screen');
    const username = document.getElementById('username-input');
    const cancelBtn = document.getElementById('cancel-username-btn');
    const saveBtn = document.getElementById('save-username-btn');
    const errorEl = document.getElementById('username-error');

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const newUsername = username.value.trim();

            if (!newUsername || newUsername.length < 3) {
                errorEl.textContent = 'Username must be at least 3 characters';
                errorEl.style.display = 'block';
                return;
            }

            try {
                const actor = await getUserNodeActor();
                if (actor) {
                    await actor.setUsername(newUsername);
                }

                localStorage.setItem('username', newUsername);
                user.setUserName(newUsername);

                console.log('Username set successfully:', newUsername);

                usernameScreen.style.display = 'none';
                showLoggedInUI();

                await updateFriendsList();
                handleInvitation();
            } catch (err) {
                console.error('Failed to save username:', err);
                errorEl.textContent = 'Failed to save username. Please try again.';
                errorEl.style.display = 'block';
            }
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', async () => {
            const { abortUsernameSetup } = await import('../user.js');
            await abortUsernameSetup();
        });
    }
}

/** Auth start screen, II/guest continue, username setup, and session restore. */
export async function initAuthScreens() {
    initUsernameSetup();

    await initAuth();
    const identity = getIdentity();

    if (!identity.getPrincipal().isAnonymous()) {
        user.setUserPrincipal(identity.getPrincipal().toText());

        const savedUsername = localStorage.getItem('username');
        if (savedUsername) {
            user.setUserName(savedUsername);
            showLoggedInUI();
        } else {
            console.log('II auth detected on refresh but no username - aborting to force username setup');
            const { abortUsernameSetup } = await import('../user.js');
            await abortUsernameSetup();
        }
    }

    if (connectIIBtn) {
        connectIIBtn.addEventListener('click', async () => {
            await login();
        });
    }

    if (continueGuestBtn) {
        continueGuestBtn.addEventListener('click', () => {
            startScreen.style.display = 'none';
            mainMenu.style.display = 'block';
            updateAccountSwitcher(true);
            showTab('otherland-tab');
        });
    }
}
