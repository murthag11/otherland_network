import { viewerState } from '../index.js';
import { animator } from '../animation.js';
import { avatarState, populateAvatarButtons } from '../avatar.js';
import { isTouchDevice } from '../movement.js';
import { keys } from '../input/keys.js';

export let userIsInWorld = false;

/** Enter 3D world HUD / mobile controls after pointer lock (or touch). */
export function enterViewer() {
    userIsInWorld = true;
    document.getElementById('guiLayer').style.display = 'block';
    if (isTouchDevice) {
        document.getElementById('mobile-controls').style.display = 'block';
    }

    if (isTouchDevice && avatarState.selectedAvatarId !== null) {
        document.getElementById('jump-btn').style.display = 'block';
        document.getElementById('sprint-btn').style.display = 'block';
        document.getElementById('interact-btn').style.display = 'block';
    } else {
        document.getElementById('jump-btn').style.display = 'none';
        document.getElementById('sprint-btn').style.display = 'none';
        document.getElementById('interact-btn').style.display = 'none';
    }
    animator.start();
}

/** Leave 3D world and show the in-game pause menu. */
export function leaveViewer() {
    const gameMenu = document.getElementById('game-menu');
    gameMenu.style.display = 'flex';
    keys.clear();
    const closeBtn = document.getElementById('close-btn');
    closeBtn.disabled = true;
    document.getElementById('guiLayer').style.display = 'none';
    if (isTouchDevice) {
        document.getElementById('mobile-controls').style.display = 'none';
    }
    setTimeout(() => {
        closeBtn.disabled = false;
    }, 1250);
}

/** Escape key: show game menu / unlock pointer when not on main menu. */
export function escButtonPress() {
    const mainMenu = document.getElementById('main-menu');
    const gameMenu = document.getElementById('game-menu');
    const isMainMenuVisible = mainMenu.style.display === 'flex';
    const isGameMenuVisible = gameMenu.style.display === 'flex';

    if (!isMainMenuVisible) {
        if (!isGameMenuVisible) {
            gameMenu.style.display = 'flex';
            if (!isTouchDevice) {
                viewerState.controls.unlock();
            } else {
                leaveViewer();
            }
            keys.clear();
        }
    }
}

function showPage(page, pages) {
    pages.forEach(p => p.classList.remove('active'));
    page.classList.add('active');
}

/** Pointer-lock, home/resume/settings/avatar pages, and HUD toggles. */
export function initGameMenu() {
    document.addEventListener('pointerlockchange', () => {
        if (!document.pointerLockElement) {
            leaveViewer();
        } else {
            enterViewer();
        }
    });

    const mainPage = document.getElementById('main-page');
    const avatarPage = document.getElementById('avatar-page');
    const settingsPage = document.getElementById('settings-page');
    const pages = [mainPage, settingsPage, avatarPage].filter(Boolean);

    const homeBtn = document.getElementById('home-btn');
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            document.getElementById('game-menu').style.display = 'none';
            document.getElementById('main-menu').style.display = 'flex';

            userIsInWorld = false;
            animator.stop();

            if (!isTouchDevice) {
                viewerState.controls.unlock();
            }
            keys.clear();
        });
    }

    const avatarBtn = document.getElementById('avatar-btn');
    if (avatarBtn) {
        avatarBtn.addEventListener('click', () => {
            populateAvatarButtons();
            showPage(avatarPage, pages);
        });
    }

    const backAvatarBtn = document.getElementById('back-avatar-btn');
    if (backAvatarBtn) {
        backAvatarBtn.addEventListener('click', () => showPage(mainPage, pages));
    }

    const settingsBtn = document.getElementById('game-settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => showPage(settingsPage, pages));
    }

    const backSettingsBtn = document.getElementById('back-settings-btn');
    if (backSettingsBtn) {
        backSettingsBtn.addEventListener('click', () => showPage(mainPage, pages));
    }

    const closeBtn = document.getElementById('close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            const gameMenu = document.getElementById('game-menu');
            gameMenu.style.display = 'none';
            if (!isTouchDevice) {
                viewerState.controls.lock();
            } else {
                enterViewer();
            }
            viewerState.canvas.focus();
        });
    }

    const chatArea = document.getElementById('chat');
    const friendsList = document.getElementById('friends-list-hud');
    const mapArea = document.getElementById('map');
    const toggleChat = document.getElementById('toggle-chat');
    const toggleFriends = document.getElementById('toggle-friends');
    const toggleMap = document.getElementById('toggle-map');

    if (toggleChat && chatArea) {
        toggleChat.addEventListener('change', () => {
            chatArea.style.display = toggleChat.checked ? 'block' : 'none';
        });
    }

    if (toggleFriends && friendsList) {
        toggleFriends.addEventListener('change', () => {
            friendsList.style.display = toggleFriends.checked ? 'block' : 'none';
        });
    }

    if (toggleMap && mapArea) {
        toggleMap.addEventListener('change', () => {
            mapArea.style.display = toggleMap.checked ? 'block' : 'none';
        });
    }
}
