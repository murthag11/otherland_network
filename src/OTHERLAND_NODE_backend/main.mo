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
    khetType : Text;                    // Type of the Khet (e.g., "avatar", "object")
    gltfData : Blob;                    // GLTF data as a binary blob
    gltfDataSize : Nat;                 // Size of the GLTF data in bytes
    gltfDataRef : ?(Principal, Text, Nat); // Optional reference to GLTF data (canister ID, blob ID, size)
    position : (Float, Float, Float);   // 3D position (x, y, z)
    originalSize : (Float, Float, Float); // Original dimensions (x, y, z)
    scale : (Float, Float, Float);      // Scaling factors (x, y, z)
    textures : ?[(Text, Blob)];         // Optional array of (texture ID, texture data) pairs
    animations : ?[Text];               // Optional array of animation identifiers
    code : ?Text;                       // Optional code for interactive behavior
    hash : Text;                        // Hash field
};

  // Stable storage for Khets, persisted across upgrades
  stable var khetStore : [(Text, Khet)] = [];
  // In-memory HashMap for efficient Khet access
  var khets = HashMap.HashMap<Text, Khet>(10, Text.equal, Text.hash);
  
  // Stable storage for pending Khets (not yet finalized)
  stable var pendingKhetStore : [(Text, Khet)] = [];
  // In-memory HashMap for pending Khets
  var pendingKhets = HashMap.HashMap<Text, Khet>(10, Text.equal, Text.hash);

  // Stable storage for chunk data, used during uploads
  stable var chunkStoreStable : [(Text, [(Nat, Blob)])] = [];
  // In-memory HashMap for temporary chunk storage
  var chunkStore = HashMap.HashMap<Text, [(Nat, Blob)]>(10, Text.equal, Text.hash);

  // Stable storage for hash
  stable var hashToBlobIdStore : [(Text, (Text, Bool))] = [];
  // In-memory HashMap for hash to blob ID mapping
  var hashToBlobId = HashMap.HashMap<Text, (Text, Bool)>(10, Text.equal, Text.hash);

  // Preupgrade system function to save state before a canister upgrade
  system func preupgrade() {
    khetStore := Iter.toArray(khets.entries());          // Save Khets to stable storage
    pendingKhetStore := Iter.toArray(pendingKhets.entries()); // Save pending Khets
    chunkStoreStable := Iter.toArray(chunkStore.entries()); // Save chunks to stable storage
    hashToBlobIdStore := Iter.toArray(hashToBlobId.entries()); // Save hash mapping
  };

  // Postupgrade system function to restore state after an upgrade
  system func postupgrade() {
    khets := HashMap.fromIter<Text, Khet>(khetStore.vals(), 10, Text.equal, Text.hash); // Restore Khets
    pendingKhets := HashMap.fromIter<Text, Khet>(pendingKhetStore.vals(), 10, Text.equal, Text.hash); // Restore pending Khets
    chunkStore := HashMap.fromIter<Text, [(Nat, Blob)]>(chunkStoreStable.vals(), 10, Text.equal, Text.hash); // Restore chunks
    hashToBlobId := HashMap.fromIter<Text, (Text, Bool)>(hashToBlobIdStore.vals(), 10, Text.equal, Text.hash); // Restore hash mapping
  };

  // Initialize a Khet upload (store temporarily without finalizing)
  public func initKhetUpload(khet : Khet, storageCanisterId : Principal) : async {#existing : Text; #new : Text} {
    switch (khet.gltfDataRef) {
    case (null) {
      // gltfDataRef is null, treat this as a new upload
      let newBlobId = khet.khetId;
      hashToBlobId.put(khet.hash, (newBlobId, false));
      let gltfDataRef = (storageCanisterId, newBlobId, khet.gltfDataSize);
      let updatedKhet = { khet with gltfDataRef = ?gltfDataRef };
      pendingKhets.put(khet.khetId, updatedKhet);
      return #new(newBlobId);
    };
    case (?_ref) {
      // gltfDataRef is already set, check if the hash exists
      let existing = hashToBlobId.get(khet.hash);
      switch (existing) {
          case (? (blobId, true)) {

              // Hash exists and is finalized; reuse blobId
              let gltfDataRef = (storageCanisterId, blobId, khet.gltfDataSize);
              let updatedKhet = { khet with gltfDataRef = ?gltfDataRef };
              khets.put(khet.khetId, updatedKhet);
              return #existing(blobId);
          };
          case (_) {
            
              // Hash doesn’t exist or isn’t finalized; use khetId as blobId
              let newBlobId = khet.khetId;
              hashToBlobId.put(khet.hash, (newBlobId, false));
              let gltfDataRef = (storageCanisterId, newBlobId, khet.gltfDataSize);
              let updatedKhet = { khet with gltfDataRef = ?gltfDataRef };
              pendingKhets.put(khet.khetId, updatedKhet);
              return #new(newBlobId);
          };
      };
    };
  };
};

  // Finalize a Khet upload after chunks are uploaded
  public func finalizeKhetUpload(khetId : Text, storageCanisterId : Principal, blobId : Text, totalChunks : Nat) : async ?Text {
  let khetOpt = pendingKhets.get(khetId);
  switch (khetOpt) {
    case (null) {
      return ?"Khet not found in pending store";
    };
    case (?khet) {
      // Safely unwrap gltfDataRef
      switch (khet.gltfDataRef) {
        case (null) {
          return ?"gltfDataRef is unexpectedly null for Khet";
        };
        case (?ref) {
          let storageActor = actor (Principal.toText(storageCanisterId)) : actor {
            finalizeBlob : (Text, Nat, Nat) -> async ?Text;
          };
          // Use ref.2 to access the Nat (size) from the tuple
          let finalizeResult = await storageActor.finalizeBlob(blobId, ref.2, totalChunks);
          switch (finalizeResult) {
            case (?error) {
              return ?error; // Return error if finalization fails
            };
            case (null) {
              khets.put(khet.khetId, khet);       // Move to permanent storage
              pendingKhets.delete(khet.khetId);    // Remove from pending
              chunkStore.delete(khet.khetId);      // Clean up chunks
              switch (hashToBlobId.get(khet.hash)) {
                case (? (existingBlobId, _)) {
                  hashToBlobId.put(khet.hash, (existingBlobId, true));
                };
                case (null) {
                  // Should not happen; log error if needed
                };
              };
              return null;                         // Success
            };
          };
        };
      };
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
    let khet = khets.get(khetId);
    switch (khet) {
      case (?k) { return ?k; };
      case (null) { return pendingKhets.get(khetId); }; // Check pending if not in main store
    };
  };

  // Query function to get all Khets
  public query func getAllKhets() : async [Khet] {
      Iter.toArray(khets.vals()) // Return all Khets
  };

  // Query function to get all Khets of type SceneObject
  public query func getSceneObjectKhets() : async [Khet] {
    let allKhets = Iter.toArray(khets.entries()); // Get all Khets as an array
    let filteredKhets = Array.filter<(Text, Khet)>(allKhets, func((_, khet) : (Text, Khet)) : Bool {
      khet.khetType == "SceneObject" // Compare as text
    });
    Array.map<(Text, Khet), Khet>(filteredKhets, func((_, khet) : (Text, Khet)) : Khet { khet }) // Extract Khet values
  };

  // Abort a Khet upload by deleting its chunks and pending entry
  public func abortKhetUpload(khetId : Text) : async () {
    pendingKhets.delete(khetId);
    chunkStore.delete(khetId); // Remove temporary chunks for the given Khet ID
  };

  // Clear all Khets from both this canister and the storage canister
  public func clearAllKhets(storageCanisterId : Principal) : async () {
    let storageActor = actor (Principal.toText(storageCanisterId)) : actor {
      clearBlobs : () -> async (); // Expect a clearBlobs method
    };
    await storageActor.clearBlobs(); // Clear all blobs in the storage canister
    khets := HashMap.HashMap<Text, Khet>(10, Text.equal, Text.hash); // Reset Khet storage
    pendingKhets := HashMap.HashMap<Text, Khet>(10, Text.equal, Text.hash); // Reset pending Khet storage
    chunkStore := HashMap.HashMap<Text, [(Nat, Blob)]>(10, Text.equal, Text.hash); // Reset chunk storage
  };
};