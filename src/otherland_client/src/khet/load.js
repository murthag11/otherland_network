import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { getUserNodeActor } from '../nodeManager.js';
import { viewerState } from '../index.js';
import { createKhetCodeExecutor } from './codeExecutor.js';
import { khetController } from './controller.js';

// Load Remote Avatar Mesh but no physics
export async function loadKhetMeshOnly(khetId, scene) {
    const khet = khetController.getKhet(khetId);
    if (!khet || !khet.gltfData) {
        console.error(`Khet ${khetId} not found or no gltfData`);
        return null;
    }
    const loader = new GLTFLoader();
    return new Promise((resolve) => {
        loader.parse(khet.gltfData.buffer, '', (gltf) => {
            const object = gltf.scene;
            object.scale.set(khet.scale[0], khet.scale[1], khet.scale[2]);
            
            // Set an initial position (will be updated by peer data)
            object.position.set(khet.position[0], khet.position[1], khet.position[2]);
            scene.add(object);
            resolve(object);
        }, (error) => {
            console.error(`Error loading mesh for Khet ${khetId}:`, error);
            resolve(null);
        });
    });
}

// **Load and Render Khet**
// Load a Khet by ID and add it to the scene
export async function loadKhet(khetId, { sceneObjects, animationMixers, khetState }) {

    let result = { mesh: null, body: null, isAvatar: false };

    // Load Khet
    try {
        const khet = khetController.getKhet(khetId);
        if (!khet) {
            console.error(`Khet ${khetId} not found in khetController`);
            return result;
        }
        if (!khet.gltfData) {

            // Show downloading message
            const downloadContainer = document.getElementById('download-container');
            const downloadBar = document.getElementById('download-bar');
            downloadContainer.style.display = 'block';
            console.log(`Fetching gltfData for Khet ${khetId}`);
            const success = await khetController.fetchGltfDataForKhet(khetId);
            if (!success || !khet.gltfData) {
                console.error(`Failed to fetch gltfData for Khet ${khetId}`);
                downloadBar.innerHTML = "Error Downloading Asset";
                setTimeout(() => {
                    downloadContainer.style.display = 'none';
                }, 5000);
                return result;
            } else {
                downloadContainer.style.display = 'none';
            }
        }

        const loader = new GLTFLoader();
        await new Promise((resolve) => {
            loader.parse(khet.gltfData.buffer, '', (gltf) => {
                
                try {
                    console.log(`Parsing GLTF for Khet ${khetId}`);
                    const object = gltf.scene;

                    // Scale Object
                    object.scale.set(khet.scale[0], khet.scale[1], khet.scale[2]);

                    // Compute bounding box
                    const box = new THREE.Box3().setFromObject(object);
                    const size = box.getSize(new THREE.Vector3());
                    const center = box.getCenter(new THREE.Vector3());
                    const minY = box.min.y; // Lowest point on Y-axis

                    // Add to playerRig if avatar (for locomotion), else scene
                    const isAvatarKhet = khet.khetType === 'Avatar';
                    if (isAvatarKhet && viewerState.playerRig) {
                        // Center the avatar mesh at the rig origin
                        object.position.set(-center.x, -center.y, -center.z);
                        viewerState.playerRig.add(object);
                        console.log(`Avatar ${khetId} added to playerRig`);
                    } else {
                        viewerState.scene.add(object);
                    }
                    sceneObjects.push(object);

                    // Adjust object/rig position so bottom is at khet.position[1]
                    if (isAvatarKhet && viewerState.playerRig) {
                        viewerState.playerRig.position.set(
                            khet.position[0], 
                            khet.position[1] + size.y / 2,  // Center at bottom + half height
                            khet.position[2]
                        );
                    } else {
                        object.position.set(
                            khet.position[0] - center.x, // Center X
                            khet.position[1] - minY,     // Bottom at khet.position[1]
                            khet.position[2] - center.z  // Center Z
                        );
                    }

                    // Determine mass and material based on khetType
                    let mass = 0;

                    // Physics body setup
                    let shape, body;
                    const isAvatar = khet.khetType == 'Avatar';
                    const debugPhysics = false;
                    let debugMesh, rigidBody; 

                    if (isAvatar) { // Avatar Physics
                        
                        // Sphere for Avatar
                        const radius = size.y / 2;
                        
                        // Position body so bottom is at khet.position[1]
                        let rigidBodyDesc = new RAPIER.RigidBodyDesc(RAPIER.RigidBodyType.Dynamic)
                            .setTranslation(khet.position[0], khet.position[1] + radius, khet.position[2]);
                        rigidBody = viewerState.world.createRigidBody(rigidBodyDesc);
                        let rigidBodyHandle = rigidBody.handle;

                        const colliderDesc = new RAPIER.ColliderDesc(new RAPIER.Ball(radius))
                            .setFriction(1.0);
                        const collider = viewerState.world.createCollider(colliderDesc, rigidBody); // Get collider handle
                        rigidBody.userData = { type: 'avatar', colliderHandle: collider.handle };

                        console.log(`Avatar collider handle set to: ${collider.handle}, type: ${typeof collider.handle}, raw: ${collider.handle.toString()}`);
                        rigidBody.lockRotations(true, true);

                        // Position is now driven by rig sync in animation.js (mesh local = 0 relative to rig)
                        object.rotation.y = Math.PI; // Keep initial rotation if needed

                        if (debugPhysics) {
                            const geometry = new THREE.SphereGeometry(radius, 16, 16);
                            const material = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
                            debugMesh = new THREE.Mesh(geometry, material);
                            debugMesh.position.copy(rigidBody.translation());
                            object.add(debugMesh);
                        }

                    } else if (khet.khetType === 'MobileObject') { // Mobile Object
                        const halfExtents = new THREE.Vector3(size.x / 2, size.y / 2, size.z / 2);
                        
                        // Create a dynamic rigid body for the mobile object
                        let rigidBodyDesc = new RAPIER.RigidBodyDesc(RAPIER.RigidBodyType.Dynamic)
                            .setTranslation(khet.position[0], khet.position[1] + halfExtents.y, khet.position[2]);
                        rigidBody = viewerState.world.createRigidBody(rigidBodyDesc);
                        let rigidBodyHandle = rigidBody.handle;
                        
                        // Create a box collider
                        const colliderDesc = new RAPIER.ColliderDesc(new RAPIER.Cuboid(halfExtents.x, halfExtents.y, halfExtents.z))
                            .setFriction(0.5).setRestitution(0.3);
                        const collider = viewerState.world.createCollider(colliderDesc, rigidBody); // Get collider handle
                        rigidBody.userData = { type: 'mobileObject', colliderHandle: collider.handle };
                        
                        // Position the visual object to match the physics body
                        object.position.set(rigidBody.translation().x, rigidBody.translation().y - halfExtents.y, rigidBody.translation().z);
                        
                        // Optional debug visualization
                        if (debugPhysics) {
                            const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
                            const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
                            const debugMesh = new THREE.Mesh(geometry, material);
                            debugMesh.position.copy(rigidBody.translation());
                            viewerState.scene.add(debugMesh);
                            object.userData.debugMesh = debugMesh;
                        }
                    } else { // Scene Objects
                        let vertexOffset = 0;
                        const allVertices = [];
                        const allIndices = [];

                        object.traverse(child => {
                            if (child.isMesh && child.geometry) {
                                const geometry = child.geometry.isBufferGeometry ? child.geometry : new THREE.BufferGeometry().fromGeometry(child.geometry);
                                const position = geometry.attributes.position;
                                const index = geometry.index;

                                // Collect vertices
                                for (let i = 0; i < position.count; i++) {
                                    const vertex = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld);
                                    allVertices.push(vertex.x, vertex.y, vertex.z);
                                }

                                // Collect indices with offset
                                if (index) {
                                    for (let i = 0; i < index.count; i++) {
                                        allIndices.push(index.getX(i) + vertexOffset);
                                    }
                                }

                                // Update offset for the next mesh
                                vertexOffset += position.count;
                            }
                        });

                        const vertices = new Float32Array(allVertices);
                        const indices = new Uint32Array(allIndices);

                        const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed()
                            .setTranslation(object.position.x, object.position.y, object.position.z);
                        rigidBody = viewerState.world.createRigidBody(rigidBodyDesc);
                        const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
                            .setFriction(0.8)
                            .setRestitution(0.0);
                        const collider = viewerState.world.createCollider(colliderDesc, rigidBody); // Get collider handle
                        rigidBody.userData = {
                            type: 'sceneObject',
                            colliderHandle: collider.handle // Store handle if needed
                        };

                        if (debugPhysics) {
                            const geometry = new THREE.BufferGeometry();
                            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
                            geometry.setIndex(new THREE.Uint32BufferAttribute(indices, 1));
                            const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
                            debugMesh = new THREE.Mesh(geometry, material);
                            debugMesh.position.copy(rigidBody.translation());
                            viewerState.scene.add(debugMesh);
                        }
                    }

                    // Common physics properties
                    object.userData.body = rigidBody;
                    object.userData.isAvatar = isAvatar;
                    object.userData.khetType = khet.khetType;
                    console.log(`Khet ${khetId} initial position:`, object.position, 'Body position:', rigidBody.translation());

                    // Animations
                    if (khet.animations && khet.animations.length > 0) {
                        console.log(`Khet ${khetId} animations:`, khet.animations);
                        const mixer = new THREE.AnimationMixer(object);
                        khet.animations.forEach(([name]) => {
                            const clip = THREE.AnimationClip.findByName(gltf.animations, name);
                            if (clip) mixer.clipAction(clip).play();
                        });
                        animationMixers.push(mixer);
                    }

                    // Textures
                    if (khet.textures && khet.textures.length > 0) {
                        khet.textures.forEach(([name, blob]) => {
                            const textureLoader = new THREE.TextureLoader();
                            const objectUrl = URL.createObjectURL(new Blob([blob]));
                            const texture = textureLoader.load(objectUrl, () => {
                                URL.revokeObjectURL(objectUrl);
                            });
                            object.traverse(child => {
                                if (child.isMesh && child.material) {
                                    child.material.map = texture;
                                }
                            });
                        });
                    }

                    // Custom Code
                    if (khet.code && khet.code.length > 0) {
                        const executor = createKhetCodeExecutor(khet.code[0], object);
                        const wrappedExecutor = () => {
                            if (!object.userData.isPickedUp) {
                                executor();
                            }
                        };
                        khetState.executors.push(wrappedExecutor);
                    }

                    // Interaction Points
                    if (khet.khetId && !isAvatar) {
                        khet.interactionPoints = [
                            {
                                position: [-1, 1, -1],
                                type: 'edit',
                                content: { property: 'color', value: 'red' },
                                action: "editProperty"
                            },
                            {
                                position: [1, 1, 1],
                                type: 'pickup',
                                content: null,
                                action: "pickupObject"
                            }
                        ];
                    }
                    
                    // Add visual markers for interaction points
                    if (khet.interactionPoints) {
                        khet.interactionPoints.forEach(point => {
                            const markerGeometry = new THREE.SphereGeometry(0.1, 10, 10);
                            const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
                            const marker = new THREE.Mesh(markerGeometry, markerMaterial);
                            marker.position.set(point.position[0], point.position[1], point.position[2]);
                            object.add(marker); // Attach marker to the Khet object
                        });
                        object.userData.interactionPoints = khet.interactionPoints;
                    }

                    // Return Variables
                    result.mesh = object;
                    result.body = rigidBody;
                    result.isAvatar = isAvatar;

                    resolve();
                } catch (error) {
                    console.error(`Error processing Khet ${khetId}:`, error);
                    resolve(); // Still resolve to continue loading other Khets
                }
            }, (error) => {
                console.error(`GLTF parse error for Khet ${khetId}:`, error);
                resolve(); // Resolve even on error to avoid hanging
            });
        });
    } catch (error) {
        console.error('Error loading Khet:', error);
    }
    return result;
}

// **Clear All Khets**
// Clear all Khets from the backend and storage canisters
export async function clearAllKhets() {

    const backendActor = await getUserNodeActor();

    try {
        await backendActor.clearAllKhets();
        console.log('All Khets cleared successfully');
    } catch (error) {
        console.error('Error clearing Khets:', error);
    }
}
