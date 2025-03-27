import { controls, world, scene, camera, sceneObjects, renderer, khetState, cameraController, isAnimating } from './index.js';
import { avatarState } from './avatar.js';
import { keys, escButtonPress } from './menu.js';
import { triggerInteraction } from './interaction.js';
import { online } from './peermesh.js';

const animationMixers = [];

// Detect if the device supports touch input
export const isTouchDevice = 'ontouchstart' in window;

// Constants for movement and jumping
const BASE_SPEED = 4.0;
const JUMP_FORCE = 7;
const AIR_ADJUSTMENT_ACCELERATION = 100.0; // Small acceleration for slight in-air adjustments (m/s^2)

// Variables for camera rotation and movement
let yaw = 0;
let pitch = 0;
const maxPitch = (85 * Math.PI) / 180; // Limit pitch to ±85 degrees
const minPitch = (-85 * Math.PI) / 180;

let moveDirection = { x: 0, y: 0 }; // Joystick
let isSprinting = false;

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
                camera.quaternion.setFromEuler(euler);
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
                avatarState.avatarBody.velocity.y = JUMP_FORCE;
                avatarState.avatarBody.canJump = false;
            }
        }
    });

    // Sprint button handler                                                       Combine with other jump logic, not 2 different
    const sprintBtn = document.getElementById('sprint-btn');
    sprintBtn.addEventListener('touchstart', () => {
        isSprinting = true;
    });

    // ESC button handler                                                       Combine with other jump logic, not 2 different
    const escBtn = document.getElementById('esc-btn');
    escBtn.addEventListener('touchstart', () => {
        escButtonPress();
    });
}

