import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Iter "mo:base/Iter";
import Nat "mo:base/Nat";
import _Option "mo:base/Option";
import _Array "mo:base/Array";
import Debug "mo:base/Debug";
import Blob "mo:base/Blob";
// import Management "Management"; // Interface for the ICP management canister

// Define the Manager actor
actor Manager {
  // Stable storage for tracking storage canisters: (canister ID, total size in bytes)
  stable var storageCanistersStable : [(Principal, Nat)] = [];
  // In-memory HashMap for quick access to storage canister data
  private var storageCanisters : HashMap.HashMap<Principal, Nat> = HashMap.HashMap<Principal, Nat>(10, Principal.equal, Principal.hash);

  // Stable storage for user backend canisters: (user principal, backend canister ID)
  stable var userBackendCanistersStable : [(Principal, Principal)] = [];
  // In-memory HashMap for quick access to user backend canister data
  var userBackendCanisters = HashMap.HashMap<Principal, Principal>(10, Principal.equal, Principal.hash);

  // Storage canister capacity threshold (e.g., 400 GiB in bytes, leaving buffer before 500 GiB limit)
  let STORAGE_THRESHOLD : Nat = 400 * 1024 * 1024 * 1024; // 400 GiB

  // **System Function: Preupgrade**
  // Saves the state of HashMaps to stable variables before a canister upgrade
  system func preupgrade() {
    storageCanistersStable := Iter.toArray(storageCanisters.entries());
    userBackendCanistersStable := Iter.toArray(userBackendCanisters.entries());
  };

  // **System Function: Postupgrade**
  // Restores the state of HashMaps from stable variables after an upgrade
  system func postupgrade() {
    storageCanisters := HashMap.fromIter<Principal, Nat>(storageCanistersStable.vals(), 10, Principal.equal, Principal.hash);
    userBackendCanisters := HashMap.fromIter<Principal, Principal>(userBackendCanistersStable.vals(), 10, Principal.equal, Principal.hash);
  };

  // Stable variable to store the Storage canister Wasm blob
  private stable var storageWasmStable : [Nat8] = []; // Stable storage for Wasm

  // Public function to set the Wasm blob (call this during deployment)
  public func setStorageWasm(wasm : Blob) : async () {
    storageWasmStable := Blob.toArray(wasm);
  };

  // **Helper Function: Create a New Storage Canister**
  // Uses the ICP management canister to create and initialize a new storage canister
  private func createStorageCanister() : async Principal {
    let managementCanister = actor ("aaaaa-aa") : actor {                                 // Correct Canister id
      create_canister : () -> async { canister_id : Principal };
      install_code : (Principal, Blob, Blob) -> async ();
    };
    // Create a new canister
    let result = await managementCanister.create_canister();
    let storageCanisterId = result.canister_id;
    // Placeholder for storage canister Wasm code and initialization arguments
    let storageWasm : Blob = Blob.fromArray(storageWasmStable); // Convert stable array to Blob
    let arg : Blob = ""; // Empty blob for no arguments; adjust if Storage.mo needs args
    // Install the code into the new canister
    await managementCanister.install_code(storageCanisterId, storageWasm, arg);
    // Initialize the storage canister with 0 bytes used
    storageCanisters.put(storageCanisterId, 0);
    return storageCanisterId;
  };

  // **Public Function: Get Current Storage Canister**
  // Returns a storage canister with enough space for a new asset, or creates a new one if needed
  public shared func getCurrentStorageCanister(assetSize : Nat) : async Principal {
    // Check existing storage canisters for available space
    for ((canisterId, totalSize) in storageCanisters.entries()) {
      if (totalSize + assetSize < STORAGE_THRESHOLD) {
        return canisterId;
      };
    };
    // No canister has enough space, so create a new one
    let newCanisterId = await createStorageCanister();
    return newCanisterId;
  };

  // **Public Function: Report Asset Stored**
  // Updates the total size used in a storage canister after an asset is stored
  public shared func reportAssetStored(storageCanisterId : Principal, assetSize : Nat) : async () {
    switch (storageCanisters.get(storageCanisterId)) {
      case (null) {
        // Trap if the storage canister doesn't exist
        Debug.trap("Storage canister not found");
      };
      case (?currentSize) {
        // Update the total size used
        storageCanisters.put(storageCanisterId, currentSize + assetSize);
      };
    };
  };

  // **Public Query Function: Get User Backend Canister**
  // Retrieves the backend canister ID for a given user (returns null if not found)
  public query func getUserBackendCanister(userPrincipal : Principal) : async ?Principal {
    userBackendCanisters.get(userPrincipal);
  };
};