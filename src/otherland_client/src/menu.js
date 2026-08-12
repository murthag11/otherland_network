/**
 * Menu composition root — wires UI modules and re-exports public symbols
 * consumed by movement.js, peermesh.js, and user.js.
 */
import { viewerState } from './index.js';
import { initChat } from './chat.js';
import { vrManager } from './vrui.js';

import { initKeys, keys } from './input/keys.js';
import { initTabs } from './ui/tabs.js';
import { initAuthScreens, showLoggedInUI } from './ui/authScreens.js';
import { initProfile } from './ui/profile.js';
import { initTreehouseControls } from './ui/treehouseControls.js';
import { initNodeAssets } from './ui/nodeAssets.js';
import { initGameMenu, escButtonPress, userIsInWorld, enterViewer, leaveViewer } from './ui/gameMenu.js';
import { initVrSession } from './ui/vrSession.js';
import { initLibraryUpload } from './ui/libraryUpload.js';
import { initAdminWasm } from './ui/adminWasm.js';

export { keys };
export { escButtonPress, userIsInWorld, enterViewer, leaveViewer };
export { showLoggedInUI };

// Immediate UI wiring (DOM nodes already present via index.html)
initTabs();
initKeys({
    onEscape: escButtonPress,
    onDebugVr: () => vrManager.debugControllerState(),
});
initProfile();
initGameMenu();

document.addEventListener('DOMContentLoaded', async () => {
    viewerState.init();

    initTreehouseControls();
    initNodeAssets();
    initVrSession();
    initLibraryUpload();
    initAdminWasm();

    await initAuthScreens();

    initChat();
});
