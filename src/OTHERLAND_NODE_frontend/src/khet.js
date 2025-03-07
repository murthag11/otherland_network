// Import necessary libraries for parsing and interacting with the Internet Computer
import * as esprima from 'esprima';
import { Actor, HttpAgent } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { idlFactory as backendIdlFactory } from '../../declarations/OTHERLAND_NODE_backend';
import { idlFactory as storageIdlFactory } from '../../declarations/Storage'; // Adjust path after dfx generate

// **Khet Type Mapping**
// Function to map string representations of Khet types to Motoko variants
export function mapKhetType(typeStr) {
    switch (typeStr) {
        case 'SceneObject': return { SceneObject: null };
        case 'InteractiveObject': return { InteractiveObject: null };
        case 'MobileObject': return { MobileObject: null };
        case 'Entity': return { Entity: null };
        case 'Avatar': return { Avatar: null };
        default: throw new Error(`Unknown khetType: ${typeStr}`);
    }
}

// **Khet Code Interpreter**
// Simple interpreter for Khet code using Esprima to parse and validate expressions
export function createKhetCodeExecutor(code, object) {
    try {
        const ast = esprima.parseScript(code); // Parse the code into an Abstract Syntax Tree (AST)
        if (ast.body.length !== 1 || ast.body[0].type !== 'ExpressionStatement') {
            console.warn(`Khet code must be a single expression: ${code}`);
            return () => {};
        }
        const expr = ast.body[0].expression;
        if (expr.type !== 'AssignmentExpression' || !['=', '+=', '-=', '*=', '/='].includes(expr.operator)) {
            console.warn(`Unsupported operation in Khet code: ${code}`);
            return () => {};
        }
        const left = expr.left;
        if (left.type !== 'MemberExpression' || 
            left.object.type !== 'MemberExpression' || 
            left.object.object.type !== 'Identifier' || 
            left.object.object.name !== 'object') {
            console.warn(`Khet code must assign to object.property.axis: ${code}`);
            return () => {};
        }
        const property = left.object.property.name;
        const axis = left.property.name;
        const allowedProperties = ['rotation', 'position', 'scale'];
        if (!allowedProperties.includes(property) || !['x', 'y', 'z'].includes(axis)) {
            console.warn(`Invalid property or axis in Khet code: ${code}`);
            return () => {};
        }
        const right = expr.right;
        if (right.type !== 'Literal' || typeof right.value !== 'number') {
            console.warn(`Khet code right-hand side must be a number: ${code}`);
            return () => {};
        }
        const value = right.value;
        const operator = expr.operator;
        // Return a function that executes the validated assignment operation
        return () => {
            switch (operator) {
                case '=': object[property][axis] = value; break;
                case '+=': object[property][axis] += value; break;
                case '-=': object[property][axis] -= value; break;
                case '*=': object[property][axis] *= value; break;
                case '/=': object[property][axis] /= value; break;
            }
        };
    } catch (error) {
        console.error(`Error parsing Khet code: ${code}`, error);
        return () => {};
    }
}

// **Khet Constructor**
// Asynchronously create a Khet object from a file and user inputs
export async function createKhet(file, khetTypeStr, textures = {}, code = null) {
    const khetId = crypto.randomUUID(); // Generate a unique ID for the Khet
    const khetType = mapKhetType(khetTypeStr); // Map the type string to a Motoko variant
    const reader = new FileReader();

    // Retrieve position and scale from input fields
    const posX = parseFloat(document.getElementById('pos-x').value) || 0;
    const posY = parseFloat(document.getElementById('pos-y').value) || 0;
    const posZ = parseFloat(document.getElementById('pos-z').value) || 0;
    const scaleX = parseFloat(document.getElementById('scale-x').value) || 1;
    const scaleY = parseFloat(document.getElementById('scale-y').value) || 1;
    const scaleZ = parseFloat(document.getElementById('scale-z').value) || 1;

    return new Promise((resolve) => {
        reader.onload = () => {
            const gltfData = new Uint8Array(reader.result); // Read file as binary data
            const loader = new THREE.GLTFLoader();
            loader.parse(gltfData.buffer, '', (gltf) => {
                const object = gltf.scene; // Extract the scene from the GLTF data
                const box = new THREE.Box3().setFromObject(object); // Compute bounding box
                const originalSize = box.getSize(new THREE.Vector3()); // Get size of the object
                const animations = gltf.animations.length > 0 
                    ? gltf.animations.map(a => [a.name]) // List animation names if present
                    : [];
                // Prepare texture blobs for upload
                const textureBlobs = Object.entries(textures)
                    .filter(([_, file]) => file instanceof File)
                    .map(([name, file]) => {
                        return new Promise((resolveTexture) => {
                            const textureReader = new FileReader();
                            textureReader.onload = () => resolveTexture([name, new Uint8Array(textureReader.result)]);
                            textureReader.readAsArrayBuffer(file);
                        });
                    });
                Promise.all(textureBlobs).then((textureArray) => {
                    resolve({
                        khetId,
                        khetType,
                        gltfData,
                        gltfDataSize: gltfData.byteLength,
                        position: [posX, posY, posZ], // Use input values for position
                        originalSize: [originalSize.x, originalSize.y, originalSize.z],
                        scale: [scaleX, scaleY, scaleZ], // Use input values for scale
                        textures: textureArray.length > 0 ? textureArray : [],
                        animations,
                        code: code ? [code] : []
                    });
                });
            });
        };
        reader.readAsArrayBuffer(file); // Start reading the file
    });
}

