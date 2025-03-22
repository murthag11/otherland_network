// Import necessary libraries for parsing and interacting with the Internet Computer
import * as esprima from 'esprima';
import { Actor, HttpAgent } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { idlFactory as backendIdlFactory } from '../../declarations/user_node';
import { idlFactory as storageIdlFactory } from '../../declarations/storage'; // Adjust path after dfx generate
import { nodeSettings, getUserCanisterId, getStorageCanisterId } from './nodeManager.js';
import { editProperty, pickupObject } from './interaction.js';
import { authReady, getIdentity } from './user.js';
import { avatarState } from './avatar.js';
import { online } from './peermesh.js';
import { updateKhetTable } from './menu.js';

// Compute SHA-256 hash of a Uint8Array
async function computeSHA256(data) {
    const buffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// IndexedDB Cache Setup
const DB_NAME = 'KhetCache';
const STORE_NAME = 'assets';
const DB_VERSION = 1;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        };
    });
}

async function getFromCache(id) {
    //console.log("DB retrieval, ID: " + id);
    const db = await openDB();
    return new Promise((resolve, reject) => {
        //console.log("reading...");
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => {
            const data = request.result ? request.result.data : null;
            //console.log(`Retrieved from cache for ID ${id}: ${data ? 'data found' : 'no data'}`);
            resolve(data);
        };
        request.onerror = () => {
            console.error(`Error retrieving from cache for ID ${id}:`, request.error);
            reject(request.error);
        };
        transaction.oncomplete = () => db.close();
    });
}

async function saveToCache(id, data) {
    //console.log("DB storage, ID: " + id);
    const db = await openDB();
    return new Promise((resolve, reject) => {
        //console.log("writing...");
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put({ id, data });
        request.onsuccess = () => {
            //console.log(`Successfully cached data for ID ${id}`);
            resolve();
        };
        request.onerror = () => {
            console.error(`Error saving to cache for ID ${id}:`, request.error);
            reject(request.error);
        };
        transaction.oncomplete = () => db.close();
    });
}

// Khet Controller
export const khetController = {
    khets: {}, // { khetId: khet }

    // Load all Khets from the backend
    async loadAllKhets() {
        
        let allKhets = [];

        if (nodeSettings.nodeType == 1) {

            if (online.khetsAreLoaded) {
                console.log("Khets already loaded from Peer Network");

                // Get list from peer
                this.khets = online.khets;

                // Prepare return value
                allKhets = Object.values(this.khets);

                // Save Khets to Cache
                for (const [khetId, khet] of Object.entries(this.khets)) {
                    await saveToCache(khetId, khet); // Wait for each save to complete
                  }
                return allKhets;
            } else {
                console.log("Still loading Khets from Peer Network");
                return [];
            }

        } else if (nodeSettings.nodeType == 0) {

            // Load from Cache only


        } else {

            console.log("Loading Khet List from Node Backend");

            // Wait for authentication to complete
            await authReady;
        
            // Set up the agent to communicate with the node
            const agent = new HttpAgent({ host: window.location.origin, identity: getIdentity() });
            if (process.env.DFX_NETWORK === 'local') { await agent.fetchRootKey().catch(err => console.warn('Unable to fetch root key:', err)); }
            const backendActor = Actor.createActor(backendIdlFactory, { agent, canisterId: nodeSettings.nodeId });
            const storageActor = Actor.createActor(storageIdlFactory, { agent, canisterId: nodeSettings.storageId });

            try {
                const backendKhets = await backendActor.getAllKhets();
                console.log(`Backend returned ${backendKhets.length} Khets`);
        
                // Merge with cached Khets
                for (const khet of backendKhets) {
                    this.khets[khet.khetId] = khet;
                    
                    // Load 3D asset from cache or storage canister
                    const cachedKhet = await getFromCache(khet.khetId);
                    if (cachedKhet && cachedKhet.gltfData) {
                        khet.gltfData = cachedKhet.gltfData;
                        console.log(`Loaded 3D asset for Khet ${khet.khetId} from cache`);
                    } else {
                        const [storageCanisterId, blobId, gltfDataSize] = khet.gltfDataRef;
                        const CHUNK_SIZE = 1024 * 1024;
                        const totalChunks = Math.ceil(Number(gltfDataSize) / CHUNK_SIZE);
                        let gltfDataChunks = [];
                        for (let i = 0; i < totalChunks; i++) {
                            const chunkOpt = await storageActor.getBlobChunk(blobId, i);
                            if (chunkOpt && chunkOpt.length > 0) {
                                gltfDataChunks.push(chunkOpt[0]);
                            } else {
                                console.warn(`Failed to fetch chunk ${i} for Khet ${khet.khetId}, skipping 3D asset`);
                                break;
                            } 
                        }
                        if (gltfDataChunks.length === totalChunks) {
                            khet.gltfData = new Uint8Array(Number(gltfDataSize));
                            let offset = 0;
                            for (const chunk of gltfDataChunks) {
                                khet.gltfData.set(new Uint8Array(chunk), offset);
                                offset += chunk.length;

                            } 
                        }
                        await saveToCache(khet.khetId, khet);
                        console.log(`Loaded and cached 3D asset for Khet ${khet.khetId} from storage`);
                    }
                    allKhets.push(khet);
                }
                console.log(`Total Khets loaded from backend: ${allKhets.length}`);
                return allKhets;
            } catch (error) {
                console.error('Error loading all Khets:', error);
                return [];
            }
        }
    },

    // Get a specific Khet by ID
    getKhet(khetId) {
        return this.khets[khetId] || null;
    },

    // Get all avatars
    getAvatars() {
        console.log('All Khets before filtering:', khetController.khets);
        const avatars = Object.values(this.khets).filter(khet => khet.khetType === 'Avatar');
        console.log('Filtered Avatars:', avatars);
        return avatars;
    },

    clearKhet() {
        this.khets = {};
        return;
    }
};

