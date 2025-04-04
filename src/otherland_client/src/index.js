// Import External Dependencies
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { WebGPURenderer } from 'three/webgpu';
import RAPIER, { init } from '@dimforge/rapier3d-compat';

// Import Internal Modules
import { khetController, loadKhet } from './khet.js';
import { avatarState } from './avatar.js';
import { animator } from './animation.js';
import { online } from './peermesh.js';
import { nodeSettings } from './nodeManager.js';

// Define Viewer State and init
export const canvas = document.getElementById('canvas');
export const viewerState = {
    scene: null,
    camera: null,
    cameraController: null,
    renderer: null,
    world: null,
    controls: null,
    eventQueue:null,
    characterController: null,

    // Initialize Physics World
    async init () {

        // **Physics World Setup**
        // Initialize Rapier physics world with standard gravity
        await RAPIER.init();
        const gravity = new RAPIER.Vector3(0.0, -9.82, 0.0);
        this.world = new RAPIER.World(gravity);

        // Check WebGPU support
        const isWebGPUSupported = !!navigator.gpu;

        // Function to create renderer with fallback
        function createRenderer(canvas) {
            if (isWebGPUSupported) {
                try {
                    const renderer = new WebGPURenderer({ canvas, antialias: true });
                    console.log('Using WebGPURenderer');
                    return renderer;
                } catch (error) {
                    console.warn('WebGPURenderer failed to initialize:', error);
                }
            }
            const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
            console.log('Using WebGLRenderer');
            return renderer;
        }

        // **Renderer Setup**
        // Get the canvas element from the DOM and initialize the WebGPU / WebGL renderer
        this.renderer = createRenderer(canvas);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        // **Scene and Background**
        // Create scene and camera
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);

        // **Camera and Controls**
        // Set up a perspective camera with a 75-degree FOV
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 1, -2.5); // Position camera slightly above and back from origin

        // Setup Event Queue for Collisions
        this.eventQueue = new RAPIER.EventQueue(true);

        // Setup character controller
        this.characterController = this.world.createCharacterController(0.01); // Small offset from ground
        //this.characterController.setMaxSlopeAngle(Math.PI / 4); // Optional: max slope for grounding (45°)

        // Initialize pointer lock controls for first-person navigation
        this.controls = await new PointerLockControls(this.camera, this.renderer.domElement);

        // Update camera rotation based on mouse movement when controls are locked
        this.controls.domElement.ownerDocument.onmousemove = function(event) {
            if (!viewerState.controls.isLocked) return; // Only proceed if controls are locked
            const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0; // Horizontal mouse delta
            const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0; // Vertical mouse delta
            yaw -= movementX * 0.002; // Adjust yaw (horizontal rotation)
            pitch -= movementY * 0.002; // Adjust pitch (vertical rotation)
            pitch = Math.max(minPitch, Math.min(maxPitch, pitch)); // Clamp pitch to avoid flipping
            const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ'); // Create Euler angle in YXZ order
            viewerState.camera.quaternion.setFromEuler(euler); // Apply rotation to camera
        };

        // **Lighting**
        // Add ambient light to illuminate the entire scene
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(ambientLight);

        // Add directional light for shadows and depth
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(1, 1, 1); // Position light above and to the side
        this.scene.add(directionalLight);

        // Instantiate the camera controller with no initial target
        this.cameraController = new CameraController(this.camera, null);
    }
}

// **Mouse Movement Handling**
// Define pitch constraints to prevent camera flipping
const maxPitch = (85 * Math.PI) / 180; // Max upward angle (85 degrees)
const minPitch = (-85 * Math.PI) / 180; // Max downward angle (-85 degrees)
let pitch = 0; // Current vertical angle
let yaw = 0; // Current horizontal angle

// **Scene Objects and State**
// Arrays and variables to manage scene objects and animations
export const sceneObjects = []; // Store all scene objects
export const animationMixers = []; // Store animation mixers for animated objects

// State object to hold Khet executors (for custom behaviors)
export const khetState = {
    executors: []
};

