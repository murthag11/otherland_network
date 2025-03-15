// Import necessary base modules from the Motoko standard library
import Blob "mo:base/Blob";       // For handling binary data
import Text "mo:base/Text";       // For text manipulation
import HashMap "mo:base/HashMap"; // For key-value storage
import Iter "mo:base/Iter";       // For iteration utilities
import Nat "mo:base/Nat";         // For natural numbers
import Array "mo:base/Array";     // For array operations
import Option "mo:base/Option";   // For optional values
import _Debug "mo:base/Debug";     // For debugging output

// Define the Storage actor, responsible for managing blob data across multiple users
actor Storage {
  // Maximum storage capacity per canister (500 GiB in bytes)
  private let MAX_STORAGE : Nat = 420 * 1024 * 1024 * 1024; // 420 GiB

  // Stable storage for blob chunks, persisted across upgrades
  stable var blobStoreStable : [(Text, [(Nat, Blob)])] = [];
  // In-memory HashMap for efficient blob chunk access
  var blobStore = HashMap.HashMap<Text, [(Nat, Blob)]>(10, Text.equal, Text.hash);

  // Stable storage for blob metadata (total size), persisted across upgrades
  stable var blobMetaStoreStable : [(Text, Nat)] = [];
  // In-memory HashMap for blob metadata (blobId -> totalSize)
  var blobMetaStore = HashMap.HashMap<Text, Nat>(10, Text.equal, Text.hash);

  // Stable variable to track the total size of all stored blobs
  stable var totalStoredSize : Nat = 0;

  // **System Function: Preupgrade**
  // Saves the state of HashMaps to stable variables before a canister upgrade
  system func preupgrade() {
    blobStoreStable := Iter.toArray(blobStore.entries());     // Save blob chunks
    blobMetaStoreStable := Iter.toArray(blobMetaStore.entries()); // Save blob metadata
  };

  // **System Function: Postupgrade**
  // Restores the state of HashMaps from stable variables after an upgrade
  system func postupgrade() {
    blobStore := HashMap.fromIter<Text, [(Nat, Blob)]>(blobStoreStable.vals(), 10, Text.equal, Text.hash); // Restore chunks
    blobMetaStore := HashMap.fromIter<Text, Nat>(blobMetaStoreStable.vals(), 10, Text.equal, Text.hash);   // Restore metadata
    // Recalculate totalStoredSize from blobMetaStore to ensure accuracy
    totalStoredSize := 0;
    for (size in blobMetaStore.vals()) {
      totalStoredSize += size;
    };
  };

  // **Store a Chunk of a Blob's Data**
  // Temporarily stores a chunk of the blob's data during upload
  public func storeBlobChunk(blobId : Text, chunkIndex : Nat, chunkData : Blob) : async () {
    let existingChunks = Option.get(blobStore.get(blobId), []); // Get existing chunks or empty array
    let newChunks = Array.append(existingChunks, [(chunkIndex, chunkData)]); // Append new chunk
    blobStore.put(blobId, newChunks); // Update blob storage
  };

  // **Finalize a Blob**
  // Verifies chunk count, records its total size, and updates the total stored size
  public func finalizeBlob(blobId : Text, totalSize : Nat, totalChunks : Nat) : async ?Text {
    switch (blobStore.get(blobId)) {
      case (null) {
        return ?("No chunks found for blobId: " # blobId); // Error if no chunks exist
      };
      case (?chunks) {
        if (chunks.size() != totalChunks) {
          return ?("Missing chunks for blobId: " # blobId # ". Expected " # Nat.toText(totalChunks) # ", got " # Nat.toText(chunks.size()));
        };
        // Record the total size of the blob
        blobMetaStore.put(blobId, totalSize);
        // Update the total stored size
        totalStoredSize += totalSize;
        return null; // Success
      };
    };
  };

  // **Query Function: Get a Specific Chunk of a Blob**
  // Retrieves a specific chunk of the blob's data
  public query func getBlobChunk(blobId : Text, chunkIndex : Nat) : async ?Blob {
    switch (blobStore.get(blobId)) {
      case (null) { null }; // No blob found
      case (?chunks) {
        let chunkOpt = Array.find<(Nat, Blob)>(chunks, func(chunk) { chunk.0 == chunkIndex });
        switch (chunkOpt) {
          case (null) { null };          // Chunk not found
          case (?(_, chunkData)) { ?chunkData }; // Return chunk data
        };
      };
    };
  };

  // **Query Function: Get the Total Size of a Blob**
  // Returns the total size of a specific blob
  public query func getBlobSize(blobId : Text) : async ?Nat {
    blobMetaStore.get(blobId) // Return size if found, otherwise null
  };

  // **Delete a Blob**
  // Removes a blob and its metadata, and decreases the total stored size
  public func deleteBlob(blobId : Text) : async () {
    switch (blobMetaStore.get(blobId)) {
      case (null) {
        // Blob not found, nothing to delete
      };
      case (?size) {
        // Decrease the total stored size
        totalStoredSize -= size;
        // Remove from blobMetaStore and blobStore
        blobMetaStore.delete(blobId);
        blobStore.delete(blobId);
      };
    };
  };

  // **Clear All Blobs**
  // Clears all blobs and metadata from storage, resetting total stored size
  public func clearBlobs() : async () {
    blobStore := HashMap.HashMap<Text, [(Nat, Blob)]>(10, Text.equal, Text.hash); // Reset chunk storage
    blobMetaStore := HashMap.HashMap<Text, Nat>(10, Text.equal, Text.hash);       // Reset metadata storage
    totalStoredSize := 0; // Reset total stored size
  };

  // **Query Function: Get Available Space**
  // Returns the remaining storage capacity of this canister
  public query func getAvailableSpace() : async Nat {
    if (totalStoredSize > MAX_STORAGE) {
      return 0; // No space left if totalStoredSize exceeds MAX_STORAGE
    };
    MAX_STORAGE - totalStoredSize; // Return remaining space
  };
};