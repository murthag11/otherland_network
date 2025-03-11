import { controls, world, scene, camera, avatarMesh, avatarBody, sceneObjects, renderer, khetState, cameraController } from './viewer.js';
import { keys } from './menu.js';
import { triggerInteraction } from './interaction.js';

const animationMixers = [];

export function animate() {
    requestAnimationFrame(animate);
    const clock = new THREE.Clock();
    const delta = clock.getDelta();

    world.step(1 / 60, delta, 3); // Fixed timestep with accumulation

    khetState.executors.forEach(executor => executor());

    if (controls.isLocked) {
        if (avatarMesh && avatarBody) {

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

                        const distance = avatarMesh.position.distanceTo(pointWorldPosition);
                        if (distance < 1.0 && distance < minDistance) { // Threshold of 1 unit
                            minDistance = distance;
                            closestPoint = { point, object: obj };
                        }
                        console.log(distance);
                        
                    });
                }
                console.log("Closest point:");
                console.log(closestPoint);
                
                
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

            const moveVelocity = new CANNON.Vec3(0, avatarBody.velocity.y, 0);
            if (keys.has('w')) moveVelocity.vadd(new CANNON.Vec3(forward.x, 0, forward.z), moveVelocity);
            if (keys.has('s')) moveVelocity.vadd(new CANNON.Vec3(-forward.x, 0, -forward.z), moveVelocity);
            if (keys.has('a')) moveVelocity.vadd(new CANNON.Vec3(-right.x, 0, -right.z), moveVelocity);
            if (keys.has('d')) moveVelocity.vadd(new CANNON.Vec3(right.x, 0, right.z), moveVelocity);
            avatarBody.velocity.set(moveVelocity.x, avatarBody.velocity.y, moveVelocity.z);

            // Check grounding using physics contacts
            avatarBody.isGrounded = false;
            world.contacts.forEach(contact => {
                sceneObjects.forEach(obj => {
                    if (obj.userData && obj.userData.body) {
                        if ((contact.bi === avatarBody && contact.bj === obj.userData.body) || 
                            (contact.bi === obj.userData.body && contact.bj === avatarBody)) {
                            avatarBody.isGrounded = true;
                        }
                    }
                });
            });

            // Jumping logic
            if (keys.has(' ') && avatarBody.canJump && avatarBody.isGrounded) {
                const jumpForce = 5;
                avatarBody.velocity.y = jumpForce;
                avatarBody.canJump = false;
            }

            // Reset canJump when landing
            if (avatarBody.isGrounded && !avatarBody.wasGrounded) {
                avatarBody.lastLandingTime = performance.now();
                avatarBody.canJump = true;
            }
            avatarBody.wasGrounded = avatarBody.isGrounded;

            if (avatarBody.lastLandingTime) {
                const timeSinceLanding = (performance.now() - avatarBody.lastLandingTime) / 1000;
                if (timeSinceLanding >= 0.5 && !avatarBody.isGrounded) {
                    avatarBody.canJump = false;
                }
            }

            // Sync mesh with body and keep upright
            avatarBody.quaternion.set(0, 0, 0, 1); // Keep avatar upright
            avatarMesh.position.copy(avatarBody.position);
            avatarMesh.position.y -= avatarMesh.sizeY / 2; // Base at physics body center minus half height
            const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 0, 1),
                camDirection
            );
            avatarMesh.quaternion.slerp(targetQuaternion, 0.1);

            // Update camera to follow avatar
            cameraController.update();
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
            obj.quaternion.copy(obj.userData.body.quaternion);
        }
    });

    animationMixers.forEach(mixer => mixer.update(delta));
    renderer.render(scene, camera);
}