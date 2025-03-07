// Import necessary base modules from the Motoko standard library
import Blob "mo:base/Blob";       // For handling binary data
import Text "mo:base/Text";       // For text manipulation
import HashMap "mo:base/HashMap"; // For key-value storage
import Iter "mo:base/Iter";       // For iteration utilities
import Nat "mo:base/Nat";         // For natural numbers
import Array "mo:base/Array";     // For array operations
import Option "mo:base/Option";   // For optional values
import _Debug "mo:base/Debug";     // For debugging output

// Define the Storage actor, responsible for managing blob data
actor Storage {
  // Stable storage for blob chunks, persisted across upgrades
  stable var blobStoreStable : [(Text, [(Nat, Blob)])] = [];
  // In-memory HashMap for efficient blob chunk access
  var blobStore = HashMap.HashMap<Text, [(Nat, Blob)]>(10, Text.equal, Text.hash);

  // Stable storage for blob metadata (total size), persisted across upgrades
  stable var blobMetaStoreStable : [(Text, Nat)] = [];
  // In-memory HashMap for blob metadata
  var blobMetaStore = HashMap.HashMap<Text, Nat>(10, Text.equal, Text.hash); // blobId -> totalSize

  // Preupgrade system function to save state before a canister upgrade
  system func preupgrade() {
    blobStoreStable := Iter.toArray(blobStore.entries());     // Save blob chunks
    blobMetaStoreStable := Iter.toArray(blobMetaStore.entries()); // Save blob metadata
  };

  // Postupgrade system function to restore state after an upgrade
  system func postupgrade() {
    blobStore := HashMap.fromIter<Text, [(Nat, Blob)]>(blobStoreStable.vals(), 10, Text.equal, Text.hash); // Restore chunks
    blobMetaStore := HashMap.fromIter<Text, Nat>(blobMetaStoreStable.vals(), 10, Text.equal, Text.hash);   // Restore metadata
  };

  // Store a chunk of a blob's data
  public func storeBlobChunk(blobId : Text, chunkIndex : Nat, chunkData : Blob) : async () {
    let existingChunks = Option.get(blobStore.get(blobId), []); // Get existing chunks or empty array
    let newChunks = Array.append(existingChunks, [(chunkIndex, chunkData)]); // Append new chunk
    blobStore.put(blobId, newChunks); // Update blob storage
  };

  // Finalize a blob by verifying chunk count and recording its total size
  public func finalizeBlob(blobId : Text, totalSize : Nat, totalChunks : Nat) : async ?Text {
    switch (blobStore.get(blobId)) {
      case (null) {
        return ?("No chunks found for blobId: " # blobId); // Error if no chunks exist
      };
      case (?chunks) {
        if (chunks.size() != totalChunks) {
          return ?("Missing chunks for blobId: " # blobId # ". Expected " # Nat.toText(totalChunks) # ", got " # Nat.toText(chunks.size()));
        };
        blobMetaStore.put(blobId, totalSize); // Record total size
        return null; // Success
      };
    };
  };

  // Query function to retrieve a specific chunk of a blob
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

  // Query function to get the total size of a blob
  public query func getBlobSize(blobId : Text) : async ?Nat {
    blobMetaStore.get(blobId) // Return size if found, otherwise null
  };

  // Delete a blob and its metadata
  public func deleteBlob(blobId : Text) : async () {
    blobStore.delete(blobId);     // Remove chunks
    blobMetaStore.delete(blobId); // Remove metadata
  };

  // Clear all blobs and metadata from storage
  public func clearBlobs() : async () {
    blobStore := HashMap.HashMap<Text, [(Nat, Blob)]>(10, Text.equal, Text.hash); // Reset chunk storage
    blobMetaStore := HashMap.HashMap<Text, Nat>(10, Text.equal, Text.hash);       // Reset metadata storage
  };
};