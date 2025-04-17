// Import External Dependencies
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import * as esprima from 'esprima';

// Import necessary libraries for parsing and interacting with the Internet Computer
import { Actor, HttpAgent } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { idlFactory as userNodeIdlFactory } from '../../declarations/user_node';

// Import Internal Modules
import { nodeSettings } from './nodeManager.js';
import { authReady, getIdentity } from './user.js';
import { online } from './peermesh.js';
import { updateKhetTable } from './menu.js';
import { viewerState } from './index.js';

// Cardinal canister ID
const CARDINAL_CANISTER_ID = 'bkyz2-fmaaa-aaaaa-qaaaq-cai';

let agentInstance = null;
let userNodeActor = null;

// Initialize cardinal agent actor with user identity
export async function getUserNodeActor() {

    // Create HTTP Agent with Internet Identity
    if (!agentInstance) {

        await authReady;

        agentInstance = new HttpAgent({ 
            host: process.env.DFX_NETWORK === 'local' ? 'http://localhost:4943' : window.location.origin, 
            identity: getIdentity() 
        });

        if (process.env.DFX_NETWORK === 'local') {
            try {
                await agentInstance.fetchRootKey();
                console.log('Root key fetched successfully');
            } catch (err) {
                console.error('Unable to fetch root key:', err);
                throw err;
            }
        }
    }

    // Create actor for the cardinal canister
    if (!userNodeActor) {
        userNodeActor = Actor.createActor(userNodeIdlFactory, { 
            agent: agentInstance, 
            canisterId: nodeSettings.nodeId
        });
    }

    return userNodeActor;
}

