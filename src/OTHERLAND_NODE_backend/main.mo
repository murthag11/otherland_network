// Import necessary base modules from the Motoko standard library
import Blob "mo:base/Blob";           // For handling binary data
import Text "mo:base/Text";           // For text manipulation
import HashMap "mo:base/HashMap";     // For key-value storage
import Iter "mo:base/Iter";           // For iteration utilities
import Principal "mo:base/Principal"; // For canister and user identities
import _Time "mo:base/Time";          // For time-related operations (unused here but imported)
import Nat "mo:base/Nat";             // For natural numbers
import Array "mo:base/Array";         // For array operations
import Option "mo:base/Option";       // For optional values
import _Debug "mo:base/Debug";        // For debugging output (aliased to avoid conflict)

// Define the Node actor, representing the main backend canister
actor Node {
  // Define the KhetType variant to categorize different types of Khet objects
  public type KhetType = {
    #SceneObject;        // Static objects in the scene
    #InteractiveObject;  // Objects users can interact with
    #MobileObject;       // Objects that can move
    #Entity;             // General entities with behavior
    #Avatar;             // User-controlled avatars
  };

  // Define tuple types for 3D spatial properties
  public type Position = (Float, Float, Float); // (x, y, z) coordinates
  public type Size = (Float, Float, Float);     // (width, height, depth)
  public type Scale = (Float, Float, Float);    // (x-scale, y-scale, z-scale)

  // Define the Khet record type, representing a 3D object in the system
  public type Khet = {
    khetId : Text;                      // Unique identifier for the Khet
    khetType : KhetType;                // Type of the Khet (e.g., SceneObject)
    gltfDataRef : (Principal, Text, Nat); // Reference to GLTF data: (canister ID, blob ID, size)
    position : Position;                // 3D position in the scene
    originalSize : Size;                // Original dimensions of the object
    scale : Scale;                      // Scaling factors applied to the object
    textures : ?[(Text, Blob)];         // Optional array of (texture ID, texture data) pairs
    animations : ?[Text];               // Optional array of animation identifiers
    code : ?Text;                       // Optional code for interactive behavior
  };

  // Stable storage for Khets, persisted across upgrades
  stable var khetStore : [(Text, Khet)] = [];
  // In-memory HashMap for efficient Khet access
  var khets = HashMap.HashMap<Text, Khet>(10, Text.equal, Text.hash);

  // Stable storage for chunk data, used during uploads
  stable var chunkStoreStable : [(Text, [(Nat, Blob)])] = [];
  // In-memory HashMap for temporary chunk storage
  var chunkStore = HashMap.HashMap<Text, [(Nat, Blob)]>(10, Text.equal, Text.hash);

  // Preupgrade system function to save state before a canister upgrade
  system func preupgrade() {
    khetStore := Iter.toArray(khets.entries());          // Save Khets to stable storage
    chunkStoreStable := Iter.toArray(chunkStore.entries()); // Save chunks to stable storage
  };

  // Postupgrade system function to restore state after an upgrade
  system func postupgrade() {
    khets := HashMap.fromIter<Text, Khet>(khetStore.vals(), 10, Text.equal, Text.hash); // Restore Khets
    chunkStore := HashMap.fromIter<Text, [(Nat, Blob)]>(chunkStoreStable.vals(), 10, Text.equal, Text.hash); // Restore chunks
  };

  // Store a Khet with reference to its data in a storage canister
  public func storeKhet(khet : Khet, storageCanisterId : Principal, blobId : Text, totalChunks : Nat) : async ?Text {
    // Create an actor reference to the storage canister
    let storageActor = actor (Principal.toText(storageCanisterId)) : actor {
      finalizeBlob : (Text, Nat, Nat) -> async ?Text; // Expect a finalizeBlob method
    };
    // Finalize the blob in the storage canister
    let finalizeResult = await storageActor.finalizeBlob(blobId, khet.gltfDataRef.2, totalChunks);
    switch (finalizeResult) {
      case (?error) { return ?error }; // Return error message if finalization fails
      case (null) {
        khets.put(khet.khetId, khet);  // Store the Khet in the HashMap
        chunkStore.delete(khet.khetId); // Clean up temporary chunks
        return null;                   // Success, no error
      };
    };
  };

  // Store a chunk of a Khet's data during upload
  public func storeKhetChunk(khetId : Text, chunkIndex : Nat, chunkData : Blob) : async () {
    let existingChunks = Option.get(chunkStore.get(khetId), []); // Get existing chunks or empty array
    let newChunks = Array.append(existingChunks, [(chunkIndex, chunkData)]); // Append new chunk
    chunkStore.put(khetId, newChunks); // Update chunk storage
  };

  // Query function to retrieve a Khet by its ID
  public query func getKhet(khetId : Text) : async ?Khet {
    khets.get(khetId) // Return the Khet if found, otherwise null
  };

  // Query function to get all Khets of type SceneObject
  public query func getSceneObjectKhets() : async [Khet] {
    let allKhets = Iter.toArray(khets.entries()); // Get all Khets as an array
    let filteredKhets = Array.filter<(Text, Khet)>(allKhets, func((_, khet) : (Text, Khet)) : Bool {
      switch (khet.khetType) {
        case (#SceneObject) { true }; // Keep only SceneObject Khets
        case (_) { false };
      }
    });
    Array.map<(Text, Khet), Khet>(filteredKhets, func((_, khet) : (Text, Khet)) : Khet { khet }) // Extract Khet values
  };

  // Abort a Khet upload by deleting its chunks
  public func abortKhetUpload(khetId : Text) : async () {
    chunkStore.delete(khetId); // Remove temporary chunks for the given Khet ID
  };

  // Clear all Khets from both this canister and the storage canister
  public func clearAllKhets(storageCanisterId : Principal) : async () {
    let storageActor = actor (Principal.toText(storageCanisterId)) : actor {
      clearBlobs : () -> async (); // Expect a clearBlobs method
    };
    await storageActor.clearBlobs(); // Clear all blobs in the storage canister
    khets := HashMap.HashMap<Text, Khet>(10, Text.equal, Text.hash); // Reset Khet storage
    chunkStore := HashMap.HashMap<Text, [(Nat, Blob)]>(10, Text.equal, Text.hash); // Reset chunk storage
  };
};