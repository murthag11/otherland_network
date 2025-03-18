import { controls, world, scene, camera, sceneObjects, renderer, khetState, cameraController, isAnimating } from './viewer.js';
import { avatarState } from './avatar.js';
import { keys } from './menu.js';
import { triggerInteraction } from './interaction.js';
import { online } from './peermesh.js';

const animationMixers = [];

// Detect if the device supports touch input
export const isTouchDevice = 'ontouchstart' in window;

// Variables for camera rotation on touch devices
let yaw = 0;
let pitch = 0;
const maxPitch = (85 * Math.PI) / 180; // Limit pitch to ±85 degrees
const minPitch = (-85 * Math.PI) / 180;

let moveDirection = { x: 0, y: 0 }; // Joystick

// Touch control setup for mobile devices
if (isTouchDevice) {

    // Create virtual joystick
    const joystickZone = document.getElementById('joystick-zone');
    const joystick = nipplejs.create({
        zone: joystickZone,
        mode: 'static', // Fixed position joystick
        position: { left: '50%', top: '50%' }, // Center within the zone
        color: 'blue'
    });

    // Store joystick movement direction
    joystick.on('move', (evt, data) => {
        moveDirection.x = data.vector.x; // Horizontal: -1 (left) to 1 (right)
        moveDirection.y = -data.vector.y; // Vertical: -1 (down) to 1 (up)
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

                // Update yaw (horizontal) and pitch (vertical)
                yaw -= deltaX * 0.002; // Adjust sensitivity as needed
                pitch -= deltaY * 0.002;
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

    // Jump button handler
    const jumpBtn = document.getElementById('jump-btn');
    jumpBtn.addEventListener('touchstart', () => {
        if (avatarState.avatarBody.canJump && avatarState.avatarBody.isGrounded) {
            const jumpForce = 5;
            avatarState.avatarBody.velocity.y = jumpForce;
            avatarState.avatarBody.canJump = false;
        }
    });
}

export function animate() {
    if (!isAnimating) return;
    requestAnimationFrame(animate);
    const clock = new THREE.Clock();
    const delta = clock.getDelta();

    world.step(1 / 60, delta, 3); // Fixed timestep with accumulation

    khetState.executors.forEach(executor => executor());

    if (controls.isLocked || isTouchDevice) {
        if (avatarState.avatarMesh && avatarState.avatarBody) {

            // Determine closest interaction point (consider checking only nearby Khets (e.g., within 5 units) if performance becomes an issue)
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
                        console.log(distance);
                        
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

            const baseSpeed = 4.0;
            const walkSpeed = keys.has('shift') ? baseSpeed * 2 : baseSpeed; // Double speed when Shift is pressed
            const forward = camDirection.clone().multiplyScalar(walkSpeed);
            const right = new THREE.Vector3().crossVectors(camDirection, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(walkSpeed);

            const moveVelocity = new CANNON.Vec3(0, avatarState.avatarBody.velocity.y, 0);
            if (isTouchDevice) {
                // Touch-based movement using joystick
                const movementDirection = new THREE.Vector3(moveDirection.x, 0, moveDirection.y).applyQuaternion(camera.quaternion);
                const movementVelocity = new CANNON.Vec3(movementDirection.x, 0, movementDirection.z).scale(walkSpeed);
                moveVelocity.x = movementVelocity.x;
                moveVelocity.z = movementVelocity.z;
            } else {
                // Keyboard-based movement
                if (keys.has('w')) moveVelocity.vadd(new CANNON.Vec3(forward.x, 0, forward.z), moveVelocity);
                if (keys.has('s')) moveVelocity.vadd(new CANNON.Vec3(-forward.x, 0, -forward.z), moveVelocity);
                if (keys.has('a')) moveVelocity.vadd(new CANNON.Vec3(-right.x, 0, -right.z), moveVelocity);
                if (keys.has('d')) moveVelocity.vadd(new CANNON.Vec3(right.x, 0, right.z), moveVelocity);
            }
            avatarState.avatarBody.velocity.set(moveVelocity.x, avatarState.avatarBody.velocity.y, moveVelocity.z);

            // Check grounding using physics contacts
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
                const jumpForce = 5;
                avatarState.avatarBody.velocity.y = jumpForce;
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
            if (online.connected && avatarState.avatarMesh) {
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
                // Keyboard-based camera movement
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