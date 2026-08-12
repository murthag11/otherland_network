import { viewerState, sceneObjects, worldController, animationMixers, khetState } from '../index.js';
import { nodeSettings, requestNewCanister, refreshNodeList, getAccessibleCanisters } from '../nodeManager.js';
import { online } from '../peermesh.js';
import { animator } from '../animation.js';
import { isTouchDevice } from '../movement.js';
import { CANISTER_IDS } from '../canisterIds.js';
import { enterViewer } from './gameMenu.js';

/** Load the current node scene and enter the 3D viewer. */
export async function enterWorld() {
    animator.stop();

    const params = { scene: viewerState.scene, world: viewerState.world, sceneObjects, animationMixers, khetState };
    await worldController.loadScene(params, nodeSettings);

    document.getElementById('main-menu').style.display = 'none';
    if (!isTouchDevice) {
        viewerState.controls.lock();
    } else {
        enterViewer();
    }
    viewerState.canvas.focus();
}

function buildShareTreehouseUrl() {
    const origin = window.location.protocol + '//' + window.location.host;
    const params = new URLSearchParams(window.location.search);
    const canisterId = CANISTER_IDS.OTHERLAND_CLIENT || params.get('canisterId');
    const shareParams = new URLSearchParams();
    if (canisterId) {
        shareParams.set('canisterId', canisterId);
    }
    if (online.ownID) {
        shareParams.set('peerId', online.ownID);
    }
    const query = shareParams.toString();
    return query ? `${origin}?${query}` : origin;
}

/** Enter/share/toggle P2P, quick-connect, node list, and friends treehouse controls. */
export function initTreehouseControls() {
    const refreshNodeListBtn = document.getElementById('refresh-node-list-btn');
    if (refreshNodeListBtn) {
        refreshNodeListBtn.addEventListener('click', async () => {
            refreshNodeList();
        });
    }

    const enterNodeBtn = document.getElementById('enter-node-btn');
    if (enterNodeBtn) {
        enterNodeBtn.addEventListener('click', async () => {
            if (nodeSettings.nodeType == 2 || nodeSettings.nodeType == 3) {
                enterWorld();
            }
        });
    }

    const requestCanisterBtn = document.getElementById('request-new-canister');
    if (requestCanisterBtn) {
        requestCanisterBtn.addEventListener('click', async () => {
            await requestNewCanister();
            nodeSettings.availableNodes = await getAccessibleCanisters();
            await refreshNodeList();
        });
    }

    const enterTreehouseBtn = document.getElementById('enter-treehouse-btn');
    if (enterTreehouseBtn) {
        enterTreehouseBtn.addEventListener('click', async () => {
            if (nodeSettings.nodeType !== 0) {
                await nodeSettings.changeNode({ type: 0, id: 'TreeHouse' });
            }
            enterWorld();
        });
    }

    const joinQuickConnectBtn = document.getElementById('join-quick-connect');
    if (joinQuickConnectBtn) {
        joinQuickConnectBtn.addEventListener('click', async () => {
            await nodeSettings.changeNode({ type: 1, id: 'TreeHouse' });
            online.openPeer();
        });
    }

    const enterFriendsTreehouseBtn = document.getElementById('enter-friends-treehouse');
    if (enterFriendsTreehouseBtn) {
        enterFriendsTreehouseBtn.addEventListener('click', async () => {
            enterWorld();
        });
    }

    const resetPeerBtn = document.getElementById('reset-p2p-btn');
    if (resetPeerBtn) {
        resetPeerBtn.addEventListener('click', async () => {
            nodeSettings.togglePeerNetworkAllowed();
        });
    }

    const togglePeerButton = document.getElementById('toggle-p2p-btn');
    if (togglePeerButton) {
        togglePeerButton.addEventListener('click', async () => {
            nodeSettings.togglePeerNetworkAllowed();
        });
    }

    const shareThButton = document.getElementById('share-th-link-btn');
    if (shareThButton) {
        shareThButton.addEventListener('click', async () => {
            navigator.share({
                title: 'Otherland Invite',
                text: 'Come visit my TreeHouse!\u000d\u000d',
                url: buildShareTreehouseUrl(),
            });
        });
    }
}