// **Khet Type Mapping**
// Function to map string representations of Khet types to Motoko variants
export function mapKhetType(typeStr) {
    switch (typeStr) {
      case 'SceneObject': return "SceneObject";
      case 'InteractiveObject': return "InteractiveObject";
      case 'MobileObject': return "MobileObject";
      case 'Entity': return "Entity";
      case 'Avatar': return "Avatar";
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
export async function createKhet(file, khetTypeStr, textures = {}, code = null, interactionPoints = null) {
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
            computeSHA256(gltfData).then(hash => {
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
                            gltfDataRef: [],
                            gltfDataSize: gltfData.byteLength,
                            position: [posX, posY, posZ], // Use input values for position
                            originalSize: [originalSize.x, originalSize.y, originalSize.z],
                            scale: [scaleX, scaleY, scaleZ], // Use input values for scale
                            textures: textureArray.length > 0 ? textureArray : [],
                            animations,
                            code: code ? [code] : [],
                            interactionPoints: interactionPoints ? [interactionPoints] : [],
                            hash
                        });
                    });
                });
            });
        };
        reader.readAsArrayBuffer(file); // Start reading the file
    });
}

// **Upload Khet to Canisters**
// Upload the Khet to the storage and backend canisters
export async function uploadKhet(khet) {

    // Wait for authentication to complete
    await authReady;

    // Set up the agent to communicate with the backend
    const agent = new HttpAgent({ host: window.location.origin, identity: getIdentity() });
    if (process.env.DFX_NETWORK === 'local') { await agent.fetchRootKey().catch(err => console.warn('Unable to fetch root key:', err)); }
    const backendActor = Actor.createActor(backendIdlFactory, { agent, canisterId: nodeSettings.nodeId });
    const storageActor = Actor.createActor(storageIdlFactory, { agent, canisterId: nodeSettings.storageId });

    const CHUNK_SIZE = 2000000; // Little below 2MB chunk size for uploading large files
    const gltfData = khet.gltfData;
    const totalChunks = Math.ceil(gltfData.byteLength / CHUNK_SIZE); // Calculate number of chunks

    // const blobId = crypto.randomUUID(); // Generate a unique blob ID
    // khet.gltfDataRef = [Principal.fromText(storageCanisterId), blobId, khet.gltfDataSize];

    // Save Khet to cache immediately
    await saveToCache(khet.khetId, khet);
    console.log(`Khet ${khet.khetId} cached for immediate use`);

    // Create a metadata-only khet object (exclude the large gltfData)
    const khetMetadata = {
        khetId: khet.khetId,
        khetType: khet.khetType,
        gltfDataSize: khet.gltfData.byteLength,
        gltfDataRef: [], // Will be set by initKhetUpload
        position: khet.position,
        originalSize: khet.originalSize,
        scale: khet.scale,
        textures: khet.textures,
        animations: khet.animations,
        code: khet.code,
        hash: khet.hash
    };
    const result = await backendActor.initKhetUpload(khetMetadata, Principal.fromText(storageCanisterId));

    // Initialize Khet upload in backend with hash check
    let blobId;
    if (result.existing) {
        blobId = result.existing;
        khet.gltfDataRef = [Principal.fromText(storageCanisterId), blobId, khet.gltfDataSize];
        console.log(`Khet ${khet.khetId} reusing existing blobId ${blobId}`); // No upload needed; asset already exists
        

        // Hide the progress bar
        document.getElementById("upload-bar").innerHTML = "Asset Already Uploaded";
        setTimeout(() => {
            document.getElementById('upload-container').style.display = 'none';
        }, 2000);

        return khet;

    } else if (result.new) {
        blobId = result.new;
        khet.gltfDataRef = [Principal.fromText(storageCanisterId), blobId, khet.gltfDataSize];
        console.log(`Khet ${khet.khetId} initialized with new blobId ${blobId}`);
    } else {
        throw new Error('Unexpected response from initKhetUpload');
    }

    // Perform upload in the background
    (async () => {
        try {
            const totalChunks = Math.ceil(gltfData.byteLength / CHUNK_SIZE);
            for (let i = 0; i < totalChunks; i++) {
                const start = i * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, gltfData.byteLength);
                const chunk = gltfData.subarray(start, end);
                const chunkBlob = new Blob([chunk]);
                console.log(`Uploading chunk ${i + 1} of ${totalChunks} for blobId: ${blobId}, size: ${chunk.length} bytes`);
                await storageActor.storeBlobChunk(blobId, i, new Uint8Array(await chunkBlob.arrayBuffer()));
            }

            // Finalize the Khet upload
            const finalizeResult = await backendActor.finalizeKhetUpload(khet.khetId, Principal.fromText(storageCanisterId), blobId, totalChunks);
            if (finalizeResult && finalizeResult.length > 0) {
                throw new Error(`Finalize failed: ${finalizeResult[0]}`);
            }

            // Hide the progress bar
            document.getElementById("upload-bar").innerHTML = "Asset Upload Complete";
            setTimeout(() => {
                document.getElementById('upload-container').style.display = 'none';
            }, 2000);

            console.log(`Khet ${khet.khetId} upload finalized successfully`);
            updateKhetTable();
        } catch (error) {
            console.error('Background upload failed:', error);
            await storageActor.deleteBlob(blobId); // Clean up on failure
            await backendActor.abortKhetUpload(khet.khetId); // Clean up pending khet

            // Hide the progress bar
            document.getElementById("upload-bar").innerHTML = "Error Uploading Asset";
            setTimeout(() => {
                document.getElementById('upload-container').style.display = 'none';
            }, 2000);
        }
    })();

    return khet; // Return immediately with the cached reference
}