// Compute SHA-256 hash of a Uint8Array
export async function computeSHA256(data) {
    const buffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// IndexedDB Cache Setup
const DB_NAME = 'KhetCache';
const STORE_NAME = 'assets';
const DB_VERSION = 2;

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

export async function getFromCache(id) {
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

export async function saveToCache(id, data) {
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
        this.khets = {};
    
        if (nodeSettings.nodeType == 0) { // Own TreeHouse: Load khets from local storage
            for (const [khetId, khetMetadata] of Object.entries(nodeSettings.localKhets)) {

                // Get 3D data from cache
                const cachedKhet = await getFromCache(khetId);
                if (cachedKhet && cachedKhet.gltfData) {
                    const khet = { ...khetMetadata, gltfData: cachedKhet.gltfData };
                    this.khets[khetId] = khet;
                    allKhets.push(khet);
                } else {
                    console.warn(`Khet ${khetId} in localKhets missing gltfData in cache`);
                }
            }
            console.log(`Loaded ${allKhets.length} Khets from TreeHouse`);
            return allKhets;
            
        } else if (nodeSettings.nodeType == 1) {// Friend's TreeHouse: Load from online.khets via PeerJS
            for (const [khetId, khet] of Object.entries(online.khets)) {
                khetController.khets[khetId] = { ...khetController.khets[khetId], gltfData: khet.gltfData };
            }
            if (online.khetsAreLoaded) {
                console.log("Loading Khets from Peer Network");
                this.khets = { ...online.khets }; // Clone to avoid direct reference issues
                allKhets = Object.values(this.khets);
    
                // Ensure gltfData is present; fetch from cache or request from peer if missing
                for (const [khetId, khet] of Object.entries(this.khets)) {
                    if (!khet.gltfData) {
                        const cachedKhet = await getFromCache(khetId);
                        if (cachedKhet && cachedKhet.gltfData) {
                            khet.gltfData = cachedKhet.gltfData;
                            console.log(`Loaded gltfData for Khet ${khetId} from cache`);
                        } else {

                            // Request gltfData from the peer (host)
                            try {
                                const fullKhet = await online.requestGltfData(khetId);
                                if (fullKhet && fullKhet.gltfData) {
                                    khet.gltfData = fullKhet.gltfData;
                                    await saveToCache(khetId, khet);
                                    console.log(`Fetched gltfData for Khet ${khetId} from peer`);
                                } else {
                                    console.warn(`Failed to fetch gltfData for Khet ${khetId} from peer`);
                                }
                            } catch (error) {
                                console.error(`Error fetching gltfData for Khet ${khetId}:`, error);
                            }
                        }
                    } else {
                        await saveToCache(khetId, khet); // Cache if gltfData is already present
                    }
                }
                return allKhets;
            } else {
                console.log("Still loading Khets from Peer Network");
                return [];
            }
        } else { // Own Node (2) or Otherland Node (3): Load from user_node
            console.log("Loading Khet List from Node Backend");
            const backendActor = await getUserNodeActor();
            try {
                const backendKhets = await backendActor.getAllKhets();
                console.log(`Backend returned ${backendKhets.length} Khets`);
                for (const khet of backendKhets) {
                    this.khets[khet.khetId] = khet;

                    // Get 3D data from cache
                    const cachedKhet = await getFromCache(khet.khetId);
                    if (cachedKhet && cachedKhet.gltfData) {
                        khet.gltfData = cachedKhet.gltfData;
                        console.log(`Loaded gltfData for Khet ${khet.khetId} from cache`);

                    } else { // Get 3D data from user_node
                        const [nodeId, blobId, gltfDataSize] = khet.gltfDataRef;
                        const CHUNK_SIZE = 1024 * 1024;
                        const totalChunks = Math.ceil(Number(gltfDataSize) / CHUNK_SIZE);
                        let gltfDataChunks = [];
                        for (let i = 0; i < totalChunks; i++) {
                            const chunkOpt = await backendActor.getBlobChunk(blobId, i);
                            if (chunkOpt && chunkOpt.length > 0) {
                                gltfDataChunks.push(chunkOpt[0]);
                            } else {
                                console.warn(`Failed to fetch chunk ${i} for Khet ${khet.khetId}`);
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
                    }
                    allKhets.push(khet);
                }
                console.log(`Total Khets loaded from backend: ${allKhets.length}`);
                return allKhets;
            } catch (error) {
                console.error('Error loading all Khets from backend:', error);
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

    // Remove a Khet from the list, but keep the asset in cache
    async removeEntry(khetId) {
        if (nodeSettings.nodeType == 0) {

            // Remove from treehouse metadata and persist
            delete nodeSettings.localKhets[khetId];
            nodeSettings.saveLocalKhets();
            delete this.khets[khetId];
        } else if (nodeSettings.nodeType == 2) {

            // Existing logic for Own Node
            const backendActor = await getUserNodeActor();
            await backendActor.removeKhet(khetId);
            delete this.khets[khetId];
        } else {
            console.warn(`Cannot remove Khet for nodeType ${nodeSettings.nodeType}`);
        }
    },

    // Removes all khets
    clearKhet() {
        if (nodeSettings.nodeType == 0) {
            nodeSettings.localKhets = {};
            nodeSettings.saveLocalKhets();
        }
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

    // Define supported pre-approved interactions
    const supportedInteractions = ['editProperty'];

    return new Promise((resolve) => {
        reader.onload = () => {
            const gltfData = new Uint8Array(reader.result); // Read file as binary data
            computeSHA256(gltfData).then(hash => {
                const loader = new GLTFLoader();
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
                            supportedInteractions, // Array of pre-approved function names
                            interactionPoints: [], // Expect array of interaction points
                            hash
                        });
                    });
                });
            });
        };
        reader.readAsArrayBuffer(file); // Start reading the file
    });
}

// **Khet Upload Handling**
// Listen for button click to upload a Khet
document.getElementById('upload-btn').addEventListener('click', async () => {
    const fileInput = document.getElementById('upload-khet');
    const files = fileInput.files;
    
    // Check if at least one file is selected
    if (files.length === 0) {
        alert('Please select a file to upload.');
        return;
    }
    
    const file = files[0]; // Get the first selected file
    const textures = files[1] ? { 'texture1': files[1] } : {}; // Optional texture file
    const khetType = document.getElementById('khet-type').value; // Get selected Khet type
    
    try {
        // Read Code from Input or Agent
        console.log(khetType);
        
        let khetCode = '';
        if (khetType == 'SceneObject') {
        } else {
            khetCode = '';
        }
        
        // Create a Khet object with a simple rotation behavior
        const khet = await createKhet(file, khetType, textures, khetCode);
        
        // Upload the Khet to the node
        const khetWithRef = await uploadKhet(khet);
        
        // Clear the file input after successful upload
        fileInput.value = '';

        document.getElementById("upload-container").style.display = "block";
    } catch (error) {
        console.error('Upload process failed:', error);
    }
});

// Add to Cache
document.getElementById('cache-btn').addEventListener('click', async () => {
    const fileInput = document.getElementById('upload-khet');
    const files = fileInput.files;
    if (files.length === 0) {
        alert('Please select a file to upload.');
        return;
    }
    const file = files[0];
    const textures = files[1] ? { 'texture1': files[1] } : {};
    const khetType = document.getElementById('khet-type').value;
    try {
        console.log(khetType);
        
        let khetCode = '';
        if (khetType == 'SceneObject') {
        } else {
            // khetCode = 'object.rotation.y += 0.01;';
        }

        const khet = await createKhet(file, khetType, textures, khetCode);

        // Save full Khet (including gltfData) to cache
        await saveToCache(khet.khetId, khet);

        // Save metadata (without gltfData) to nodeSettings.localKhets
        const khetMetadata = { ...khet };
        delete khetMetadata.gltfData; // Exclude large blob data
        nodeSettings.localKhets[khet.khetId] = khetMetadata;
        nodeSettings.saveLocalKhets();

        // Add full Khet to khetController.khets for immediate use
        khetController.khets[khet.khetId] = khet;

        fileInput.value = '';
        console.log(`Khet ${khet.khetId} saved to treehouse`);
        await updateKhetTable();
    } catch (error) {
        console.error('Error saving Khet to treehouse:', error);
    }
});

// **Upload Khet to Canisters**
// Upload the Khet to the storage and backend canisters
export async function uploadKhet(khet) {

    // Wait for authentication to complete
    const backendActor = await getUserNodeActor();

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
        supportedInteractions: khet.supportedInteractions,
        interactionPoints: khet.interactionPoints,
        hash: khet.hash
    };
    const result = await backendActor.initKhetUpload(khetMetadata);

    // Initialize Khet upload in backend with hash check
    let blobId;
    if (result.existing) {
        blobId = result.existing;
        khet.gltfDataRef = [Principal.fromText(nodeSettings.nodeId), blobId, khet.gltfDataSize];
        console.log(`Khet ${khet.khetId} reusing existing blobId ${blobId}`); // No upload needed; asset already exists
        

        // Hide the progress bar
        document.getElementById("upload-bar").innerHTML = "Asset Already Uploaded";
        setTimeout(() => {
            document.getElementById('upload-container').style.display = 'none';
        }, 2000);

        return khet;

    } else if (result.new) {
        blobId = result.new;
        khet.gltfDataRef = [Principal.fromText(nodeSettings.nodeId), blobId, khet.gltfDataSize];
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
                await backendActor.storeBlobChunk(blobId, i, new Uint8Array(await chunkBlob.arrayBuffer()));
            }

            // Finalize the Khet upload
            const finalizeResult = await backendActor.finalizeKhetUpload(khet.khetId, blobId, totalChunks);
            if (finalizeResult && finalizeResult.length > 0) {
                throw new Error(`Finalize failed: ${finalizeResult[0]}`);
            }

            // Hide the progress bar
            document.getElementById("upload-bar").innerHTML = "Asset Upload Complete";
            setTimeout(() => {
                document.getElementById('upload-container').style.display = 'none';
            }, 2000);

            console.log(`Khet ${khet.khetId} upload finalized successfully`);
            await updateKhetTable();
        } catch (error) {
            console.error('Background upload failed:', error);
            await backendActor.deleteBlob(blobId); // Clean up on failure
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
            console.error(`gltfData missing for Khet ${khetId} in khetController`);
            return result;
        }

        const loader = new GLTFLoader();
        await new Promise((resolve) => {
            loader.parse(khet.gltfData.buffer, '', (gltf) => {
                
                try {
                    console.log(`Parsing GLTF for Khet ${khetId}`);
                    const object = gltf.scene;

                    // Scale Object
                    object.scale.set(khet.scale[0], khet.scale[1], khet.scale[2]);

                    // Add Object to Scene
                    viewerState.scene.add(object);
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

                        // Position the mesh relative to the body's center
                        object.position.set(
                            rigidBody.translation().x,
                            rigidBody.translation().y - radius, // Adjust visual mesh position
                            rigidBody.translation().z
                        );
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
                    //rigidBody.setLinearDamping(0.9);
                    //rigidBody.setAngularDamping(0.9);
                    //object.userData = { rigidBody, debugMesh };
                    object.userData.body = rigidBody;
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