// **Camera Controller Class**
// Class to manage camera positioning relative to a target (e.g., avatar)
export class CameraController {
    constructor(camera, targetMesh) {
        this.camera = camera; // Reference to the scene camera
        this.target = targetMesh; // Mesh to follow (e.g., avatar)
        this.maxDistance = 2.5; // Maximum distance from target
        this.minDistance = 0.1; // Minimum distance from target
        this.zoomSpeed = 0.1; // Speed of zoom adjustment
        this.scrollFactor = 1.0; // Zoom multiplier
        this.raycaster = new THREE.Raycaster(); // For collision detection
        document.addEventListener('wheel', this.handleScroll.bind(this)); // Listen for scroll events
    }

    // Handle zooming with the mouse wheel
    handleScroll(event) {
        if (!this.target || !viewerState.controls.isLocked) return; // Only zoom if target exists and controls are locked
        const zoomDelta = event.deltaY > 0 ? -this.zoomSpeed : this.zoomSpeed; // Zoom in or out
        this.scrollFactor = (this.scrollFactor || 1.0) + zoomDelta; // Adjust scroll factor
        this.scrollFactor = Math.max(0.5, Math.min(1.5, this.scrollFactor)); // Clamp zoom range
    }

    // Update camera position to follow the target
    update() {
        if (!this.target) return;
    
        // Get the avatar's bounding box and center
        const box = new THREE.Box3().setFromObject(this.target);
        const center = box.getCenter(new THREE.Vector3());
        this.minDistance = box.max.y - box.min.y;
    
        // Camera direction and pitch angle
        const camDirection = new THREE.Vector3();
        this.camera.getWorldDirection(camDirection);
        camDirection.normalize();
        const pitch = Math.asin(Math.max(-1, Math.min(1, camDirection.y)));
        const factor = Math.abs(pitch) / (Math.PI / 2);
        camDirection.y = 0;
        camDirection.normalize();
    
        // Adjusted offsets depending on camera pitch angle
        const aheadOffset = new THREE.Vector3(0, 1, 2.5); // Behind center at same height
        const downOffset = new THREE.Vector3(0, 3, 0);   // Above center when looking down
        const upOffset = new THREE.Vector3(0, -1, 1);  // Below and closer when looking up
        let cameraOffset = (pitch < 0) ? aheadOffset.clone().lerp(downOffset, factor) : aheadOffset.clone().lerp(upOffset, factor);
    
        const horizontalOffset = camDirection.clone().multiplyScalar(-cameraOffset.z);
        const finalOffset = new THREE.Vector3(horizontalOffset.x, cameraOffset.y, horizontalOffset.z);
        const idealPos = center.clone().add(finalOffset); // Use center instead of this.target.position

        // Apply scroll factor while respecting minimal Distance
        const directionToFinal = idealPos.clone().sub(center);
        const baseDistance = directionToFinal.length();
        const scrollFactor = this.scrollFactor || 1.0;
        const adjustedDistance = Math.max(baseDistance * scrollFactor, this.minDistance);
        const adjustedPos = center.clone().add(directionToFinal.normalize().multiplyScalar(adjustedDistance));

        // Raycasting and obstruction checking
        const rayOriginOffset = new THREE.Vector3(0, this.minDistance * 0.5, 0); // 50% of height
        const rayOrigin = center.clone().add(rayOriginOffset);
        const rayDir = adjustedPos.clone().sub(center).normalize();
        this.raycaster.set(rayOrigin, rayDir);
        
        // Check intersections with scene objects (excluding the avatar)
        const objectsToCheck = sceneObjects.filter(obj => obj !== this.target);
        const intersects = this.raycaster.intersectObjects(objectsToCheck, true);
        let finalPos = adjustedPos;

        // Check for obstructions and adjust position
        if (intersects.length > 0 && intersects[0].distance < idealPos.distanceTo(rayOrigin)) {

            // Move camera to 90% of the obstruction distance, but not closer than minDistance
            const newDist = Math.max(intersects[0].distance * 0.9, this.minDistance);
            finalPos = center.clone().add(rayDir.multiplyScalar(newDist));
        } else if (idealPos.distanceTo(center) < this.minDistance) {

            // Ensure camera stays outside avatar if no intersections
            finalPos = center.clone().add(rayDir.multiplyScalar(this.minDistance));
        }

        this.camera.position.copy(finalPos);
    }

