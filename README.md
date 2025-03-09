# `OTHERLAND_NODE`

`Tech Stack`
Dfinity ICP Application
written in motoko and html5/css/js
using Three.js for 3D Rendering
using Cannon.js as Physics Engine
using Peer.js for p2p communication
using esprima for code interpretation
written by Grok3

`To do`
- Local Khet cache
- Style Menu and Areas
- Universal Loading Bar
- Interaction Points (Change Khet Values)
- bash npm 5 moderate severity vulnerabilities
- Peer.js WebRTC Communication
- Audiofield (50m | 20 Sources Limit)
- Objects can send other other obejcts code -> interactive environment
- Connect to Orbit Wallet
- SNS Dao


`Plan`
Loads the environment,
list of entities
and program code from the network node

Caches data of nodes with hash,
loads data from cache if hash stayed the same

Subscribes to other entities via WebRTC
to stream their position,
movement, etc.

Broadcasts own location,
movement, etc.
at WebRTC address
deposited in the node

Renders the VR view of the environment
and entities,
animated with program code

Reacts to basic gestures from the user
provides menu options
Basic USer Interface
. Chat (World / Group / Single)
- Friends list
- Inventory
- Interaction Points

`Future Roadmap`
Keeping a contact list with direct calling, messaging and data sharing
Reduce own visibility further, no presence marker, only register in the node
Automate user movement & gestures with pre recorded macros
Provides an Interface to the Otherland Network to manage own nodes, exchange data between own nodes/entities and personal computing space, etc.
Serves as a wallet to pay for all expenses in Otherland and to receive payment

`Reset Network`
cd ~/OTHERLAND_NODE
dfx stop
rm -rf .dfx/
dfx start --background --clean
dfx deploy

`Convert glTF`
python3 src/OTHERLAND_NODE_frontend/util/convert_gltf.py src/OTHERLAND_NODE_frontend/assets/sample.glb > binary-glb-data.txt

`Otherland Object: Khet`

Required:
- Unique Identifier [khetId]
- Custon Name
- Custon Description
- type [sceneObject|interactiveObject|mobileObject|Entity|Avatar]
- 3d data blob [user-provided-3d-object.glb]
- position [x,y,z] (init with 0,0,0)
- original-size [x,y,z] (measured at upload)
- scaling factor [x,y,z] (init with 1,1,1)

Optional:
- multiple textures [a: a.jpg, b: b.jpg]
- animations (already in the 3d blob?)
- code for execution (format?)


`Grok Suggestions`

document.getElementsByClassName("w-full max-w-3xl flex flex-col")[document.getElementsByClassName("w-full max-w-3xl flex flex-col").length - 1].style.maxWidth = "80rem";

Viewer.js:

Debug Logging:
The CameraController class has several console.log statements (e.g., for scroll factor, camera offset).
These are great for debugging but could be removed or wrapped in a debug flag
(e.g., if (DEBUG)console.log(...)) for production to keep the console clean.

Configurable Canister ID:
In the upload handler, the canister ID 'be2us-64aaa-aaaaa-qaabq-cai' is hardcoded.
Consider making this a configurable constant or fetching it dynamically
(e.g., from an environment variable or config file) to make the code more flexible across deployments.

Error Handling:
The upload error logging could be enhanced by displaying a user-friendly
message in the UI, not just the console, to improve the user experience.


Animation.js:

Grounding Check Optimization:
The grounding check loops through all sceneObjects for every physics contact. You could optimize this by
tagging ground objects or maintaining a separate list of collidable ground bodies to reduce iterations.

Jump Cooldown Simplification:
The jump logic uses performance.now() for timing. A simpler approach might use a frame counter or
a boolean flag toggled by a timeout, reducing complexity.

Animation Mixer Population:
The animationMixers array is declared but not filled here. Ensure it’s populated elsewhere
(e.g., in viewer.js) when loading animated objects, or it won’t have any effect.


Khet.js:

Error Handling in loadKhet:
Issue: Errors are logged but not propagated or shown to the user.
Suggestion: Add a mechanism to notify the user (e.g., via a UI alert) or implement retry logic for failed chunk fetches to improve reliability.

