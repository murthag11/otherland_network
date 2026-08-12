import { refreshNodeList } from '../nodeManager.js';
import { updateFriendsList } from '../friends.js';
import { updateProfileDisplay } from '../user.js';
import { loadLibraryObjects } from '../library.js';

const tabs = document.querySelectorAll('.tab');

/** Show a main-menu tab and refresh tab-specific data. */
export function showTab(tabId) {
    tabs.forEach(tab => {
        tab.style.display = tab.id === tabId ? 'block' : 'none';
    });
    switch (tabId) {
        case 'otherland-tab':
            refreshNodeList();
            updateFriendsList();
            break;
        case 'profile-tab':
            updateProfileDisplay();
            updateFriendsList();
            break;
        case 'library-tab':
            loadLibraryObjects();
            break;
    }
}

/** Wire sidebar buttons to tab switching. */
export function initTabs() {
    const menuButtons = document.querySelectorAll('#side-bar-buttons button');
    menuButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.id.replace('-btn', '-tab');
            showTab(tabId);
        });
    });
}
