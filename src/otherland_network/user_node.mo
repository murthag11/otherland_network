import Principal "mo:core/Principal";
import Map "mo:core/Map";
import Option "mo:core/Option";
import Nat "mo:core/Nat";
import Iter "mo:core/Iter";
import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Array "mo:core/Array";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Order "mo:core/Order";
import Float "mo:core/Float";
import Cycles "mo:core/Cycles";

import Types "types";
import Compare "compare";
import Access "access";

persistent actor UserNode {

    // Set on init() to the factory canister that created this node.
    var cardinalId : Principal = Principal.fromText("aaaaa-aa");

    // Types
    type Position     = Types.Position;
    type Size         = Types.Size;
    type Scale        = Types.Scale;
    type KhetMetadata = Types.KhetMetadata;
    type PlayerData   = Types.PlayerData;
    type Message      = Types.Message;

    transient let principalCompare = Compare.principalCompare;


    // **Stable Variables**
    var owner : ?Principal = null;
    var allowedReadersEntries : [(Principal, ())] = [];
    var allowedWritersEntries : [(Principal, ())] = [];
    var khetStore : [(Text, KhetMetadata)] = [];
    var khetPermissionsEntries : [(Text, ([Principal], [Principal]))] = [];
    var pendingKhetStore : [(Text, KhetMetadata)] = [];
    var hashToBlobIdStore : [(Text, (Text, Bool))] = [];
    var blobStoreStable : [(Text, [(Nat, Blob)])] = [];
    var blobMetaStoreStable : [(Text, Nat)] = [];
    var messages : [Message] = [];
    var playerStore : [(Principal, PlayerData)] = [];
    var username: ?Text = null;

    // **In-Memory HashMaps**
    transient var allowedReaders = Map.fromIter<Principal, ()>(allowedReadersEntries.vals(), principalCompare);
    transient var allowedWriters = Map.fromIter<Principal, ()>(allowedWritersEntries.vals(), principalCompare);
    transient var khets = Map.fromIter<Text, KhetMetadata>(khetStore.vals(), Text.compare);
    transient var khetPermissions = Map.fromIter<Text, ([Principal], [Principal])>(khetPermissionsEntries.vals(), Text.compare);
    transient var pendingKhets = Map.fromIter<Text, KhetMetadata>(pendingKhetStore.vals(), Text.compare);
    transient var hashToBlobId = Map.fromIter<Text, (Text, Bool)>(hashToBlobIdStore.vals(), Text.compare);
    transient var blobStore = Map.empty<Text, [(Nat, Blob)]>();
    transient var blobMetaStore = Map.empty<Text, Nat>();
    transient var players = Map.fromIter<Principal, PlayerData>(playerStore.vals(), principalCompare);

    transient let MAX_MESSAGES = 100;

    // **Upgrade Hooks**
    system func preupgrade() {
        allowedReadersEntries := Iter.toArray(allowedReaders.entries());
        allowedWritersEntries := Iter.toArray(allowedWriters.entries());
        khetStore := Iter.toArray(khets.entries());
        pendingKhetStore := Iter.toArray(pendingKhets.entries());
        hashToBlobIdStore := Iter.toArray(hashToBlobId.entries());
        blobStoreStable := Iter.toArray(blobStore.entries()); // Save blob chunks
        blobMetaStoreStable := Iter.toArray(blobMetaStore.entries()); // Save blob metadata
        khetPermissionsEntries := Iter.toArray(khetPermissions.entries());
        playerStore := Iter.toArray(players.entries());
    };

    system func postupgrade() {
        allowedReaders := Map.fromIter<Principal, ()>(allowedReadersEntries.vals(), principalCompare);
        allowedWriters := Map.fromIter<Principal, ()>(allowedWritersEntries.vals(), principalCompare);
        khets := Map.fromIter<Text, KhetMetadata>(khetStore.vals(), Text.compare);
        pendingKhets := Map.fromIter<Text, KhetMetadata>(pendingKhetStore.vals(), Text.compare);
        hashToBlobId := Map.fromIter<Text, (Text, Bool)>(hashToBlobIdStore.vals(), Text.compare);
        blobStore := Map.fromIter<Text, [(Nat, Blob)]>(blobStoreStable.vals(), Text.compare); // Restore chunks
        blobMetaStore := Map.fromIter<Text, Nat>(blobMetaStoreStable.vals(), Text.compare); // Restore metadata
        khetPermissions := Map.fromIter<Text, ([Principal], [Principal])>(khetPermissionsEntries.vals(), Text.compare);
        players := Map.fromIter<Principal, PlayerData>(playerStore.vals(), principalCompare);
    };

    // **Initialization by Cardinal**
    public shared ({ caller }) func init(ownerPrincipal : Principal) : async () {
        assert (Option.isNull(owner));  // Prevent re-initialization
        // First initializer is treated as the factory (Cardinal). Prefer canister callers.
        assert (Principal.isCanister(caller));
        cardinalId := caller;
        owner := ?ownerPrincipal;
        allowedReaders.add(principalCompare, ownerPrincipal, ()); // Owner is always allowed
        allowedWriters.add(principalCompare, ownerPrincipal, ());
    };

    // Allow redeployed Cardinal to reclaim the factory link (owner or current cardinal only).
    public shared ({ caller }) func setCardinalId(newCardinal : Principal) : async Result.Result<(), Text> {
        switch (owner) {
            case (?own) {
                if (caller != own and caller != cardinalId) {
                    return #err("Unauthorized");
                };
            };
            case null {
                if (caller != cardinalId) {
                    return #err("Unauthorized");
                };
            };
        };
        cardinalId := newCardinal;
        #ok(())
    };

    // Accept cycles sent from Cardinal top-ups
    public shared func acceptCycles() : async () {
        ignore Cycles.accept<system>(Cycles.available());
    };

    // Grant/revoke functions for better access control management
    public shared({ caller }) func grantReadAccess(user: Principal) : async () {
        switch (owner) { case (?own) { if (caller == own) allowedReaders.add(principalCompare, user, ()); }; case null {}; };
    };

    public shared({ caller }) func revokeReadAccess(user: Principal) : async () {
        switch (owner) { case (?own) { if (caller == own) allowedReaders.remove(principalCompare, user); }; case null {}; };
    };

    public shared({ caller }) func grantWriteAccess(user: Principal) : async () {
        switch (owner) { case (?own) { if (caller == own) allowedWriters.add(principalCompare, user, ()); }; case null {}; };
    };

    public shared({ caller }) func revokeWriteAccess(user: Principal) : async () {
        switch (owner) { case (?own) { if (caller == own) allowedWriters.remove(principalCompare, user); }; case null {}; };
    };

    // **Upload Functions**
    public shared ({ caller }) func initKhetUpload(khetMetadata : KhetMetadata) : async { #existing : Text; #new : Text; } {
        switch (owner) {
            case (?own) {
                assert (caller == own);
                let existing = hashToBlobId.get(Text.compare, khetMetadata.hash);
                switch (existing) {
                    case (?(blobId, true)) {
                        let gltfDataRef = (Principal.fromActor(UserNode), blobId, khetMetadata.gltfDataSize);
                        let updatedKhet = {
                            khetMetadata with gltfDataRef = ?gltfDataRef
                        };
                        khets.add(Text.compare, khetMetadata.khetId, updatedKhet);
                        return #existing(blobId);
                    };
                    case (_) {
                        let newBlobId = khetMetadata.khetId; // Using khetId as blobId for simplicity
                        hashToBlobId.add(Text.compare, khetMetadata.hash, (newBlobId, false));
                        let gltfDataRef = (Principal.fromActor(UserNode), newBlobId, khetMetadata.gltfDataSize);
                        let updatedKhet = {
                            khetMetadata with gltfDataRef = ?gltfDataRef
                        };
                        pendingKhets.add(Text.compare, khetMetadata.khetId, updatedKhet);
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
                let khetOpt = pendingKhets.get(Text.compare, khetId);
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
                                        khets.add(Text.compare, khet.khetId, khet);
                                        pendingKhets.remove(Text.compare, khet.khetId);
                                        switch (hashToBlobId.get(Text.compare, khet.hash)) {
                                            case (?(existingBlobId, _)) {
                                                hashToBlobId.add(Text.compare, khet.hash, (existingBlobId, true));
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
                pendingKhets.remove(Text.compare, khetId);
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
                if (caller == own or Option.isSome(allowedReaders.get(principalCompare, caller))) {
                    return khets.get(Text.compare, khetId);
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
                if (caller == own or Option.isSome(allowedReaders.get(principalCompare, caller))) {
                    return Iter.toArray(Iter.map(khets.entries(), func((k,v)) { v }));
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
                if (caller == own or Option.isSome(allowedReaders.get(principalCompare, caller))) {
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
    public shared({ caller }) func addReader(reader: Principal) : async () {
        switch (owner) {
            case (?own) {
                if (caller == own or caller == cardinalId) {
                    allowedReaders.add(principalCompare, reader, ());
                } else {
                    assert (false); // Unauthorized
                };
            };
            case null {
                assert (false); // Owner not set
            };
        };
    };

    public shared ({ caller }) func removeReader(reader : Principal) : async () {
        switch (owner) {
            case (?own) {
                assert (caller == own);
                allowedReaders.remove(principalCompare, reader);
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
                khets.remove(Text.compare, khetId);   // Remove from the khets HashMap
                pendingKhets.remove(Text.compare, khetId); // Clean up any pending Khet with this ID
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
                khets := Map.empty<Text, KhetMetadata>();
                pendingKhets := Map.empty<Text, KhetMetadata>();
                hashToBlobId := Map.empty<Text, (Text, Bool)>();
            };
            case null {
                assert (false);
            };
        };
    };

    // Store a chunk of a blob's data (owner or writers only)
    public shared ({ caller }) func storeBlobChunk(blobId : Text, chunkIndex : Nat, chunkData : Blob) : async () {
        assert (Access.isWriter(owner, allowedWriters, caller));
        let existingChunks = Option.get(blobStore.get(Text.compare, blobId), []); // Get existing chunks or empty array
        let newChunks = Array.tabulate(existingChunks.size() + 1, func(i) : (Nat, Blob) = if (i < existingChunks.size()) existingChunks[i] else (chunkIndex, chunkData)); // Append new chunk
        blobStore.add(Text.compare, blobId, newChunks); // Update blob storage
    };

    // Finalize a blob by verifying chunk count and recording its total size
    public shared ({ caller }) func finalizeBlob(blobId : Text, totalSize : Nat, totalChunks : Nat) : async ?Text {
        if (not Access.isWriter(owner, allowedWriters, caller)) {
            return ?"Unauthorized";
        };
        switch (blobStore.get(Text.compare, blobId)) {
            case (null) {
                return ?("No chunks found for blobId: " # blobId); // Error if no chunks exist
            };
            case (?chunks) {
                if (chunks.size() != totalChunks) {
                    return ?("Missing chunks for blobId: " # blobId # ". Expected " # Nat.toText(totalChunks) # ", got " # Nat.toText(chunks.size()));
                };
                var actualSize : Nat = 0;
                for ((_, chunk) in chunks.vals()) {
                    actualSize += chunk.size();
                };
                if (actualSize != totalSize) {
                    return ?("Size mismatch for blobId: " # blobId # ". Expected " # Nat.toText(totalSize) # ", got " # Nat.toText(actualSize));
                };
                blobMetaStore.add(Text.compare, blobId, totalSize); // Record total size
                return null; // Success
            };
        };
    };

    // Query function to retrieve a specific chunk of a blob
    public query ({ caller }) func getBlobChunk(blobId : Text, chunkIndex : Nat) : async ?Blob {
        if (not Access.isReader(owner, allowedReaders, caller)) {
            return null;
        };
        switch (blobStore.get(Text.compare, blobId)) {
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
    public query ({ caller }) func getBlobSize(blobId : Text) : async ?Nat {
        if (not Access.isReader(owner, allowedReaders, caller)) {
            return null;
        };
        blobMetaStore.get(Text.compare, blobId) // Return size if found, otherwise null
    };

    // Delete a blob and its metadata
    public shared ({ caller }) func deleteBlob(blobId : Text) : async () {
        assert (Access.isWriter(owner, allowedWriters, caller));
        blobStore.remove(Text.compare, blobId); // Remove chunks
        blobMetaStore.remove(Text.compare, blobId); // Remove metadata
    };

    // Clear all blobs and metadata from storage
    public shared ({ caller }) func clearBlobs() : async () {
        assert (Access.isOwner(owner, caller));
        blobStore := Map.empty<Text, [(Nat, Blob)]>(); // Reset chunk storage
        blobMetaStore := Map.empty<Text, Nat>(); // Reset metadata storage
    };

    // Join Session: Register a player
    public shared ({ caller }) func joinSession() : async Principal {
        let playerData = {
            principal = caller;
            position = (0.0, 0.0, 0.0);
            signalingMessages = [];
            lastUpdate = Time.now();
        };
        players.add(principalCompare, caller, playerData);
        return caller;
    };

    // Leave Session: Remove a player
    public shared ({ caller }) func leaveSession() : async () {
        players.remove(principalCompare, caller);
    };

    // Update Position: Receive player positions
    public shared ({ caller }) func updatePosition(pos: Position) : async () {
        switch (players.get(principalCompare, caller)) {
            case (?player) {
                let updatedPlayer = {
                    principal = player.principal;
                    position = pos;
                    signalingMessages = player.signalingMessages;
                    lastUpdate = Time.now();
                };
                players.add(principalCompare, caller, updatedPlayer);
            };
            case null {};
        };
    };

    // Get All Player Positions: Query positions
    public query ({ caller }) func getAllPlayerPositions() : async [(Principal, Position)] {
        if (Option.isSome(allowedReaders.get(principalCompare, caller))) {
            Iter.toArray<(Principal, Position)>(
                Iter.map<(Principal, PlayerData), (Principal, Position)>(
                    players.entries(),
                    func (entry: (Principal, PlayerData)) : (Principal, Position) {
                        let (p, d) = entry;
                        (p, d.position)
                    }
                )
            )
        } else { [] };
    };

    // Signaling Messages: Facilitate WebRTC P2P connections
    public shared ({ caller }) func sendSignalingMessage(to: Principal, message: Text) : async () {
        switch (players.get(principalCompare, to)) {
            case (?recipient) {
                let updatedMessages = Array.tabulate(recipient.signalingMessages.size() + 1, func(i) : (Principal, Text) = if (i < recipient.signalingMessages.size()) recipient.signalingMessages[i] else (caller, message));
                let updatedPlayer = {
                    principal = recipient.principal;
                    position = recipient.position;
                    signalingMessages = updatedMessages;
                    lastUpdate = recipient.lastUpdate;
                };
                players.add(principalCompare, to, updatedPlayer);
            };
            case null {};
        };
    };

    public query ({ caller }) func getSignalingMessages() : async [(Principal, Text)] {
        switch (players.get(principalCompare, caller)) {
            case (?player) { player.signalingMessages };
            case null { [] };
        };
    };

    // Update Khet Metadata: writers (node or per-khet) only
    public shared ({ caller }) func updateKhetMetadata(khetId: Text, newMetadata: KhetMetadata) : async Result.Result<(), Text> {
        switch (khets.get(Text.compare, khetId)) {
            case (?_) {
                let khetWriters = switch (khetPermissions.get(Text.compare, khetId)) {
                    case (?(_, writers)) { ?writers };
                    case null { null };
                };
                if (not Access.canWriteKhet(owner, allowedWriters, khetWriters, caller)) {
                    return #err("Unauthorized");
                };
                khets.add(Text.compare, khetId, newMetadata);
                return #ok(());
            };
            case null { return #err("Khet not found") };
        };
    };

    // NEW: Per-khet permissions
    public shared({ caller }) func updateKhetPermission(khetId: Text, allowedReadersList: [Principal], allowedWritersList: [Principal]) : async Result.Result<(), Text> {
        switch (owner) {
        case (?own) { if (caller != own) return #err("Only owner"); };
        case null { return #err("Owner not set"); };
        };
        khetPermissions.add(Text.compare, khetId, (allowedReadersList, allowedWritersList));
        #ok(());
    };

    // Filtered khets query (same access rules as getAllKhets)
    public query({ caller }) func getKhetsByType(khetType: Text, _includePrivate: Bool) : async [KhetMetadata] {
        if (not Access.isReader(owner, allowedReaders, caller)) {
            return [];
        };
        Array.filter(
            Iter.toArray(Iter.map(khets.entries(), func((_, v)) { v })),
            func(k : KhetMetadata) : Bool { k.khetType == khetType }
        )
    };

    // NEW: delete + basic backup
    public shared({ caller }) func deleteKhet(khetId: Text) : async () {
        switch (owner) { 
            case (?own) { 
                if (caller == own) { 
                    khets.remove(Text.compare, khetId); 
                    pendingKhets.remove(Text.compare, khetId); 
                }; 
            }; 
            case null {}; 
        };
    };

    public shared({ caller }) func backupKhets() : async Text {
        switch (owner) { 
            case (?own) { 
                if (caller == own) { 
                    return debug_show(Iter.toArray(khets.entries())); 
                } else {
                    return "";   // or "Unauthorized" if you prefer
                }; 
            }; 
            case null { 
                return ""; 
            }; 
        };
    };

    // Cycle & storage exposure
    public query func getCyclesBalance() : async Nat {
        Cycles.balance();
    };

    public query func getStorageUsage() : async Nat {  // rough
        // You can improve this with stable var size tracking if needed
        0;
    };

    // Set username (only owner)
    public shared({ caller }) func setUsername(newName: Text) : async Result.Result<(), Text> {
        let own = switch (owner) {
            case (?o) { o };
            case null { return #err("Owner not set"); };
        };

        if (caller != own) return #err("Only owner can set username");

        // Call Cardinal to check uniqueness
        let cardinal = actor(Principal.toText(cardinalId)) : actor {
            isUsernameTaken : (Text) -> async Bool;
            registerUsername : (Text, Principal) -> async Result.Result<(), Text>;
        };
        if (await cardinal.isUsernameTaken(newName)) {
            return #err("Username already taken");
        };

        username := ?newName;
        switch (await cardinal.registerUsername(newName, own)) {
            case (#ok(())) { #ok(()) };
            case (#err(msg)) { #err("Failed to register username: " # msg) };
        };
    };

    // Get username (query)
    public query ({ caller }) func getUsername() : async ?Text {
        switch (owner) {
            case (?own) {
                if (caller == own) return username;
                return null;
            };
            case null { return null };
        };
    };

    // Get Nearby Players: Identify the 5 closest players
    public query ({ caller }) func getNearbyPlayers(count: Nat) : async [Principal] {
        switch (players.get(principalCompare, caller)) {
            case (?callerData) {
                let distances = Iter.toArray<(Principal, Float)>(
                    Iter.map<(Principal, PlayerData), (Principal, Float)>(
                        players.entries(),
                        func (entry: (Principal, PlayerData)) : (Principal, Float) {
                            let (p, d) = entry;
                            if (p == caller) {
                                (p, 0.0)
                            } else {
                                let dx = d.position.0 - callerData.position.0;
                                let dy = d.position.1 - callerData.position.1;
                                let dz = d.position.2 - callerData.position.2;
                                (p, Float.sqrt(dx * dx + dy * dy + dz * dz))
                            }
                        }
                    )
                );
                let sorted = Array.sort(distances, func (a: (Principal, Float), b: (Principal, Float)) : Order.Order {
                    Float.compare(a.1, b.1)
                });
                let topN = Array.tabulate(Nat.min(count + 1, sorted.size()), func(i) = sorted[i]);
                Array.filterMap(topN, func ((p, _): (Principal, Float)) : ?Principal {
                    if (p == caller) { null } else { ?p }
                })
            };
            case null { [] };
        };
    };

    // Store new Chat message into Array (session participants / readers only)
    public shared ({ caller }) func sendChatMessage(message: Message) : async () {
        assert (Access.isReader(owner, allowedReaders, caller) or Option.isSome(players.get(principalCompare, caller)));
        let stamped : Message = {
            sender = Principal.toText(caller);
            text = message.text;
            timestamp = Time.now();
        };
        messages := Array.tabulate(messages.size() + 1, func(i : Nat) : Message { if (i == 0) stamped else messages[i - 1] });
        if (messages.size() > MAX_MESSAGES) {
            messages := Array.tabulate(Nat.min(MAX_MESSAGES, messages.size()), func(i : Nat) : Message { messages[i] });
        };
    };

    // Query function to get the last 100 chat messages
    public query ({ caller }) func getChatHistory() : async [Message] {
        if (not Access.isReader(owner, allowedReaders, caller) and Option.isNull(players.get(principalCompare, caller))) {
            return [];
        };
        messages;
    };
};