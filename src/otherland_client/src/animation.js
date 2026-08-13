// Import External Dependencies
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// Import Internal Modules
import { viewerState, sceneObjects, khetState } from './index.js';
import { avatarState } from './avatar.js';
import { nodeSettings } from './nodeManager.js';
import { getUserNodeActor } from './nodeManager.js';
import { online } from './peermesh.js';
import { applyPlayerMovement } from './movement.js';
import { user } from './user.js';

// Sync Variables
let lastPositionUpdate = 0;
const POSITION_UPDATE_INTERVAL = 1000; // 1 second
let lastPlayerQuery = 0;
const PLAYER_QUERY_INTERVAL = 5000; // 5 seconds

const animationMixers = [];
const timer = new THREE.Timer();

// Send position to canister every 1s
async function sendPositionUpdate() {
    if (nodeSettings.nodeType === 2 && (avatarState.avatarMesh || viewerState.playerRig)) { // Adjust conditions as needed
        try {
            const actor = await getUserNodeActor();
            const pos = viewerState.playerRig ? viewerState.playerRig.position : avatarState.avatarMesh.position;
            await actor.updatePosition([pos.x, pos.y, pos.z]);
        } catch (error) {
            console.error("Failed to update position:", error);
        }
    }
}

// Check nearby players every 5s
async function queryPlayerPositions() {
    if (nodeSettings.nodeType === 2) {

        await online.connectToNearbyPeers();
    
        online.handleSignaling();

        const actor = await getUserNodeActor();
        const allPositions = await actor.getAllPlayerPositions(); // Returns [principal, [x, y, z]] pairs
        const selfPrincipal = user.getUserPrincipal();
        allPositions.forEach(([principal, [x, y, z]]) => {
            const principalText = principal.toText();
            // Exclude yourself (compare IC principals, not PeerJS IDs)
            if (principalText !== selfPrincipal) {
                online.latestPositions.set(principalText, { position: { x, y, z }, quaternion: { x: 0, y: 0, z: 0, w: 1 } });
            }
        });
    }
}

// Animation Handler
export const animator = {

    isAnimating: false,
    positionInterval: null,
    queryInterval: null,

    // Start animation Loop
    start() {
        if (!RAPIER) {
            console.error('RAPIER not fully initialized. Delaying animation start.');
            setTimeout(animator.start, 100); // Retry after 100ms
            return;
        }
        if (!this.isAnimating) {
            this.isAnimating = true;

            this.positionInterval = setInterval(() => {
                const currentTime = performance.now();
                if (currentTime - lastPositionUpdate >= POSITION_UPDATE_INTERVAL) {
                    sendPositionUpdate(); // Runs async, doesn’t block
                    lastPositionUpdate = currentTime;
                }
            }, 1000);

            this.queryInterval = setInterval(() => {
                const currentTime = performance.now();
                if (currentTime - lastPlayerQuery >= PLAYER_QUERY_INTERVAL) {
                    queryPlayerPositions();
                    lastPlayerQuery = currentTime;
                }
            }, 5000);

            viewerState.renderer.setAnimationLoop(() => animator.renderFrame());
        }
    },

    // Stop animation Loop
    stop() {
        this.isAnimating = false;
        if (this.positionInterval) {
            clearInterval(this.positionInterval);
            this.positionInterval = null;
        }
        if (this.queryInterval) {
            clearInterval(this.queryInterval);
            this.queryInterval = null;
        }
    },

    // Fallback Animation Loop
    animate() {
        if (!animator.isAnimating) return;
        requestAnimationFrame(animator.animate);
        animator.renderFrame();
    },

    // Main Render Loop
    renderFrame() {

        // Always render even if not animating 
        if (!animator.isAnimating) {
            if (viewerState.renderer) {
                viewerState.renderer.render(viewerState.scene, viewerState.camera);
            }
            return;
        }

        // World step
        timer.update();
        const delta = timer.getDelta();
        viewerState.world.step(viewerState.eventQueue, delta);

        // Execute Khet Code
        khetState.executors.forEach(executor => executor());

        // Handle player input and movement
        applyPlayerMovement(delta);

        // Sync all scene objects with their physics bodies, skipping picked-up objects
        sceneObjects.forEach(obj => {
            if (obj.userData && obj.userData.body && !obj.userData.isAvatar) {
                
                if (obj.userData.isPickedUp) {
                    
                // Calculate the offset in world space based on avatar's position and orientation
                const avatarPos = viewerState.playerRig ? viewerState.playerRig.position : avatarState.avatarMesh.position;
                const offset = new THREE.Vector3(0, 1, 1); // y=1 (above), z=-0.3 (in front)
                offset.applyQuaternion(avatarState.avatarMesh.quaternion); // Align with avatar's rotation
                obj.position.copy(avatarPos).add(offset); // Set position in world space

                // Sync mesh with body
                const pos = obj.userData.body.translation();
                obj.position.set(pos.x, pos.y, pos.z);

                } else {

                    // Posiotion
                    const pos = obj.userData.body.translation();
                    obj.position.set(pos.x, pos.y, pos.z);

                    // Rotation
                    if (obj !== avatarState.avatarMesh) {
                        const rot = obj.userData.body.rotation();
                        obj.quaternion.set(rot.x, rot.y, rot.z, rot.w);
                    }
                }
            }
        });

        // Update individual Object Animations
        animationMixers.forEach(mixer => mixer.update(delta));
        
        // Hide player indicator (red sphere) in VR to fix left-eye only artifact
        const isVRRender = !!(viewerState.renderer && viewerState.renderer.xr && viewerState.renderer.xr.isPresenting);
        if (viewerState.playerIndicator) {
            viewerState.playerIndicator.visible = !isVRRender;
        }

        // Render main scene - use XR camera in VR for correct viewpoint
        const renderCamera = isVRRender ? viewerState.renderer.xr.getCamera() : viewerState.camera;
        viewerState.renderer.render(viewerState.scene, renderCamera);

        // Render mini-map (skip in XR mode to avoid framebuffer conflicts)
        if (!isVRRender) {
            viewerState.miniMapRenderer.render(viewerState.scene, viewerState.miniMapCamera);
        }
    }
}