// Load Remote Avatar Mesh but no physics
export async function loadKhetMeshOnly(khetId, scene) {
    const khet = khetController.getKhet(khetId);
    if (!khet || !khet.gltfData) {
        console.error(`Khet ${khetId} not found or no gltfData`);
        return null;
    }
    const loader = new THREE.GLTFLoader();
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
export async function loadKhet(khetId, { scene, sceneObjects, world, groundMaterial, animationMixers, khetState }) {

    // Wait for authentication to complete
    await authReady;

    // Set up the agent to communicate with the backend
    const agent = new HttpAgent({ host: window.location.origin, identity: getIdentity() });
    if (process.env.DFX_NETWORK === 'local') { await agent.fetchRootKey().catch(err => console.warn('Unable to fetch root key:', err)); }
    const backendActor = Actor.createActor(backendIdlFactory, { agent, canisterId: nodeSettings.nodeId });
    
    let result = { mesh: null, body: null, isAvatar: false };

    // Load Khet
    try {
        
        // Check cache for the entire khet object first with khetId
        let cachedKhet = await getFromCache(khetId);
        let gltfData = cachedKhet ? cachedKhet.gltfData : null;
        console.log(`Cache check for khetId ${khetId}: ${cachedKhet ? 'found' : 'not found'}`);
        
        // Check Backend canister for Khet data
        let khet;
        const khetOpt = await backendActor.getKhet(khetId);
        if (khetOpt && khetOpt.length > 0) {
             khet = khetOpt[0];
        } else {

            // Construct a temporary khet object if backend metadata isn’t ready
            console.log(`No Khet found with ID: ${khetId} in backend, using cache if available`);
            if (!gltfData) {
                throw new Error(`Khet ${khetId} not found in cache or backend`);
            }
            khet = cachedKhet; // Use the full cached khet object
        }

        // Use gltfData from cache if available, otherwise fetch from canister
        if (!gltfData) {

            // Prepare fetching chunks from Storage
            const [storageCanisterId, blobId, gltfDataSize] = khet.gltfDataRef;
            const storageActor = Actor.createActor(storageIdlFactory, { agent, canisterId: storageCanisterId });

            // Calculate chunks
            const CHUNK_SIZE = 1024 * 1024; // 1MB
            const totalChunks = Math.ceil(Number(gltfDataSize) / CHUNK_SIZE);
            console.log(`Loading Khet ${khetId} with ${totalChunks} chunks, total size: ${gltfDataSize} bytes`);

            // Load chunks from Storage canister
            let gltfDataChunks = [];
            for (let i = 0; i < totalChunks; i++) {
                const chunkOpt = await storageActor.getBlobChunk(blobId, i);
                if (chunkOpt && chunkOpt.length > 0) {
                    gltfDataChunks.push(chunkOpt[0]);
                } else {
                    throw new Error(`Failed to fetch chunk ${i} for blobId: ${blobId}`);
                }
            }

            // Reassemble Chunks to Khet
            gltfData = new Uint8Array(Number(gltfDataSize));
            let offset = 0;
            for (const chunk of gltfDataChunks) {
                gltfData.set(new Uint8Array(chunk), offset);
                offset += chunk.length;
            }

            // Save to cache after downloading
            khet.gltfData = gltfData; // Update the khet object with fetched gltfData
            await saveToCache(khetId, khet); // Save updated khet object
            console.log(`Cached Khet ${khetId} with khetId ${khetId}`);
        } else {
            console.log(`Loaded Khet ${khetId} from cache with khetId ${khetId}`);
        }

        // Load Object into World
        if (!gltfData) {
            throw new Error(`No gltfData available for Khet ${khetId}`);
        }
        const loader = new THREE.GLTFLoader();
        await new Promise((resolve) => {
            loader.parse(gltfData.buffer, '', (gltf) => {
                
                console.log(`Parsing GLTF for Khet ${khetId}`);
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

                // Physics body setup
                let shape, body;
                const isAvatar = khet.khetType == 'Avatar';
                const debugPhysics = false;
                let debugMesh; 

                // Avatar Physics
                if (isAvatar) {
                    
                    // Sphere for Avatar
                    const radius = size.y / 2;
                    shape = new CANNON.Sphere(radius);
                    body = new CANNON.Body({ mass: 1, material: new CANNON.Material('avatar') });
                    body.addShape(shape);
                    
                    // Position body so bottom is at khet.position[1]
                    body.position.set(khet.position[0], khet.position[1] + radius, khet.position[2]);
                    object.position.y = body.position.y - radius;
                    object.rotation.y = Math.PI;
                    body.fixedRotation = true;

                    if (debugPhysics) {
                        const geometry = new THREE.SphereGeometry(radius, 16, 16);
                        const material = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
                        debugMesh = new THREE.Mesh(geometry, material);
                        debugMesh.position.copy(body.position);
                        scene.add(debugMesh);
                    }
                } else {

                    // Object Physics
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
                }

                // Common physics properties
                body.linearDamping = 0.9;
                body.angularDamping = 0.9;
                world.addBody(body);
                object.userData = { body, debugMesh };
                console.log(`Khet ${khetId} initial position:`, object.position, 'Body position:', body.position);

                // Avatar
                if (isAvatar) {
                    const contactMaterial = new CANNON.ContactMaterial(groundMaterial, body.material, {
                        friction: 0.3,
                        restitution: 0.0
                    });
                    world.addContactMaterial(contactMaterial);
                    body.isGrounded = false;
                    body.lastSurfaceHeight = 0;
                    body.sizeY = size.y || 1;
                    object.sizeY = size.y || 1;
                }

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
                        const texture = textureLoader.load(URL.createObjectURL(new Blob([blob])));
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
                    khetState.executors.push(executor);
                }

                // Interaction Points
                if (khet.khetId && !isAvatar) {
                    khet.interactionPoints = [
                        {
                            position: [0, 0.5, 0],
                            type: 'edit',
                            content: { property: 'color', value: 'red' },
                            action: editProperty
                        },
                        {
                            position: [1, 1, 1],
                            type: 'pickup',
                            content: null,
                            action: pickupObject
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
                }

                // Return Variables
                result.mesh = object;
                result.body = body;
                result.isAvatar = isAvatar;

                resolve();
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

    // Wait for authentication to complete
    await authReady;

    // Set up the agent to communicate with the backend
    const agent = new HttpAgent({ host: window.location.origin, identity: getIdentity() });
    if (process.env.DFX_NETWORK === 'local') { await agent.fetchRootKey().catch(err => console.warn('Unable to fetch root key:', err)); }
    const backendActor = Actor.createActor(backendIdlFactory, { agent, canisterId: nodeSettings.nodeId });

    try {
        await backendActor.clearAllKhets(Principal.fromText(storageCanisterId));
        console.log('All Khets cleared successfully');
    } catch (error) {
        console.error('Error clearing Khets:', error);
    }
}