// **Upload Khet to Canisters**
// Upload the Khet to the storage and backend canisters
export async function uploadKhet(khet, storageCanisterId = 'be2us-64aaa-aaaaa-qaabq-cai') { // Default storage canister ID
    const agent = new HttpAgent({ host: 'http://127.0.0.1:4943' }); // Local agent for development
    if (process.env.DFX_NETWORK === 'local') {
        await agent.fetchRootKey().catch(err => console.warn('Unable to fetch root key:', err));
    }
    const backendActor = Actor.createActor(backendIdlFactory, { agent, canisterId: 'bkyz2-fmaaa-aaaaa-qaaaq-cai' });
    const storageActor = Actor.createActor(storageIdlFactory, { agent, canisterId: storageCanisterId });

    const CHUNK_SIZE = 1024 * 1024; // 1MB chunk size for uploading large files
    const gltfData = khet.gltfData;
    const totalChunks = Math.ceil(gltfData.byteLength / CHUNK_SIZE); // Calculate number of chunks
    const blobId = crypto.randomUUID(); // Generate a unique blob ID

    try {
        // Upload each chunk to the storage canister
        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, gltfData.byteLength);
            const chunk = gltfData.subarray(start, end);
            const chunkBlob = new Blob([chunk]);
            console.log(`Uploading chunk ${i} of ${totalChunks - 1} for blobId: ${blobId}, size: ${chunk.length} bytes`);
            await storageActor.storeBlobChunk(blobId, i, new Uint8Array(await chunkBlob.arrayBuffer()));
        }

        // Create a Khet object with a reference to the uploaded blob
        const khetWithRef = {
            khetId: khet.khetId,
            khetType: khet.khetType,
            gltfDataRef: [Principal.fromText(storageCanisterId), blobId, khet.gltfDataSize],
            position: khet.position,
            originalSize: khet.originalSize,
            scale: khet.scale,
            textures: khet.textures,
            animations: khet.animations,
            code: khet.code
        };

        // Store the Khet metadata in the backend canister
        console.log(`Storing Khet with khetId: ${khet.khetId}, blobId: ${blobId}`);
        const result = await backendActor.storeKhet(khetWithRef, Principal.fromText(storageCanisterId), blobId, totalChunks);
        if (result && result.length > 0) {
            throw new Error(`Store failed: ${result[0]}`);
        }
        console.log(`Khet ${khet.khetId} uploaded successfully`);
    } catch (error) {
        console.error('Error uploading Khet:', error);
        await storageActor.deleteBlob(blobId); // Clean up on failure
        throw error;
    }
}

