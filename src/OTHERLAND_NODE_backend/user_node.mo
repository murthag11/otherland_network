import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Option "mo:base/Option";
import Nat "mo:base/Nat";
import _Nat32 "mo:base/Nat32";
import Iter "mo:base/Iter";
import Text "mo:base/Text";
import Blob "mo:base/Blob";
import Array "mo:base/Array";

actor {

  // **Stable Variables**
  stable var owner : ?Principal = null;
  stable var allowedReadersEntries : [(Principal, ())] = [];
  stable var khetStore : [(Text, KhetMetadata)] = [];
  stable var pendingKhetStore : [(Text, KhetMetadata)] = [];
  stable var hashToBlobIdStore : [(Text, (Text, Bool))] = [];

  // **In-Memory HashMaps**
  var allowedReaders = HashMap.fromIter<Principal, ()>(
    allowedReadersEntries.vals(),
    10,
    Principal.equal,
    Principal.hash
  );
  var khets = HashMap.fromIter<Text, KhetMetadata>(
    khetStore.vals(),
    10,
    Text.equal,
    Text.hash
  );
  var pendingKhets = HashMap.fromIter<Text, KhetMetadata>(
    pendingKhetStore.vals(),
    10,
    Text.equal,
    Text.hash
  );
  var hashToBlobId = HashMap.fromIter<Text, (Text, Bool)>(
    hashToBlobIdStore.vals(),
    10,
    Text.equal,
    Text.hash
  );

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
  };

  system func postupgrade() {
    allowedReaders := HashMap.fromIter<Principal, ()>(
      allowedReadersEntries.vals(),
      10,
      Principal.equal,
      Principal.hash
    );
    khets := HashMap.fromIter<Text, KhetMetadata>(
      khetStore.vals(),
      10,
      Text.equal,
      Text.hash
    );
    pendingKhets := HashMap.fromIter<Text, KhetMetadata>(
      pendingKhetStore.vals(),
      10,
      Text.equal,
      Text.hash
    );
    hashToBlobId := HashMap.fromIter<Text, (Text, Bool)>(
      hashToBlobIdStore.vals(),
      10,
      Text.equal,
      Text.hash
    );
  };

  // **Initialization by Cardinal**
  let cardinal = actor("bw4dl-smaaa-aaaaa-qaacq-cai") : actor {}; // Replace with actual cardinal canister ID
  public shared({ caller }) func init(ownerPrincipal : Principal) : async () {
    assert(caller == Principal.fromActor(cardinal));
    assert(Option.isNull(owner));
    owner := ?ownerPrincipal;
    allowedReaders.put(ownerPrincipal, ()); // Owner is always allowed
  };

  // **Upload Functions**
  public shared({ caller }) func initKhetUpload(khetMetadata : KhetMetadata, storageCanisterId : Principal) : async {#existing : Text; #new : Text} {
    switch (owner) {
      case (?own) {
        assert(caller == own);
        let existing = hashToBlobId.get(khetMetadata.hash);
        switch (existing) {
          case (? (blobId, true)) {
            let gltfDataRef = (storageCanisterId, blobId, khetMetadata.gltfDataSize);
            let updatedKhet = { khetMetadata with gltfDataRef = ?gltfDataRef };
            khets.put(khetMetadata.khetId, updatedKhet);
            return #existing(blobId);
          };
          case (_) {
            let newBlobId = khetMetadata.khetId; // Using khetId as blobId for simplicity
            hashToBlobId.put(khetMetadata.hash, (newBlobId, false));
            let gltfDataRef = (storageCanisterId, newBlobId, khetMetadata.gltfDataSize);
            let updatedKhet = { khetMetadata with gltfDataRef = ?gltfDataRef };
            pendingKhets.put(khetMetadata.khetId, updatedKhet);
            return #new(newBlobId);
          };
        };
      };
      case null {
        assert(false); // Should not happen post-init
        return #new("");
      };
    };
  };

  public shared({ caller }) func finalizeKhetUpload(khetId : Text, storageCanisterId : Principal, blobId : Text, totalChunks : Nat) : async ?Text {
    switch (owner) {
      case (?own) {
        assert(caller == own);
        let khetOpt = pendingKhets.get(khetId);
        switch (khetOpt) {
          case (null) {
            return ?"Khet not found in pending store";
          };
          case (?khet) {
            switch (khet.gltfDataRef) {
              case (null) {
                return ?"gltfDataRef is unexpectedly null";
              };
              case (?ref) {
                let storageActor = actor (Principal.toText(storageCanisterId)) : actor {
                  finalizeBlob : (Text, Nat, Nat) -> async ?Text;
                };
                let finalizeResult = await storageActor.finalizeBlob(blobId, ref.2, totalChunks);
                switch (finalizeResult) {
                  case (?error) {
                    return ?error;
                  };
                  case (null) {
                    khets.put(khet.khetId, khet);
                    pendingKhets.delete(khet.khetId);
                    switch (hashToBlobId.get(khet.hash)) {
                      case (? (existingBlobId, _)) {
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
      case null {
        return ?"Owner not set";
      };
    };
  };

  public shared({ caller }) func abortKhetUpload(khetId : Text) : async () {
    switch (owner) {
      case (?own) {
        assert(caller == own);
        pendingKhets.delete(khetId);
      };
      case null {
        assert(false);
      };
    };
  };

  // **Query Functions**
  public query({ caller }) func getKhet(khetId : Text) : async ?KhetMetadata {
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

  public query({ caller }) func getAllKhets() : async [KhetMetadata] {
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

  public query({ caller }) func getSceneObjectKhets() : async [KhetMetadata] {
    switch (owner) {
      case (?own) {
        if (caller == own or Option.isSome(allowedReaders.get(caller))) {
          let allKhets = Iter.toArray(khets.entries());
          let filtered = Array.filter<(Text, KhetMetadata)>(allKhets, func((_, khet)) {
            khet.khetType == "SceneObject"
          });
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
  public shared({ caller }) func addReader(reader : Principal) : async () {
    switch (owner) {
      case (?own) {
        assert(caller == own);
        allowedReaders.put(reader, ());
      };
      case null {
        assert(false);
      };
    };
  };

  public shared({ caller }) func removeReader(reader : Principal) : async () {
    switch (owner) {
      case (?own) {
        assert(caller == own);
        allowedReaders.delete(reader);
      };
      case null {
        assert(false);
      };
    };
  };

  public shared({ caller }) func clearAllKhets() : async () {
    switch (owner) {
      case (?own) {
        assert(caller == own);
        khets := HashMap.HashMap<Text, KhetMetadata>(10, Text.equal, Text.hash);
        pendingKhets := HashMap.HashMap<Text, KhetMetadata>(10, Text.equal, Text.hash);
        hashToBlobId := HashMap.HashMap<Text, (Text, Bool)>(10, Text.equal, Text.hash);
      };
      case null {
        assert(false);
      };
    };
  };
};