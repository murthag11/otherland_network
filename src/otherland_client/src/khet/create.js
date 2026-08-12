import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { computeSHA256 } from '../utils/sha256.js';
import { mapKhetType } from './types.js';

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
