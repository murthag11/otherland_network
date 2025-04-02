import * as THREE from 'three';
import nipplejs from 'nipplejs';
import RAPIER from '@dimforge/rapier3d-compat';

import { viewerState, sceneObjects, khetState, isAnimating } from './index.js';
import { avatarState } from './avatar.js';
import { keys, escButtonPress } from './menu.js';
import { triggerInteraction, preApprovedFunctions } from './interaction.js';
import { online } from './peermesh.js';

const animationMixers = [];
const clock = new THREE.Clock();

// Detect if the device supports touch input
export const isTouchDevice = 'ontouchstart' in window;

// Constants for movement and jumping
const BASE_SPEED = 4.0;
const JUMP_FORCE = 7;
const AIR_ADJUSTMENT_ACCELERATION = 15.0; // Small acceleration for slight in-air adjustments (m/s^2)

// Variables for camera rotation and movement
let yaw = 0;
let pitch = 0;
const maxPitch = (85 * Math.PI) / 180; // Limit pitch to ±85 degrees
const minPitch = (-85 * Math.PI) / 180;

let moveDirection = { x: 0, y: 0 }; // Joystick
let isSprinting = false;
let lastPosition = [null, null, null];

// Touch control setup for mobile devices
if (isTouchDevice) {

    // Create virtual joystick
    const joystickZone = document.getElementById('joystick-zone');
    const joystick = nipplejs.create({
        zone: joystickZone,
        mode: 'dynamic',
        position: { left: '50%', top: '50%' },
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
                avatarState.avatarBody.setLinvel({ x: currentVel.x, y: JUMP_FORCE, z: currentVel.z }, true);
                avatarState.avatarBody.canJump = false;
            }
        }
    });

    // Sprint button handler                                                       Combine with other jump logic, not 2 different
    const sprintBtn = document.getElementById('sprint-btn');
    sprintBtn.addEventListener('touchstart', () => {
        isSprinting = true;
    });

    // Interaction button handler    
    const interactBtn = document.getElementById('interact-btn');
    interactBtn.addEventListener('touchstart', () => { keys.add('f'); });
    interactBtn.addEventListener('touchend', () => { keys.delete('f'); });

    // ESC button handler                                                       Combine with other jump logic, not 2 different
    const escBtn = document.getElementById('esc-btn');
    escBtn.addEventListener('touchstart', () => {
        escButtonPress();
    });
}

// Speed multiplier function
function getSpeedMultiplier() {
    console.log('Shift pressed:', keys.has('shift'))
    if (isTouchDevice) {
        return isSprinting ? 2 : 1;
    } else {
        return keys.has('shift') ? 2 : 1;
    }
}

