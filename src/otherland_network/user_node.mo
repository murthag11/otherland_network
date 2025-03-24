import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Option "mo:base/Option";
import Nat "mo:base/Nat";
import _Nat32 "mo:base/Nat32";
import Iter "mo:base/Iter";
import Text "mo:base/Text";
import Blob "mo:base/Blob";
import Array "mo:base/Array";

actor UserNode {

    // **Stable Variables**
    stable var owner : ?Principal = null;
    stable var allowedReadersEntries : [(Principal, ())] = [];
    stable var khetStore : [(Text, KhetMetadata)] = [];
    stable var pendingKhetStore : [(Text, KhetMetadata)] = [];
    stable var hashToBlobIdStore : [(Text, (Text, Bool))] = [];
    stable var blobStoreStable : [(Text, [(Nat, Blob)])] = [];
    stable var blobMetaStoreStable : [(Text, Nat)] = [];

    // **In-Memory HashMaps**
    var allowedReaders = HashMap.fromIter<Principal, ()>(allowedReadersEntries.vals(), 10, Principal.equal, Principal.hash);
    var khets = HashMap.fromIter<Text, KhetMetadata>(khetStore.vals(), 10, Text.equal, Text.hash);
    var pendingKhets = HashMap.fromIter<Text, KhetMetadata>(pendingKhetStore.vals(), 10, Text.equal, Text.hash);
    var hashToBlobId = HashMap.fromIter<Text, (Text, Bool)>(hashToBlobIdStore.vals(), 10, Text.equal, Text.hash);
    var blobStore = HashMap.HashMap<Text, [(Nat, Blob)]>(10, Text.equal, Text.hash);
    var blobMetaStore = HashMap.HashMap<Text, Nat>(10, Text.equal, Text.hash);

    // **Type Definitions**
    public type Position = (Float, Float, Float);
    public type Size = (Float, Float, Float);
    public type Scale = (Float, Float, Float);

    public type KhetMetadata = {
        khetId : Text;
        khetType : Text;
        gltfDataSize : Nat;
        gltfDataRef : ?(Principal, Text, Nat); // (storageCanisterId, blobId, size)
        position : Position;
        originalSize : Size;
        scale : Scale;
        textures : ?[(Text, Blob)];
        animations : ?[Text];
        code : ?Text;
        hash : Text;
    };

    // **Upgrade Hooks**
    system func preupgrade() {
        allowedReadersEntries := Iter.toArray(allowedReaders.entries());
        khetStore := Iter.toArray(khets.entries());
        pendingKhetStore := Iter.toArray(pendingKhets.entries());
        hashToBlobIdStore := Iter.toArray(hashToBlobId.entries());
        blobStoreStable := Iter.toArray(blobStore.entries()); // Save blob chunks
        blobMetaStoreStable := Iter.toArray(blobMetaStore.entries()); // Save blob metadata
    };

    system func postupgrade() {
        allowedReaders := HashMap.fromIter<Principal, ()>(allowedReadersEntries.vals(), 10, Principal.equal, Principal.hash);
        khets := HashMap.fromIter<Text, KhetMetadata>(khetStore.vals(), 10, Text.equal, Text.hash);
        pendingKhets := HashMap.fromIter<Text, KhetMetadata>(pendingKhetStore.vals(), 10, Text.equal, Text.hash);
        hashToBlobId := HashMap.fromIter<Text, (Text, Bool)>(hashToBlobIdStore.vals(), 10, Text.equal, Text.hash);
        blobStore := HashMap.fromIter<Text, [(Nat, Blob)]>(blobStoreStable.vals(), 10, Text.equal, Text.hash); // Restore chunks
        blobMetaStore := HashMap.fromIter<Text, Nat>(blobMetaStoreStable.vals(), 10, Text.equal, Text.hash); // Restore metadata
    };

    // **Initialization by Cardinal**
    let cardinal = actor ("bkyz2-fmaaa-aaaaa-qaaaq-cai") : actor {};
    public shared ({ caller }) func init(ownerPrincipal : Principal) : async () {
        assert (caller == Principal.fromActor(cardinal));
        assert (Option.isNull(owner));
        owner := ?ownerPrincipal;
        allowedReaders.put(ownerPrincipal, ()); // Owner is always allowed
    };

    // **Upload Functions**
    public shared ({ caller }) func initKhetUpload(khetMetadata : KhetMetadata) : async { #existing : Text; #new : Text; } {
        switch (owner) {
            case (?own) {
                assert (caller == own);
                let existing = hashToBlobId.get(khetMetadata.hash);
                switch (existing) {
                    case (?(blobId, true)) {
                        let gltfDataRef = (Principal.fromActor(UserNode), blobId, khetMetadata.gltfDataSize);
                        let updatedKhet = {
                            khetMetadata with gltfDataRef = ?gltfDataRef
                        };
                        khets.put(khetMetadata.khetId, updatedKhet);
                        return #existing(blobId);
                    };
                    case (_) {
                        let newBlobId = khetMetadata.khetId; // Using khetId as blobId for simplicity
                        hashToBlobId.put(khetMetadata.hash, (newBlobId, false));
                        let gltfDataRef = (Principal.fromActor(UserNode), newBlobId, khetMetadata.gltfDataSize);
                        let updatedKhet = {
                            khetMetadata with gltfDataRef = ?gltfDataRef
                        };
                        pendingKhets.put(khetMetadata.khetId, updatedKhet);
                        return #new(newBlobId);
                    };
                };
            };
            case null {
                assert (false); // Should not happen post-init
                return #new("");
            };
        };
    };

    public shared ({ caller }) func finalizeKhetUpload(khetId : Text, blobId : Text, totalChunks : Nat) : async ?Text {
        switch (owner) {
            case (?own) {
                assert (caller == own);
                let khetOpt = pendingKhets.get(khetId);
                switch (khetOpt) {
                    case (null) { return ?"Khet not found in pending store" };
                    case (?khet) {
                        switch (khet.gltfDataRef) {
                            case (null) {
                                return ?"gltfDataRef is unexpectedly null";
                            };
                            case (?ref) {
                                let finalizeResult = await finalizeBlob(blobId, ref.2, totalChunks);
                                switch (finalizeResult) {
                                    case (?error) { return ?error };
                                    case (null) {
                                        khets.put(khet.khetId, khet);
                                        pendingKhets.delete(khet.khetId);
                                        switch (hashToBlobId.get(khet.hash)) {
                                            case (?(existingBlobId, _)) {
                                                hashToBlobId.put(khet.hash, (existingBlobId, true));
                                            };
                                            case (null) {};
                                        };
                                        return null;
                                    };
                                };
                            };
                        };
                    };
                };
            };
            case null { return ?"Owner not set" };
        };
    };

    public shared ({ caller }) func abortKhetUpload(khetId : Text) : async () {
        switch (owner) {
            case (?own) {
                assert (caller == own);
                pendingKhets.delete(khetId);
            };
            case null {
                assert (false);
            };
        };
    };

    // **Query Functions**
    public query ({ caller }) func getKhet(khetId : Text) : async ?KhetMetadata {
        switch (owner) {
            case (?own) {
                if (caller == own or Option.isSome(allowedReaders.get(caller))) {
                    return khets.get(khetId);
                };
                return null;
            };
            case null {
                return null;
            };
        };
    };

    public query ({ caller }) func getAllKhets() : async [KhetMetadata] {
        switch (owner) {
            case (?own) {
                if (caller == own or Option.isSome(allowedReaders.get(caller))) {
                    return Iter.toArray(khets.vals());
                };
                return [];
            };
            case null {
                return [];
            };
        };
    };

    public query ({ caller }) func getSceneObjectKhets() : async [KhetMetadata] {
        switch (owner) {
            case (?own) {
                if (caller == own or Option.isSome(allowedReaders.get(caller))) {
                    let allKhets = Iter.toArray(khets.entries());
                    let filtered = Array.filter<(Text, KhetMetadata)>(
                        allKhets,
                        func((_, khet)) {
                            khet.khetType == "SceneObject";
                        },
                    );
                    return Array.map<(Text, KhetMetadata), KhetMetadata>(filtered, func((_, khet)) { khet });
                };
                return [];
            };
            case null {
                return [];
            };
        };
    };

    // **Management Functions**
    public shared ({ caller }) func addReader(reader : Principal) : async () {
        switch (owner) {
            case (?own) {
                assert (caller == own);
                allowedReaders.put(reader, ());
            };
            case null {
                assert (false);
            };
        };
    };

    public shared ({ caller }) func removeReader(reader : Principal) : async () {
        switch (owner) {
            case (?own) {
                assert (caller == own);
                allowedReaders.delete(reader);
            };
            case null {
                assert (false);
            };
        };
    };

    public shared ({ caller }) func removeKhet(khetId : Text) : async () {
        switch (owner) {
            case (?own) {
                assert (caller == own); // Only the owner can delete
                khets.delete(khetId);   // Remove from the khets HashMap
                pendingKhets.delete(khetId); // Clean up any pending Khet with this ID
            };
            case null {
                assert (false); // Should not happen post-initialization
            };
        };
    };

    public shared ({ caller }) func clearAllKhets() : async () {
        switch (owner) {
            case (?own) {
                assert (caller == own);
                khets := HashMap.HashMap<Text, KhetMetadata>(10, Text.equal, Text.hash);
                pendingKhets := HashMap.HashMap<Text, KhetMetadata>(10, Text.equal, Text.hash);
                hashToBlobId := HashMap.HashMap<Text, (Text, Bool)>(10, Text.equal, Text.hash);
            };
            case null {
                assert (false);
            };
        };
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
                    case (null) { null }; // Chunk not found
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
        blobStore.delete(blobId); // Remove chunks
        blobMetaStore.delete(blobId); // Remove metadata
    };

    // Clear all blobs and metadata from storage
    public func clearBlobs() : async () {
        blobStore := HashMap.HashMap<Text, [(Nat, Blob)]>(10, Text.equal, Text.hash); // Reset chunk storage
        blobMetaStore := HashMap.HashMap<Text, Nat>(10, Text.equal, Text.hash); // Reset metadata storage
    };
};