Texture Handling:
Issue: Assumes a single texture applies uniformly to all meshes.
Suggestion: Enhance to support multiple textures by mapping them to specific material names or mesh IDs, improving flexibility for complex Khets.

Physics Shape Selection:
Issue: Uses trimesh for scene objects (expensive) and boxes/spheres elsewhere.
Suggestion: For non-avatar dynamic objects, consider simpler shapes (e.g., capsules) unless high precision is needed, to optimize performance.

Animation Mixer Management:
Issue: Mixers are added to a global array without cleanup.
Suggestion: Add a cleanup function to remove mixers when Khets are deleted or the scene resets, preventing memory leaks.

Code Execution Security:
Issue: The createKhetCodeExecutor allows basic assignments but could be exploited if untrusted code is passed.
Suggestion: Restrict code execution to a whitelist of trusted sources or further limit operations to predefined functions.

Thought for
35s
Expand for details
Thank you for your request. Below, I’ve provided improvement suggestions for main.mo, storage.mo, and menu.js based on a careful review of each file. These suggestions focus on enhancing error handling, efficiency, and user experience without altering the core functionality. Each suggestion is explained with a clear rationale and, where applicable, includes code snippets for clarity.

Improvement Suggestions
1. main.mo Improvements
The main.mo file manages the backend logic for handling "Khets" (3D objects). While functional, it can benefit from better error handling and robustness when interacting with the storage canister.

a. Add Error Handling in storeKhet
Issue: The storeKhet function calls the storage canister’s finalizeBlob method but doesn’t handle potential failures (e.g., if the storage canister is unavailable or the blob finalization fails).
Suggestion: Wrap the canister call in a try-catch block to handle errors gracefully. This ensures that if the storage canister fails, the error is logged or returned to the caller.
Why: Improves reliability and provides better feedback for debugging or user notification.
Example:
motoko

Collapse

Wrap