    // Set the target mesh and initialize camera position
    setTarget(mesh) {
        this.target = mesh;
        if (mesh) {

            // Compute the bounding box and get the center
            const box = new THREE.Box3().setFromObject(mesh);
            const size = box.getSize(new THREE.Vector3());
            this.minDistance = box.max.y - box.min.y;
            const center = box.getCenter(new THREE.Vector3());
    
            // Set initial camera position behind and level with the center
            const direction = new THREE.Vector3(0, 0, -1); // Backward direction
            const initialOffset = direction.multiplyScalar(this.maxDistance); // e.g., 2.5 units behind
            this.camera.position.copy(center.clone().add(initialOffset));
            this.camera.lookAt(center); // Look at the center, not mesh.position

            // Set initial yaw and pitch to match the camera's orientation
            const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
            yaw = euler.y;   // Yaw is rotation around Y-axis
            pitch = euler.x; // Pitch is rotation around X-axis
        }
    }
}

// **Window Resize Handling**
// Update camera and renderer when the window is resized
window.addEventListener('resize', () => {
    viewerState.camera.aspect = window.innerWidth / window.innerHeight; // Update aspect ratio
    viewerState.camera.updateProjectionMatrix(); // Recalculate projection
    viewerState.renderer.setSize(window.innerWidth, window.innerHeight); // Resize renderer
});

// Online: Detect Quick Connect
const onlineParams = new Proxy(new URLSearchParams(window.location.search), {
    get: (searchParams, prop) => searchParams.get(prop),});
if (onlineParams.standalone) { 
    document.getElementById("body").requestFullscreen();
};
console.log("Detecting quick connect ...");
if (onlineParams.peerId) {
    online.remoteID = onlineParams.peerId;
    console.log('Found, Remote ID:', online.remoteID);
    online.quickConnect = true;
    document.getElementById("quick-connect-invitation").style.display = "block";
};


// World Controller
export const worldController = {
    loadedKhets: new Map(), // khetId => { mesh, body, isAvatar }

    // Sync local world with Node objects
    async syncWithNode(params) {

        try {
            console.log(`Node Type is ${nodeSettings.nodeType}`);
            
            // Load all Khets freshly into khetController
            await khetController.loadAllKhets();
            const nodeKhetIds = new Set(Object.keys(khetController.khets));
            console.log(`Target node has ${nodeKhetIds.size} Khets`);

            // Get IDs of currently loaded Khets
            const loadedKhetIds = new Set(this.loadedKhets.keys());
            console.log(`Current node has ${loadedKhetIds.size} Khets`);

            // Identify Khets to load (in node but not loaded locally)
            const toLoad = [...nodeKhetIds].filter(id => !loadedKhetIds.has(id));
            console.log('Khets to load:', toLoad);

            // Identify Khets to unload (loaded locally but not in node)
            const toUnload = [...loadedKhetIds].filter(id => !nodeKhetIds.has(id));
            console.log('Khets to unload:', toUnload);

            // Load missing Khets (excluding avatars)
            for (const khetId of toLoad) {
                const khet = khetController.khets[khetId];
                if (khet && khet.khetType !== 'Avatar') { // Skip avatars for now
                    await this.loadKhet(khetId, params);
                }
            }

            // Unload Khets no longer in the world
            for (const khetId of toUnload) {
                this.unloadKhet(khetId, params.scene, params.world);
            }

            console.log(`Synced with node: loaded ${toLoad.length}, unloaded ${toUnload.length} Khets`);
        } catch (error) {
            console.error('Error syncing with node:', error);
        }
    },

    // Load a Khet if not already loaded
    async loadKhet(khetId, params) {
        if (this.loadedKhets.has(khetId)) {
            console.log(`Khet ${khetId} already loaded`);
            return this.loadedKhets.get(khetId);
        }
        const { mesh, body, isAvatar } = await loadKhet(khetId, params);
        this.loadedKhets.set(khetId, { mesh, body, isAvatar });
        return { mesh, body, isAvatar };
    },

    // Unload a Khet from the scene and physics world
    unloadKhet(khetId, scene, world) {
        const khet = this.loadedKhets.get(khetId);
        if (khet) {
            scene.remove(khet.mesh);
            viewerState.world.removeRigidBody(khet.body);
            this.loadedKhets.delete(khetId);
            if (this.currentAvatarId === khetId) {
                this.currentAvatarId = null;
            }
        }
    },

    // Set the active avatar, unloading the previous one if necessary
    async setAvatar(newAvatarId, params) { 
        const currentAvatarId = avatarState.getSelectedAvatarId();

        if (currentAvatarId && currentAvatarId !== newAvatarId) {        
            await this.unloadKhet(currentAvatarId, viewerState.scene, viewerState.world);
        }
        const { mesh, body, isAvatar } = await this.loadKhet(newAvatarId, params);
        if (isAvatar && mesh) {  
            avatarState.setSelectedAvatarId(newAvatarId);
            avatarState.setAvatarBody(body);
            avatarState.setAvatarMesh(mesh);
            viewerState.cameraController.setTarget(mesh);
        } else {
            console.warn(`Khet ${newAvatarId} is not an avatar`); // Improve: Only unload if new khet is Avatar, bypass this case
        }
    },

    // Clear all loaded Khets (optional utility)
    clearAllKhets(scene, world) {
        for (const khet of this.loadedKhets.values()) {
            scene.remove(khet.mesh);
            world.removeBody(khet.body);
        }
        this.loadedKhets.clear();
        avatarState.setSelectedAvatarId(null);
    }
};