// Animation Loop
export function animate() {
    if (!isAnimating) return;
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    viewerState.world.step(viewerState.eventQueue);

    // Execute Khet Code
    khetState.executors.forEach(executor => executor());

    if (viewerState.controls.isLocked || isTouchDevice) {
        if (avatarState.avatarMesh && avatarState.avatarBody) {

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

                        const distance = avatarState.avatarMesh.position.distanceTo(pointWorldPosition);
                        if (distance < 1.0 && distance < minDistance) {
                            if (point.action == "pickupObject" && avatarState.hasObjectPickedUp) {
                                console.log("Can't pick up more than 1 Objects");
                            } else {
                                document.getElementById("interactionHint").style.display = "block";
                                document.getElementById("interactionHint").innerHTML = point.action;
                                minDistance = distance;
                                closestPoint = { point, object: obj };
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

            // Avatar movement code
            const camDirection = new THREE.Vector3();
            viewerState.camera.getWorldDirection(camDirection);
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

            // Transform to world space
            const euler = new THREE.Euler().setFromQuaternion(viewerState.camera.quaternion, 'YXZ');
            const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), euler.y);
            const movementDirection = localDirection.applyQuaternion(yawQuaternion);

            // Collision event handling
            viewerState.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
                const collider1 = viewerState.world.getCollider(handle1);
                const collider2 = viewerState.world.getCollider(handle2);
                const rb1 = viewerState.world.getRigidBody(collider1.parent());
                const rb2 = viewerState.world.getRigidBody(collider2.parent());
                let avatarBody, otherBody;
                if (rb1.userData.type === 'avatar') {
                    avatarBody = rb1;
                    otherBody = rb2;
                } else if (rb2.userData.type === 'avatar') {
                    avatarBody = rb2;
                    otherBody = rb1;
                } else {
                    return;
                }
                if (otherBody.userData.type === 'sceneObject') {
                    if (started) {
                        avatarState.collidingWithGround.add(otherBody);
                    } else {
                        avatarState.collidingWithGround.delete(otherBody);
                    }
                }
            });
            avatarState.avatarBody.isGrounded = avatarState.collidingWithGround.size > 0;

            // Actual Movement
            if (avatarState.avatarBody.isGrounded) {

                // Grounded movement: set velocity directly
                const speedMultiplier = getSpeedMultiplier();
                const walkSpeed = BASE_SPEED * speedMultiplier;
                const targetSpeed = walkSpeed * (isTouchDevice ? inputMagnitude : 1);
                const targetVelocity = movementDirection.clone().multiplyScalar(targetSpeed);
                const currentVel = avatarState.avatarBody.linvel();
                avatarState.avatarBody.setLinvel(new RAPIER.Vector3(targetVelocity.x, currentVel.y, targetVelocity.z), true);

            } else {
                if (inputMagnitude > 0) {
                    const adjustmentMagnitude = AIR_ADJUSTMENT_ACCELERATION * (isTouchDevice ? inputMagnitude : 1);
                    const adjustment = movementDirection.clone().multiplyScalar(adjustmentMagnitude);
                    const currentVel = avatarState.avatarBody.linvel();
                    avatarState.avatarBody.setLinvel(
                        new RAPIER.Vector3(currentVel.x + adjustment.x * delta, currentVel.y, currentVel.z + adjustment.z * delta),
                        true
                    );
                }
            }

            // Jumping logic
            if (keys.has(' ') && avatarState.avatarBody.canJump && avatarState.avatarBody.isGrounded) {
                const currentVel = avatarState.avatarBody.linvel();
                avatarState.avatarBody.setLinvel({ x: currentVel.x, y: JUMP_FORCE, z: currentVel.z }, true);
                avatarState.avatarBody.canJump = false;
            }

            // Reset canJump when landing
            if (avatarState.avatarBody.isGrounded && !avatarState.avatarBody.wasGrounded) {
                avatarState.avatarBody.lastLandingTime = performance.now();
                avatarState.avatarBody.canJump = true;
            }
            avatarState.avatarBody.wasGrounded = avatarState.avatarBody.isGrounded;

            if (avatarState.avatarBody.lastLandingTime) {
                const timeSinceLanding = (performance.now() - avatarState.avatarBody.lastLandingTime) / 1000;
                if (timeSinceLanding >= 0.5 && !avatarState.avatarBody.isGrounded) {
                    avatarState.avatarBody.canJump = false;
                }
            }

            // Update camera to follow avatar
            viewerState.cameraController.update();

            // Sync mesh with body and keep upright
            const pos = avatarState.avatarBody.translation();
            avatarState.avatarMesh.position.set(pos.x, pos.y, pos.z);
            
            // Rotate the avatar's quaternion to match the camera direction
            const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 0, 1),
                camDirection
            );
            avatarState.avatarMesh.quaternion.slerp(targetQuaternion, 0.1);
            
            // Update picked-up object position to follow avatar
            if (avatarState.hasObjectPickedUp && preApprovedFunctions.pickedUpObject) {
                console.log("Test");
                
                const object = preApprovedFunctions.pickedUpObject;
                const offset = new THREE.Vector3(0, 1, 1);
                offset.applyQuaternion(avatarState.avatarMesh.quaternion);
                object.position.copy(avatarState.avatarMesh.position).add(offset);
                object.quaternion.copy(avatarState.avatarMesh.quaternion);
            }

            // Send avatar position to other players
            if (online.connectedPeers.size > 0 && avatarState.avatarMesh && avatarState.selectedAvatarId) {
                const currentTime = performance.now();
                if (currentTime - online.lastSendTime > 50) {
                    const position = avatarState.avatarMesh.position;
                    const quaternion = avatarState.avatarMesh.quaternion;

                    online.send("position", {
                        position: { x: position.x, y: position.y, z: position.z },
                        quaternion: { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w }
                    });
                    online.lastSendTime = currentTime;

                    /* if (position[0] !== lastPosition[0] || position[2] !== lastPosition[2]) {
                        
                    }
                    lastPosition = position; */
                }
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

    // Sync all scene objects with their physics bodies, skipping picked-up objects
    sceneObjects.forEach(obj => {
        if (obj.userData && obj.userData.body && !obj.userData.isPickedUp && obj.userData.body.isDynamic()) {
            const pos = obj.userData.body.translation();
            obj.position.set(pos.x, pos.y, pos.z);
            if (obj !== avatarState.avatarMesh) {
                const rot = obj.userData.body.rotation();
                obj.quaternion.set(rot.x, rot.y, rot.z, rot.w);
            }
        }
    });

    animationMixers.forEach(mixer => mixer.update(delta));
    viewerState.renderer.renderAsync(viewerState.scene, viewerState.camera);
}