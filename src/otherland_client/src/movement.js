import * as THREE from 'three';
import nipplejs from 'nipplejs';
import RAPIER from '@dimforge/rapier3d-compat';

import { keys, escButtonPress } from './menu.js';
import { viewerState, sceneObjects } from './index.js';
import { avatarState } from './avatar.js';
import { triggerInteraction, preApprovedFunctions } from './interaction.js';
import { online } from './peermesh.js';
import { vrManager } from './vrui.js';

// Constants for movement and jumping
const BASE_SPEED = 4.0;
const AIR_ACCELERATION = 15.0; // m/s², controls how quickly the avatar adjusts direction in air
const JUMP_FORCE = 7.0;

// Variables for camera rotation and movement
let yaw = 0;
let pitch = 0;
const maxPitch = (85 * Math.PI) / 180; // Limit pitch to ±85 degrees
const minPitch = (-85 * Math.PI) / 180;

let moveDirection = { x: 0, y: 0 }; // Joystick
let isSprinting = false;
export const isTouchDevice = 'ontouchstart' in window;

// Touch control setup for mobile devices
export function setupTouchControls() {

    // Create virtual joystick
    const joystickZone = document.getElementById('joystick-zone');
    const joystick = nipplejs.create({
        zone: joystickZone,
        mode: 'dynamic',
        position: {
            left: '50%',
            top: '50%'
        },
        color: 'blue'
    });

    joystick.on('move', (evt, data) => {
        moveDirection.x = data.vector.x;
        moveDirection.y = -data.vector.y;
    });

    joystick.on('end', () => {
        moveDirection.x = 0;
        moveDirection.y = 0;
    });

    // Touch-based camera rotation
    let cameraTouchId = null;
    let lastTouchX = 0;
    let lastTouchY = 0;

    document.addEventListener('touchstart', (event) => {
        for (let touch of event.changedTouches) {

            // Use touches outside the joystick zone for camera rotation
            if (!joystickZone.contains(touch.target)) {
                cameraTouchId = touch.identifier;
                lastTouchX = touch.clientX;
                lastTouchY = touch.clientY;
                break; // Handle only one touch for camera
            }
        }
    });

    document.addEventListener('touchmove', (event) => {
        for (let touch of event.changedTouches) {
            if (touch.identifier === cameraTouchId) {
                const deltaX = touch.clientX - lastTouchX;
                const deltaY = touch.clientY - lastTouchY;
                lastTouchX = touch.clientX;
                lastTouchY = touch.clientY;
                yaw -= deltaX * 0.005;
                pitch -= deltaY * 0.005;
                pitch = Math.max(minPitch, Math.min(maxPitch, pitch));

                // Apply rotation to camera
                const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');
                viewerState.camera.quaternion.setFromEuler(euler);
            }
        }
    });

    document.addEventListener('touchend', (event) => {
        for (let touch of event.changedTouches) {
            if (touch.identifier === cameraTouchId) {
                cameraTouchId = null;
            }
        }
    });

    // Jump button handler                                                       Combine with other jump logic, not 2 different
    const jumpBtn = document.getElementById('jump-btn');
    jumpBtn.addEventListener('touchstart', () => {
        if (avatarState.selectedAvatarId !== null) {
            if (avatarState.avatarBody.canJump && avatarState.avatarBody.isGrounded) {
                const currentVel = avatarState.avatarBody.linvel();
                avatarState.avatarBody.setLinvel({
                    x: currentVel.x,
                    y: JUMP_FORCE,
                    z: currentVel.z
                }, true);
                avatarState.avatarBody.canJump = false;
            }
        }
    });

    // Sprint button handler                                                    Combine with other jump logic, not 2 different
    const sprintBtn = document.getElementById('sprint-btn');
    sprintBtn.addEventListener('touchstart', () => {
        isSprinting = true;
    });

    // Interaction button handler    
    const interactBtn = document.getElementById('interact-btn');
    interactBtn.addEventListener('touchstart', () => {
        keys.add('f');
    });
    interactBtn.addEventListener('touchend', () => {
        keys.delete('f');
    });

    // ESC button handler                                                       Combine with other jump logic, not 2 different
    const escBtn = document.getElementById('esc-btn');
    escBtn.addEventListener('touchstart', () => {
        escButtonPress();
    });
}