// Load User Avatar
export async function loadAvatarObject({ scene, sceneObjects, world, animationMixers, khetState }) {
    const avatarId = avatarState.getSelectedAvatarId();
    console.log("Avatar ID: " + avatarId);
    if (avatarId) {
        await worldController.setAvatar(avatarId, { scene, sceneObjects, world, animationMixers, khetState });
    } else {
        console.log("Avatar gets selected automatically");
        const avatars = khetController.getAvatars();
        if (avatars.length > 0) {
            const avatarId = avatars[0].khetId;
            avatarState.setSelectedAvatarId(avatarId);

            if (online.connected) {
                online.send("avatar", avatarId);
            }

            await worldController.setAvatar(avatarId, { scene, sceneObjects, world, animationMixers, khetState });
        } else {
            console.warn("No avatars available to select automatically.");
        }
    }
}

// **Fallback Ground Plane**
// Function to add a ground plane if no scene objects are loaded
async function loadFallbackGround(nodeSettings) {
    const size = nodeSettings.groundPlaneSize || 100;
    const color = nodeSettings.groundPlaneColor || 0x888888;

    // Create a physics plane with no mass (static)
    const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.1, 0);
    const groundBody = viewerState.world.createRigidBody(rigidBodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(size / 2, 0.1, size / 2)
        .setFriction(0.3)
        .setRestitution(0.0);
    viewerState.world.createCollider(colliderDesc, groundBody);
    groundBody.userData = { type: 'sceneObject' };

    // Create a visual plane mesh
    const groundGeometry = new THREE.PlaneGeometry(size, size);
    const groundMaterialVisual = new THREE.MeshLambertMaterial({ color: color });
    const ground = new THREE.Mesh(groundGeometry, groundMaterialVisual);
    ground.position.y = 0; // Top of physics ground is at y=0
    ground.userData = { body: groundBody };
    viewerState.scene.add(ground);
    sceneObjects.push(ground);
    console.log('Loaded fallback ground plane');
}

// **Scene Initialization**
// Import the animation function and initialize the scene
export async function loadScene(params, nodeSettings) {
    await worldController.syncWithNode(params);

    // If no scene objects are loaded, add a fallback ground
    if (!Object.values(khetController.khets).some(khet => khet.khetType === 'SceneObject') && nodeSettings.groundPlane) {
        await loadFallbackGround(nodeSettings);
    }

    // Load remote avatars after scene is synced
    await online.loadRemoteAvatars();
}