// Speed multiplier function
function getSpeedMultiplier() {
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
    const clock = new THREE.Clock();
    const delta = clock.getDelta();

    world.step(1 / 60, delta, 3); // Fixed timestep with accumulation

    // Execute Khet Code
    khetState.executors.forEach(executor => executor());

    if (controls.isLocked || isTouchDevice) {
        if (avatarState.avatarMesh && avatarState.avatarBody) {
            // Interaction logic
            let closestPoint = null;
            let minDistance = Infinity;

            sceneObjects.forEach(obj => {
                if (obj.userData && obj.userData.khet && obj.userData.khet.interactionPoints) {
                    obj.userData.khet.interactionPoints.forEach(point => {

                        // Convert local position to world position
                        const pointWorldPosition = new THREE.Vector3(
                            point.position[0],
                            point.position[1],
                            point.position[2]
                        ).applyMatrix4(obj.matrixWorld);

                        const distance = avatarState.avatarMesh.position.distanceTo(pointWorldPosition);
                        if (distance < 1.0 && distance < minDistance) { // Threshold of 1 unit
                            minDistance = distance;
                            closestPoint = { point, object: obj };
                        }
                    });
                }
            });

            // Handle interaction trigger
            if (closestPoint && keys.has('f')) {
                triggerInteraction(closestPoint.point, closestPoint.object);
                keys.delete('f'); // Prevent repeated triggers
            }

            // Avatar movement code
            const camDirection = new THREE.Vector3();
            camera.getWorldDirection(camDirection);
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
            const movementDirection = localDirection.applyQuaternion(camera.quaternion);

            if (avatarState.avatarBody.isGrounded) {
                // Grounded movement: set velocity directly
                const speedMultiplier = getSpeedMultiplier();
                const walkSpeed = BASE_SPEED * speedMultiplier;
                const targetSpeed = walkSpeed * (isTouchDevice ? inputMagnitude : 1);
                const targetVelocity = movementDirection.clone().multiplyScalar(targetSpeed);
                avatarState.avatarBody.velocity.set(targetVelocity.x, avatarState.avatarBody.velocity.y, targetVelocity.z);

                // Clear preserved velocity when grounded
                //avatarState.avatarBody.preservedVelocity = null;
            } else {
                /* In-air movement: preserve velocity and apply slight adjustments
                if (!avatarState.avatarBody.preservedVelocity) {
                    // Capture velocity the moment the avatar becomes airborne
                    avatarState.avatarBody.preservedVelocity = {
                        x: avatarState.avatarBody.velocity.x,
                        y: avatarState.avatarBody.velocity.y,
                        z: avatarState.avatarBody.velocity.z
                    };
                } */

                // Set initial horizontal velocity to preserved values
                //avatarState.avatarBody.velocity.x = avatarState.avatarBody.preservedVelocity.x;
                //avatarState.avatarBody.velocity.z = avatarState.avatarBody.preservedVelocity.z;
                // Note: y-velocity is preserved initially but will be modified by gravity via the physics engine

                // Apply slight adjustments based on input
                if (inputMagnitude > 0) {
                    const adjustmentMagnitude = AIR_ADJUSTMENT_ACCELERATION * (isTouchDevice ? inputMagnitude : 1);
                    const adjustment = movementDirection.clone().multiplyScalar(adjustmentMagnitude);
                    avatarState.avatarBody.velocity.x += adjustment.x * delta;
                    avatarState.avatarBody.velocity.z += adjustment.z * delta;

                    // Update preserved velocity to reflect adjustments
                    //avatarState.avatarBody.preservedVelocity.x = avatarState.avatarBody.velocity.x;
                    //avatarState.avatarBody.preservedVelocity.z = avatarState.avatarBody.velocity.z;
                }
            }

            // Grounding check
            avatarState.avatarBody.isGrounded = false;
            world.contacts.forEach(contact => {
                sceneObjects.forEach(obj => {
                    if (obj.userData && obj.userData.body) {
                        if ((contact.bi === avatarState.avatarBody && contact.bj === obj.userData.body) || 
                            (contact.bi === obj.userData.body && contact.bj === avatarState.avatarBody)) {
                            avatarState.avatarBody.isGrounded = true;
                        }
                    }
                });
            });

            // Jumping logic
            if (keys.has(' ') && avatarState.avatarBody.canJump && avatarState.avatarBody.isGrounded) {
                avatarState.avatarBody.velocity.y = JUMP_FORCE;
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
            cameraController.update();

            // Sync mesh with body and keep upright
            avatarState.avatarBody.quaternion.set(0, 0, 0, 1); // Keep avatar upright
            avatarState.avatarMesh.position.copy(avatarState.avatarBody.position);
            avatarState.avatarMesh.position.y -= avatarState.avatarMesh.sizeY / 2; // Base at physics body center minus half height
            
            // Rotate the avatar's quaternion to match the camera direction
            const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 0, 1),
                camDirection
            );
            avatarState.avatarMesh.quaternion.slerp(targetQuaternion, 0.1);

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
                }
            }
        } else {

            // Move Spectator Camera
            const moveSpeed = 0.1;
            if (isTouchDevice) {
                // Touch-based camera movement
                const movementDirection = new THREE.Vector3(moveDirection.x, 0, moveDirection.y).applyQuaternion(camera.quaternion);
                camera.position.add(movementDirection.multiplyScalar(moveSpeed));
            } else {
                if (keys.has('w')) controls.moveForward(moveSpeed);
                if (keys.has('s')) controls.moveForward(-moveSpeed);
                if (keys.has('a')) controls.moveRight(-moveSpeed);
                if (keys.has('d')) controls.moveRight(moveSpeed);
                if (keys.has(' ')) camera.position.y += moveSpeed;
                if (keys.has('control')) camera.position.y -= moveSpeed;
            }
        }
    }

    // Sync all scene objects with their physics bodies
    sceneObjects.forEach(obj => {
        if (obj.userData && obj.userData.body) {
            obj.position.copy(obj.userData.body.position);
            if (obj !== avatarState.avatarMesh) {
                obj.quaternion.copy(obj.userData.body.quaternion);
            }
        }
    });

    animationMixers.forEach(mixer => mixer.update(delta));
    renderer.render(scene, camera);
}