Copy
public func storeKhet(khet : Khet, storageCanisterId : Principal, blobId : Text, totalChunks : Nat) : async ?Text {
  let storageActor = actor (Principal.toText(storageCanisterId)) : actor {
    finalizeBlob : (Text, Nat, Nat) -> async ?Text;
  };
  try {
    let finalizeResult = await storageActor.finalizeBlob(blobId, khet.gltfDataRef.2, totalChunks);
    switch (finalizeResult) {
      case (?error) { return ?error };
      case (null) {
        khets.put(khet.khetId, khet);
        chunkStore.delete(khet.khetId);
        return null;
      };
    };
  } catch (err) {
    // Log or handle the error
    Debug.print("Error finalizing blob: " # debug_show(err));
    return ?("Failed to finalize blob in storage canister");
  };
};
b. Enhance clearAllKhets with Error Handling
Issue: The clearAllKhets function resets local storage but doesn’t handle errors from the storage canister’s clearBlobs method.
Suggestion: Add a try-catch block around the clearBlobs call to handle potential failures.
Why: Ensures that the operation either completes fully or informs the user of any issues.
Example:
motoko

Collapse

Wrap

Copy
public func clearAllKhets(storageCanisterId : Principal) : async ?Text {
  let storageActor = actor (Principal.toText(storageCanisterId)) : actor {
    clearBlobs : () -> async ();
  };
  try {
    await storageActor.clearBlobs();
    khets := HashMap.HashMap<Text, Khet>(10, Text.equal, Text.hash);
    chunkStore := HashMap.HashMap<Text, [(Nat, Blob)]>(10, Text.equal, Text.hash);
    return null; // Success
  } catch (err) {
    Debug.print("Error clearing blobs: " # debug_show(err));
    return ?("Failed to clear blobs in storage canister");
  };
};
2. storage.mo Improvements
The storage.mo file manages blob storage for Khet data. Improvements here focus on ensuring data integrity during uploads and optimizing chunk retrieval.

a. Verify All Chunk Indices in finalizeBlob
Issue: The finalizeBlob function checks if the number of chunks matches totalChunks but doesn’t ensure that all expected chunk indices (e.g., 0 to totalChunks-1) are present.
Suggestion: Add a check to verify that all chunk indices from 0 to totalChunks-1 are present before finalizing the blob.
Why: Prevents finalizing incomplete or corrupted blobs, ensuring data integrity.
Example:
motoko

Collapse

Wrap

Copy
public func finalizeBlob(blobId : Text, totalSize : Nat, totalChunks : Nat) : async ?Text {
  switch (blobStore.get(blobId)) {
    case (null) {
      return ?("No chunks found for blobId: " # blobId);
    };
    case (?chunks) {
      if (chunks.size() != totalChunks) {
        return ?("Missing chunks for blobId: " # blobId # ". Expected " # Nat.toText(totalChunks) # ", got " # Nat.toText(chunks.size()));
      };
      // Check if all indices from 0 to totalChunks-1 are present
      let expectedIndices = Array.tabulate<Nat>(totalChunks, func(i) { i });
      let presentIndices = Array.map<(Nat, Blob), Nat>(chunks, func(chunk) { chunk.0 });
      let missingIndices = Array.filter<Nat>(expectedIndices, func(i) { not Array.exists<Nat>(presentIndices, func(p) { p == i }) });
      if (missingIndices.size() > 0) {
        return ?("Missing chunks with indices: " # debug_show(missingIndices));
      };
      blobMetaStore.put(blobId, totalSize);
      return null; // Success
    };
  };
};
b. Optimize Chunk Lookup in getBlobChunk
Issue: The getBlobChunk function uses Array.find to locate a chunk by index, which is O(n) and inefficient for large numbers of chunks.
Suggestion: Change the storage structure to a map (e.g., HashMap<Nat, Blob>) for O(1) lookups.
Why: Improves performance, especially for large blobs with many chunks.
Example:
Modify blobStore to HashMap<Text, HashMap<Nat, Blob>>.
Update storeBlobChunk and getBlobChunk accordingly:
motoko

Collapse

Wrap

Copy
// In storage.mo
var blobStore = HashMap.HashMap<Text, HashMap<Nat, Blob>>(10, Text.equal, Text.hash);

public func storeBlobChunk(blobId : Text, chunkIndex : Nat, chunkData : Blob) : async () {
  let chunkMap = switch (blobStore.get(blobId)) {
    case (null) { HashMap.HashMap<Nat, Blob>(10, Nat.equal, Nat.hash) };
    case (?map) { map };
  };
  chunkMap.put(chunkIndex, chunkData);
  blobStore.put(blobId, chunkMap);
};

public query func getBlobChunk(blobId : Text, chunkIndex : Nat) : async ?Blob {
  switch (blobStore.get(blobId)) {
    case (null) { null };
    case (?chunkMap) { chunkMap.get(chunkIndex) };
  };
};
3. menu.js Improvements
The menu.js file manages the user interface, including menus and key inputs. Improvements here focus on enhancing user experience and preventing accidental actions.

a. Add Confirmation for "Clear All Khets"
Issue: The "Clear All Khets" button performs a destructive action without user confirmation.
Suggestion: Add a confirmation dialog before clearing all Khets to prevent accidental data loss.
Why: Improves user experience and reduces the risk of unintended actions.
Example:
javascript

Collapse

Wrap

Copy
clearBtn.addEventListener('click', async () => {
  if (confirm("Are you sure you want to clear all Khets? This action cannot be undone.")) {
    await clearAllKhets();
    console.log('Khets cleared from menu');
    alert("All Khets have been cleared successfully.");
  }
});
b. Provide User Feedback for Operations
Issue: Actions like clearing Khets or selecting an avatar only log to the console, with no user feedback.
Suggestion: Use alerts or update the UI to inform the user of the result (success or failure).
Why: Enhances usability by keeping the user informed.
Example:
For avatar selection:
javascript

Collapse

Wrap

Copy
button.addEventListener('click', () => {
  const avatarNum = button.getAttribute('data-avatar');
  console.log(`Selected Avatar ${avatarNum}`);
  alert(`Avatar ${avatarNum} selected successfully.`);
});
c. Consider State Management for UI
Issue: The current UI logic is straightforward but could become complex as the application grows.
Suggestion: If the UI expands, consider using a state management library (e.g., Redux) or a framework like React to handle UI state more efficiently.
Why: Improves maintainability and scalability, though it may be unnecessary for the current scope.