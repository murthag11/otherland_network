import { Principal } from '@icp-sdk/core/principal';
import { nodeSettings, getUserNodeActor } from '../nodeManager.js';
import { saveToCache } from '../storage/idbCache.js';
import { createKhet } from './create.js';
import { khetController } from './controller.js';
import { updateKhetTable } from './uiTable.js';

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
        khet.gltfDataRef = [[Principal.fromText(nodeSettings.nodeId), blobId, khet.gltfDataSize]];
        console.log(`Khet ${khet.khetId} reusing existing blobId ${blobId}`); // No upload needed; asset already exists
        

        // Hide the progress bar
        document.getElementById("upload-bar").innerHTML = "Asset Already Uploaded";
        setTimeout(() => {
            document.getElementById('upload-container').style.display = 'none';
        }, 2000);

        return khet;

    } else if (result.new) {
        blobId = result.new;
        khet.gltfDataRef = [[Principal.fromText(nodeSettings.nodeId), blobId, khet.gltfDataSize]];
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