// **Load and Render Khet**
// Load a Khet by ID and add it to the scene
export async function loadKhet(khetId, { scene, sceneObjects, world, groundMaterial, animationMixers, khetState, cameraController }) {
    const agent = new HttpAgent({ host: 'http://127.0.0.1:4943' });
    if (process.env.DFX_NETWORK === 'local') {
        await agent.fetchRootKey().catch(err => console.warn('Unable to fetch root key:', err));
    }
    const backendActor = Actor.createActor(backendIdlFactory, { agent, canisterId: 'bkyz2-fmaaa-aaaaa-qaaaq-cai' });

    let result = { avatarMesh: null, avatarBody: null };
    try {
        const khetOpt = await backendActor.getKhet(khetId);
        if (khetOpt && khetOpt.length > 0) {
            const khet = khetOpt[0];
            const [storageCanisterId, blobId, gltfDataSize] = khet.gltfDataRef;
            const storageActor = Actor.createActor(storageIdlFactory, { agent, canisterId: storageCanisterId });

            const CHUNK_SIZE = 1024 * 1024; // 1MB
            const totalChunks = Math.ceil(Number(gltfDataSize) / CHUNK_SIZE);
            console.log(`Loading Khet ${khetId} with ${totalChunks} chunks, total size: ${gltfDataSize} bytes`);

            let gltfDataChunks = [];
            for (let i = 0; i < totalChunks; i++) {
                const chunkOpt = await storageActor.getBlobChunk(blobId, i);
                if (chunkOpt && chunkOpt.length > 0) {
                    gltfDataChunks.push(chunkOpt[0]);
                } else {
                    throw new Error(`Failed to fetch chunk ${i} for blobId: ${blobId}`);
                }
            }
            const gltfData = new Uint8Array(Number(gltfDataSize));
            let offset = 0;
            for (const chunk of gltfDataChunks) {
                gltfData.set(new Uint8Array(chunk), offset);
                offset += chunk.length;
            }

            const loader = new THREE.GLTFLoader();
            await new Promise((resolve) => {
                loader.parse(gltfData.buffer, '', (gltf) => {
                    const object = gltf.scene;

                    // Scale Object
                    object.scale.set(khet.scale[0], khet.scale[1], khet.scale[2]);

                    // Add Object to Scene
                    scene.add(object);
                    sceneObjects.push(object);

                    // Compute bounding box and adjust origin
                    const box = new THREE.Box3().setFromObject(object);
                    const size = box.getSize(new THREE.Vector3());
                    const center = box.getCenter(new THREE.Vector3());
                    const minY = box.min.y; // Lowest point on Y-axis

                    // Adjust object position so bottom is at khet.position[1]
                    object.position.set(
                        khet.position[0] - center.x, // Center X
                        khet.position[1] - minY,     // Bottom at khet.position[1]
                        khet.position[2] - center.z  // Center Z
                    );
                    console.log(minY);

                    // Physics body setup
                    let shape;
                    let body;
                    const isAvatar = 'Avatar' in khet.khetType;
                    const isSceneObject = 'SceneObject' in khet.khetType;
                    const debugPhysics = true;
                    let debugMesh; 

                    if (isAvatar) {
                        
                        // Sphere for Avatar
                        const radius = size.y / 2;
                        shape = new CANNON.Sphere(radius);
                        body = new CANNON.Body({ mass: 1, material: new CANNON.Material('avatar') });
                        body.addShape(shape);
                        
                        // Position body so bottom is at khet.position[1]
                        body.position.set(khet.position[0], khet.position[1] + radius, khet.position[2]);
                        object.position.y = body.position.y - radius;
                        body.fixedRotation = true;

                        if (debugPhysics) {
                            const geometry = new THREE.SphereGeometry(radius, 16, 16);
                            const material = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
                            debugMesh = new THREE.Mesh(geometry, material);
                            debugMesh.position.copy(body.position);
                            scene.add(debugMesh);
                        }
                    } else if (isSceneObject) {

                        // Trimesh for SceneObject (static)
                        const vertices = [];
                        const indices = [];
                        object.traverse(child => {
                            if (child.isMesh && child.geometry) {
                                const geometry = child.geometry.isBufferGeometry ? child.geometry : new THREE.BufferGeometry().fromGeometry(child.geometry);
                                const position = geometry.attributes.position;
                                const index = geometry.index;
                                const matrix = child.matrixWorld;
                                for (let i = 0; i < position.count; i++) {
                                    const vertex = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix);
                                    vertices.push(vertex.x, vertex.y, vertex.z);
                                }
                                if (index) {
                                    for (let i = 0; i < index.count; i += 3) {
                                        indices.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
                                    }
                                }
                            }
                        });
                        shape = new CANNON.Trimesh(vertices, indices);
                        body = new CANNON.Body({ mass: 0 });
                        body.addShape(shape);
                        body.position.set(khet.position[0], khet.position[1], khet.position[2]);

                        if (debugPhysics) {
                            const geometry = new THREE.BufferGeometry();
                            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
                            geometry.setIndex(indices);
                            const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
                            debugMesh = new THREE.Mesh(geometry, material);
                            debugMesh.position.copy(body.position);
                            scene.add(debugMesh);
                        }
                    } else {
                        // Box for other types
                        const halfExtents = new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2);
                        shape = new CANNON.Box(halfExtents);
                        body = new CANNON.Body({ 
                            mass: 'MobileObject' in khet.khetType ? 1 : 0,
                            material: new CANNON.Material('khet') 
                        });
                        body.addShape(shape);
                        // Position body so bottom is at khet.position[1]
                        body.position.set(
                            khet.position[0],
                            khet.position[1] + halfExtents.y, // Center of box, bottom at khet.position[1]
                            khet.position[2]
                        );

                        if (debugPhysics) {
                            const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
                            const material = new THREE.MeshBasicMaterial({ color: 0x0000ff, wireframe: true });
                            debugMesh = new THREE.Mesh(geometry, material);
                            debugMesh.position.copy(body.position);
                            scene.add(debugMesh);
                        }
                    }

                    // Common physics properties
                    body.linearDamping = 0.9;
                    body.angularDamping = 0.9;
                    world.addBody(body);
                    object.position.copy(body.position);
                    object.userData = { body, debugMesh };
                    console.log(`Khet ${khetId} initial position:`, object.position, 'Body position:', body.position);

                    if (isAvatar) {
                        const contactMaterial = new CANNON.ContactMaterial(groundMaterial, body.material, {
                            friction: 0.3,
                            restitution: 0.0
                        });
                        world.addContactMaterial(contactMaterial);
                        body.isGrounded = false;
                    }

                    if (khet.animations && khet.animations.length > 0) {
                        console.log(`Khet ${khetId} animations:`, khet.animations);
                        const mixer = new THREE.AnimationMixer(object);
                        khet.animations.forEach(([name]) => {
                            const clip = THREE.AnimationClip.findByName(gltf.animations, name);
                            if (clip) mixer.clipAction(clip).play();
                        });
                        animationMixers.push(mixer);
                    }

                    if (khet.textures && khet.textures.length > 0) {
                        khet.textures.forEach(([name, blob]) => {
                            const textureLoader = new THREE.TextureLoader();
                            const texture = textureLoader.load(URL.createObjectURL(new Blob([blob])));
                            object.traverse(child => {
                                if (child.isMesh && child.material) {
                                    child.material.map = texture;
                                }
                            });
                        });
                    }

                    if (khet.code && khet.code.length > 0) {
                        const executor = createKhetCodeExecutor(khet.code[0], object);
                        khetState.executors.push(executor);
                    }

                    if (isAvatar) {
                        console.log(`Setting avatar for Khet ${khetId}`);
                        result.avatarMesh = object;
                        result.avatarBody = body;
                        result.avatarBody.lastSurfaceHeight = 0;
                        result.avatarBody.sizeY = size.y || 1;
                        result.avatarMesh.sizeY = size.y || 1;
                        cameraController.setTarget(result.avatarMesh);
                    }
                    resolve();
                });
            });
        } else {
            console.log(`No Khet found with ID: ${khetId}`);
        }
    } catch (error) {
        console.error('Error loading Khet:', error);
    }
    return result;
}

