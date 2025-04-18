import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Option "mo:base/Option";
import Nat "mo:base/Nat";
import _Nat32 "mo:base/Nat32";
import Iter "mo:base/Iter";
import Text "mo:base/Text";
import Blob "mo:base/Blob";
import Array "mo:base/Array";
import Result "mo:base/Result";
import Time "mo:base/Time";
import Order "mo:base/Order";
import Float "mo:base/Float";
import Int "mo:base/Int";

actor UserNode {

    // **Stable Variables**
    stable var owner : ?Principal = null;
    stable var allowedReadersEntries : [(Principal, ())] = [];
    stable var khetStore : [(Text, KhetMetadata)] = [];
    stable var pendingKhetStore : [(Text, KhetMetadata)] = [];
    stable var hashToBlobIdStore : [(Text, (Text, Bool))] = [];
    stable var blobStoreStable : [(Text, [(Nat, Blob)])] = [];
    stable var blobMetaStoreStable : [(Text, Nat)] = [];
    stable var messages : [Message] = [];
    stable var playerStore : [(Principal, PlayerData)] = [];
    stable var username: ?Text = null;
    stable var friendsEntries: [(Principal, Text)] = [];
    stable var invitationsEntries: [(Text, Invitation)] = [];
    stable var invitationCounter: Nat = 0;

    // **In-Memory HashMaps**
    var allowedReaders = HashMap.fromIter<Principal, ()>(allowedReadersEntries.vals(), 10, Principal.equal, Principal.hash);
    var khets = HashMap.fromIter<Text, KhetMetadata>(khetStore.vals(), 10, Text.equal, Text.hash);
    var pendingKhets = HashMap.fromIter<Text, KhetMetadata>(pendingKhetStore.vals(), 10, Text.equal, Text.hash);
    var hashToBlobId = HashMap.fromIter<Text, (Text, Bool)>(hashToBlobIdStore.vals(), 10, Text.equal, Text.hash);
    var blobStore = HashMap.HashMap<Text, [(Nat, Blob)]>(10, Text.equal, Text.hash);
    var blobMetaStore = HashMap.HashMap<Text, Nat>(10, Text.equal, Text.hash);
    var players = HashMap.fromIter<Principal, PlayerData>(playerStore.vals(), 10, Principal.equal, Principal.hash);
    var friends = HashMap.HashMap<Principal, Text>(10, Principal.equal, Principal.hash);
    var invitations = HashMap.HashMap<Text, Invitation>(10, Text.equal, Text.hash);

    // **Type Definitions**
    public type Position = (Float, Float, Float);
    public type Size = (Float, Float, Float);
    public type Scale = (Float, Float, Float);

    type Friend = {
        principal: Principal;
        username: Text;
    };

    type Invitation = {
        targetPrincipal: Principal;
        inviterUsername: Text;
        expiration: Int;
    };

    let MAX_MESSAGES = 100;
    type Message = {
        sender: Text;
        text: Text;
        timestamp: Int;
    };

    type PlayerData = {
        principal: Principal;
        position: Position; // (Float, Float, Float)
        signalingMessages: [(Principal, Text)]; // (toPrincipal, message)
        lastUpdate: Int; // Timestamp for position updates
    };

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
        friendsEntries := Iter.toArray(friends.entries());
    invitationsEntries := Iter.toArray(invitations.entries());
    };

    system func postupgrade() {
        allowedReaders := HashMap.fromIter<Principal, ()>(allowedReadersEntries.vals(), 10, Principal.equal, Principal.hash);
        khets := HashMap.fromIter<Text, KhetMetadata>(khetStore.vals(), 10, Text.equal, Text.hash);
        pendingKhets := HashMap.fromIter<Text, KhetMetadata>(pendingKhetStore.vals(), 10, Text.equal, Text.hash);
        hashToBlobId := HashMap.fromIter<Text, (Text, Bool)>(hashToBlobIdStore.vals(), 10, Text.equal, Text.hash);
        blobStore := HashMap.fromIter<Text, [(Nat, Blob)]>(blobStoreStable.vals(), 10, Text.equal, Text.hash); // Restore chunks
        blobMetaStore := HashMap.fromIter<Text, Nat>(blobMetaStoreStable.vals(), 10, Text.equal, Text.hash); // Restore metadata
        friends := HashMap.fromIter<Principal, Text>(friendsEntries.vals(), 10, Principal.equal, Principal.hash);
        invitations := HashMap.fromIter<Text, Invitation>(invitationsEntries.vals(), 10, Text.equal, Text.hash);
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

    // Join Session: Register a player
    public shared ({ caller }) func joinSession() : async Principal {
        let playerData = {
            principal = caller;
            position = (0.0, 0.0, 0.0);
            signalingMessages = [];
            lastUpdate = Time.now();
        };
        players.put(caller, playerData);
        return caller;
    };

    // Leave Session: Remove a player
    public shared ({ caller }) func leaveSession() : async () {
        players.delete(caller);
    };

    // Update Position: Receive player positions
    public shared ({ caller }) func updatePosition(pos: Position) : async () {
        switch (players.get(caller)) {
            case (?player) {
                let updatedPlayer = {
                    principal = player.principal;
                    position = pos;
                    signalingMessages = player.signalingMessages;
                    lastUpdate = Time.now();
                };
                players.put(caller, updatedPlayer);
            };
            case null {};
        };
    };

    // Get All Player Positions: Query positions
    public query ({ caller }) func getAllPlayerPositions() : async [(Principal, Position)] {
        if (Option.isSome(allowedReaders.get(caller))) {
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
        switch (players.get(to)) {
            case (?recipient) {
                let updatedMessages = Array.append(recipient.signalingMessages, [(caller, message)]);
                let updatedPlayer = {
                    principal = recipient.principal;
                    position = recipient.position;
                    signalingMessages = updatedMessages;
                    lastUpdate = recipient.lastUpdate;
                };
                players.put(to, updatedPlayer);
            };
            case null {};
        };
    };

    public query ({ caller }) func getSignalingMessages() : async [(Principal, Text)] {
        switch (players.get(caller)) {
            case (?player) { player.signalingMessages };
            case null { [] };
        };
    };

    // Update Khet Metadata: Allow players to modify Khet data
    public shared ({ caller }) func updateKhetMetadata(khetId: Text, newMetadata: KhetMetadata) : async Result.Result<(), Text> {
        switch (owner) {
            case (?own) {
                if (caller != own and Option.isNull(allowedReaders.get(caller))) {
                    return #err("Unauthorized");
                };
                switch (khets.get(khetId)) {
                    case (?khet) {
                        // Simple permission: any logged-in player can update for now
                        khets.put(khetId, newMetadata);
                        return #ok(());
                    };
                    case null { return #err("Khet not found") };
                };
            };
            case null { return #err("Owner not set") };
        };
    };

    // Set username (only owner)
    public shared ({ caller }) func setUsername(newUsername: Text) : async () {
        switch (owner) {
            case (?own) {
                assert (caller == own);
                username := ?newUsername;
            };
            case null {
                owner := ?caller;
                username := ?newUsername;
            };
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

    // Generate friend invitation
    public shared ({ caller }) func generateFriendInvitation(targetPrincipal: Principal) : async Result.Result<Text, Text> {
        switch (owner, username) {
            case (?own, ?userName) {
                assert (caller == own);
                let nowNat = Int.abs(Time.now());
                let token = Nat.toText(invitationCounter) # "-" # Nat.toText(nowNat);
                invitationCounter += 1;
                let expiration = Time.now() + 24 * 3600 * 1_000_000_000; // 24 hours
                let invitation = {
                    targetPrincipal = targetPrincipal;
                    inviterUsername = userName;
                    expiration = expiration;
                };
                invitations.put(token, invitation);
                return #ok(token);
            };
            case _ {
                return #err("Owner or username not set");
            };
        };
    };

    // Accept friend invitation
    public shared ({ caller }) func acceptFriendInvitation(token: Text, inviteeUsername: Text) : async Result.Result<{ principal: Principal; username: Text }, Text> {
        switch (invitations.get(token)) {
            case (null) {
                return #err("Invalid token");
            };
            case (?invitation) {
                if (Time.now() > invitation.expiration) {
                    invitations.delete(token);
                    return #err("Invitation expired");
                };
                if (caller != invitation.targetPrincipal) {
                    return #err("Principal does not match invitation");
                };
                switch (owner) {
                    case (?own) {
                        friends.put(caller, inviteeUsername);
                        allowedReaders.put(caller, ()); // Grant access
                        invitations.delete(token);
                        return #ok({ principal = own; username = invitation.inviterUsername });
                    };
                    case null {
                        return #err("Owner not set");
                    };
                };
            };
        };
    };

    // Add friend manually
    public shared ({ caller }) func addFriend(friendPrincipal: Principal, friendUsername: Text) : async () {
        switch (owner) {
            case (?own) {
                assert (caller == own);
                friends.put(friendPrincipal, friendUsername);
                allowedReaders.put(friendPrincipal, ()); // Grant access
            };
            case null {
                assert (false);
            };
        };
    };

    // Get friends list (query)
    public query ({ caller }) func getFriends() : async [Friend] {
        switch (owner) {
            case (?own) {
                if (caller == own) {
                    return Iter.toArray(Iter.map(friends.entries(), func ((p, u): (Principal, Text)) : Friend { { principal = p; username = u } }));
                };
                return [];
            };
            case null { return [] };
        };
    };

    // Get Nearby Players: Identify the 5 closest players
    public query ({ caller }) func getNearbyPlayers(count: Nat) : async [Principal] {
        switch (players.get(caller)) {
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
                let topN = Array.subArray(sorted, 0, Nat.min(count + 1, sorted.size()));
                Array.mapFilter(topN, func ((p, _): (Principal, Float)) : ?Principal {
                    if (p == caller) { null } else { ?p }
                })
            };
            case null { [] };
        };
    };

    // Store new Chat message into Array
    public func sendChatMessage(message: Message) : async () {
        messages := Array.append([message], messages);
        if (messages.size() > MAX_MESSAGES) {
            messages := Array.subArray(messages, 0, MAX_MESSAGES);
        };
    };

    // Query function to get the last 100 chat messages
    public query func getChatHistory() : async [Message] {
        messages;
    };
};