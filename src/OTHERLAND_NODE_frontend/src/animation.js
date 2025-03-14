import { controls, world, scene, camera, sceneObjects, renderer, khetState, cameraController, isAnimating } from './viewer.js';
import { avatarState } from './avatar.js';
import { keys } from './menu.js';
import { triggerInteraction } from './interaction.js';

const animationMixers = [];

export function animate() {
    if (!isAnimating) return;
    requestAnimationFrame(animate);
    const clock = new THREE.Clock();
    const delta = clock.getDelta();

    world.step(1 / 60, delta, 3); // Fixed timestep with accumulation

    khetState.executors.forEach(executor => executor());

    if (controls.isLocked) {
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
            if (keys.has('w')) moveVelocity.vadd(new CANNON.Vec3(forward.x, 0, forward.z), moveVelocity);
            if (keys.has('s')) moveVelocity.vadd(new CANNON.Vec3(-forward.x, 0, -forward.z), moveVelocity);
            if (keys.has('a')) moveVelocity.vadd(new CANNON.Vec3(-right.x, 0, -right.z), moveVelocity);
            if (keys.has('d')) moveVelocity.vadd(new CANNON.Vec3(right.x, 0, right.z), moveVelocity);
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
        } else {

            // Move Spectator Camera
            const moveSpeed = 0.1;
            if (keys.has('w')) controls.moveForward(moveSpeed);
            if (keys.has('s')) controls.moveForward(-moveSpeed);
            if (keys.has('a')) controls.moveRight(-moveSpeed);
            if (keys.has('d')) controls.moveRight(moveSpeed);
            if (keys.has(' ')) camera.position.y += moveSpeed;
            if (keys.has('control')) camera.position.y -= moveSpeed;
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