// **Load Scene Objects**
// Load all SceneObject Khets into the scene
export async function loadSceneObjects({ scene, sceneObjects, world, groundMaterial, animationMixers, khetState, cameraController }) {
    const agent = new HttpAgent({ host: 'http://127.0.0.1:4943' });
    if (process.env.DFX_NETWORK === 'local') {
        await agent.fetchRootKey().catch(err => console.warn('Unable to fetch root key:', err));
    }
    const backendActor = Actor.createActor(backendIdlFactory, { agent, canisterId: 'bkyz2-fmaaa-aaaaa-qaaaq-cai' });

    try {
        const sceneKhets = await backendActor.getSceneObjectKhets();
        console.log(`Found ${sceneKhets.length} SceneObject Khets`);
        for (const khet of sceneKhets) {
            await loadKhet(khet.khetId, { scene, sceneObjects, world, groundMaterial, animationMixers, khetState, cameraController });
        }
        return sceneKhets.length > 0;
    } catch (error) {
        console.error('Error loading SceneObjects:', error);
        return false;
    }
}

// **Clear All Khets**
// Clear all Khets from the backend and storage canisters
export async function clearAllKhets(storageCanisterId = 'be2us-64aaa-aaaaa-qaabq-cai') {
    const agent = new HttpAgent({ host: 'http://127.0.0.1:4943' });
    if (process.env.DFX_NETWORK === 'local') {
        await agent.fetchRootKey().catch(err => console.warn('Unable to fetch root key:', err));
    }
    const backendActor = Actor.createActor(backendIdlFactory, { agent, canisterId: 'bkyz2-fmaaa-aaaaa-qaaaq-cai' });
    try {
        await backendActor.clearAllKhets(Principal.fromText(storageCanisterId));
        console.log('All Khets cleared successfully');
    } catch (error) {
        console.error('Error clearing Khets:', error);
    }
}