// Own Interaction with World
export function applyPlayerMovement(delta) {

    const isVR = !!(viewerState.renderer && viewerState.renderer.xr && viewerState.renderer.xr.isPresenting);
    const currentCamera = isVR ? viewerState.renderer.xr.getCamera() : viewerState.camera;

    if (viewerState.controls.isLocked || isTouchDevice || isVR) {
        if (avatarState.avatarMesh && avatarState.avatarBody) {
            
            const collider = avatarState.avatarBody.collider(0);

            // Ground detection using character controller
            const smallDownwardMovement = new RAPIER.Vector3(0, -0.01, 0);
            viewerState.characterController.computeColliderMovement(collider, smallDownwardMovement);
            let isGrounded = false;
            for (let i = 0; i < viewerState.characterController.numComputedCollisions(); i++) {
                const collision = viewerState.characterController.computedCollision(i);
                if (collision) { // Normal mostly upward indicates ground
                    isGrounded = true;
                    break;
                }
            }
            avatarState.isGrounded = isGrounded;

            // Movement logic
            const camDirection = new THREE.Vector3();
            currentCamera.getWorldDirection(camDirection);
            camDirection.y = 0;
            camDirection.normalize();

            // Calculate local direction
            let localDirection = new THREE.Vector3();
            if (isTouchDevice) {
                localDirection.set(moveDirection.x, 0, moveDirection.y);
            } else {
                if (keys.has('w')) localDirection.z -= 1;
                if (keys.has('s')) localDirection.z += 1;
                if (keys.has('a')) localDirection.x -= 1;
                if (keys.has('d')) localDirection.x += 1;
            }

            // Get player movement direction relative to camera

            // Calculate input magnitude
            let inputMagnitude;
            if (isTouchDevice) {
                inputMagnitude = localDirection.length();
            } else {
                inputMagnitude = localDirection.length() > 0 ? 1 : 0;
            }

            // Normalize localDirection if magnitude > 0
            if (inputMagnitude > 0) {
                localDirection.normalize();
            }

            // Transform to world space (use XR camera in VR)
            const euler = new THREE.Euler().setFromQuaternion(currentCamera.quaternion, 'YXZ');
            const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), euler.y);
            const movementDirection = localDirection.applyQuaternion(yawQuaternion);

            const speedMultiplier = getSpeedMultiplier();

            // Avatar  Movement
            if (avatarState.isGrounded) {

                // Grounded movement: use character controller for proper wall sliding
                const walkSpeed = BASE_SPEED * speedMultiplier;
                const targetSpeed = walkSpeed * (isTouchDevice ? inputMagnitude : 1);
                const desiredMovement = movementDirection.clone().multiplyScalar(targetSpeed * delta);

                // Use character controller to compute movement with collision handling
                const collider = avatarState.avatarBody.collider(0);
                viewerState.characterController.computeColliderMovement(
                    collider,
                    new RAPIER.Vector3(desiredMovement.x, 0, desiredMovement.z)
                );

                // Apply the computed movement
                const correctedMovement = viewerState.characterController.computedMovement();
                const newPosition = avatarState.avatarBody.translation();
                newPosition.x += correctedMovement.x;
                newPosition.z += correctedMovement.z;
                avatarState.avatarBody.setTranslation(newPosition, true);
                avatarState.avatarBody.wakeUp();

            } else { // In-Air Movement
                if (inputMagnitude > 0) {
                    const accelerationMagnitude = AIR_ACCELERATION * (isTouchDevice ? inputMagnitude : 1);
                    const acceleration = movementDirection.clone().multiplyScalar(accelerationMagnitude);
                    const deltaV = acceleration.multiplyScalar(delta);
                    
                    const currentVel = avatarState.avatarBody.linvel();
                    const currentVelVec3 = new THREE.Vector3(currentVel.x, currentVel.y, currentVel.z);
                    
                    let newVelVec3 = currentVelVec3.add(deltaV);
                    
                    // Calculate and clamp horizontal speed
                    const horizontalVel = new THREE.Vector3(newVelVec3.x, 0, newVelVec3.z);
                    const horizontalSpeed = horizontalVel.length();
                    
                    if (horizontalSpeed > ( speedMultiplier == 1 ? BASE_SPEED : BASE_SPEED * 2)) {
                        newVelVec3 = currentVelVec3.sub(deltaV);
                    }
                    
                    avatarState.avatarBody.setLinvel(new RAPIER.Vector3(newVelVec3.x, newVelVec3.y, newVelVec3.z), true);
                }
            }

            // Jumping logic
            if ((keys.has(' ') || (isTouchDevice && /* check your jump button state */ false)) && avatarState.canJump && avatarState.isGrounded) {
                const currentVel = avatarState.avatarBody.linvel();
                avatarState.avatarBody.setLinvel({
                    x: currentVel.x,
                    y: JUMP_FORCE,
                    z: currentVel.z
                }, true); // Apply upward velocity for the jump
                avatarState.canJump = false; // Immediately prevent jumping again until landed
                avatarState.isGrounded = false; // Assume we are leaving the ground
                avatarState.wasGrounded = true; // Mark that we *were* grounded to prevent immediate re-jump
            }

            // --- Reset canJump when landing ---
            // If we are now grounded, but previously were not
            if (avatarState.isGrounded && !avatarState.wasGrounded) {
                avatarState.lastLandingTime = performance.now();
                avatarState.canJump = true; // Allow jumping again
            }
            // Update wasGrounded for the next frame's check
            avatarState.wasGrounded = avatarState.isGrounded;

            // --- Coyote time / Jump buffer (Optional but good) ---
            // Reset canJump if airborne for too long after leaving ground
            // (Prevents jumping if falling off a ledge without pressing space)
            if (avatarState.lastLandingTime) {
                const timeSinceLanding = (performance.now() - avatarState.lastLandingTime) / 1000;
                // If airborne for more than 0.2 seconds (adjust as needed)
                if (timeSinceLanding >= 0.2 && !avatarState.isGrounded) {
                    avatarState.canJump = false;
                }
            }

            // Update camera to follow avatar (skip in VR as XR controls camera)
            if (!isVR) {
                viewerState.cameraController.update();
            }

            // Sync mesh/rig with body and keep upright
            const pos = avatarState.avatarBody.translation();
            if (viewerState.playerRig) {
                // Move the rig (parents avatar mesh) to body position; keep mesh local at origin
                viewerState.playerRig.position.set(pos.x, pos.y, pos.z);
                if (avatarState.avatarMesh.parent === viewerState.playerRig) {
                    avatarState.avatarMesh.position.set(0, 0, 0);
                }
            } else {
                avatarState.avatarMesh.position.set(pos.x, pos.y, pos.z);
            }

            // Update VR controllers and teleportation
            if (isVR) {
                vrManager.updateVRControllers();
            }

            // Rotate the avatar's quaternion to match the camera direction
            const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 0, 1),
                camDirection
            );
            avatarState.avatarMesh.quaternion.slerp(targetQuaternion, 0.1);

            // Keep physics body upright (important!)
            const currentRotation = avatarState.avatarBody.rotation();
            avatarState.avatarBody.setRotation({
                x: 0,
                y: currentRotation.y,
                z: 0,
                w: currentRotation.w
            }, true);

            // Update mini-map camera and player indicator
            if (avatarState.avatarMesh) {
                const playerPos = viewerState.playerRig ? viewerState.playerRig.position : avatarState.avatarMesh.position;
                if (avatarState.isGrounded) {
                    avatarState.lastGroundedY = playerPos.y;
                }
                const playerBaseY = avatarState.lastGroundedY; // Avatar's base height

                // Position mini-map camera 2.5 units above avatar's base
                viewerState.miniMapCamera.position.set(playerPos.x, playerBaseY + 2.5, playerPos.z);
                viewerState.miniMapCamera.lookAt(playerPos.x, playerBaseY, playerPos.z);

                // Update player indicator position
                viewerState.playerIndicator.position.copy(playerPos);
                viewerState.playerIndicator.position.y += 0.1; // Slight offset to avoid clipping
            }
            
            // Interaction logic
            let closestPoint = null;
            let minDistance = Infinity;
            document.getElementById("interactionHint").style.display = "none";

            sceneObjects.forEach(obj => {
                if (obj.userData && obj.userData.interactionPoints) { // Updated condition
                    obj.userData.interactionPoints.forEach(point => {
                        const pointWorldPosition = new THREE.Vector3(
                            point.position[0], point.position[1], point.position[2]
                        ).applyMatrix4(obj.matrixWorld);

                        const avatarPos = viewerState.playerRig ? viewerState.playerRig.position : avatarState.avatarMesh.position;
                        const distance = avatarPos.distanceTo(pointWorldPosition);
                        if (distance < 1.0 && distance < minDistance) {
                            if (point.action == "pickupObject" && avatarState.hasObjectPickedUp) {
                                console.log("Can't pick up more than 1 Objects");
                            } else {
                                document.getElementById("interactionHint").style.display = "block";
                                document.getElementById("interactionHint").textContent = point.action;
                                minDistance = distance;
                                closestPoint = {
                                    point,
                                    object: obj
                                };
                            }
                        }
                    });
                }
            });

            // Handle interaction trigger
            if (keys.has('f')) {
                if (avatarState.hasObjectPickedUp) {
                    preApprovedFunctions.placeObject();
                } else {
                    if (closestPoint) {
                        triggerInteraction(closestPoint.point, closestPoint.object);
                    }
                }
                keys.delete('f'); // Prevent repeated triggers
            }

            // Update picked-up object position to follow avatar
            if (avatarState.hasObjectPickedUp && preApprovedFunctions.pickedUpObject) {

                const object = preApprovedFunctions.pickedUpObject;
                const avatarPos = viewerState.playerRig ? viewerState.playerRig.position : avatarState.avatarMesh.position;
                const offset = new THREE.Vector3(0, 1, 1);
                offset.applyQuaternion(avatarState.avatarMesh.quaternion);
                object.position.copy(avatarPos).add(offset);
                object.quaternion.copy(avatarState.avatarMesh.quaternion);
            }

            const currentTime = performance.now();

            // Send avatar position to other players
            if (online.connectedPeers.size > 0 && currentTime - online.lastSendTime > 50) {
                const position = viewerState.playerRig ? viewerState.playerRig.position : avatarState.avatarMesh.position;
                const quaternion = avatarState.avatarMesh.quaternion;

                online.send("position", {
                    position: {
                        x: position.x,
                        y: position.y,
                        z: position.z
                    },
                    quaternion: {
                        x: quaternion.x,
                        y: quaternion.y,
                        z: quaternion.z,
                        w: quaternion.w
                    }
                });
                online.lastSendTime = currentTime;
            }
        } else {

            // Move Spectator Camera
            const moveSpeed = 0.1;
            if (isTouchDevice) {

                // Touch-based camera movement
                const movementDirection = new THREE.Vector3(moveDirection.x, 0, moveDirection.y).applyQuaternion(viewerState.camera.quaternion);
                viewerState.camera.position.add(movementDirection.multiplyScalar(moveSpeed));
            } else {
                if (keys.has('w')) viewerState.controls.moveForward(moveSpeed);
                if (keys.has('s')) viewerState.controls.moveForward(-moveSpeed);
                if (keys.has('a')) viewerState.controls.moveRight(-moveSpeed);
                if (keys.has('d')) viewerState.controls.moveRight(moveSpeed);
                if (keys.has(' ')) viewerState.camera.position.y += moveSpeed;
                if (keys.has('control')) viewerState.camera.position.y -= moveSpeed;
            }
        }
    }
}

// Speed multiplier function
function getSpeedMultiplier() {
    if (isTouchDevice) {
        return isSprinting ? 2 : 1;
    } else {
        return keys.has('shift') ? 2 : 1;
    }
}

