import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Cycles "mo:base/ExperimentalCycles";
import _Error "mo:base/Error";
import Blob "mo:base/Blob";
import Option "mo:base/Option";
import Result "mo:base/Result";
import Iter "mo:base/Iter";

actor Cardinal {

  // Stable variables for raw data
  stable var adminPrincipal : Principal = Principal.fromText("your-ii-principal-here");
  stable var registryEntries : [(Principal, Principal)] = [];
  stable var wasmModule : ?Blob = null;
  stable var isWasmReady : Bool = false;
  stable var accessControlEntries : [(Principal, [(Principal, ())])] = [];

  // In-memory HashMaps reconstructed from stable data
  var registry = HashMap.fromIter<Principal, Principal>(
    registryEntries.vals(),
    10,
    Principal.equal,
    Principal.hash
  );
  var accessControl = HashMap.fromIter<Principal, HashMap.HashMap<Principal, ()>>(
    Iter.map<(Principal, [(Principal, ())]), (Principal, HashMap.HashMap<Principal, ()>)>(
      accessControlEntries.vals(),
      func((user, allowedList)) {
        (user, HashMap.fromIter<Principal, ()>(allowedList.vals(), 10, Principal.equal, Principal.hash))
      }
    ),
    10,
    Principal.equal,
    Principal.hash
  );

  // Upgrade hooks to save and restore HashMap data
  system func preupgrade() {
    registryEntries := Iter.toArray(registry.entries());
    accessControlEntries := Iter.toArray(
      Iter.map<(Principal, HashMap.HashMap<Principal, ()>), (Principal, [(Principal, ())])>(
        accessControl.entries(),
        func((user, allowedMap)) {
          (user, Iter.toArray(allowedMap.entries()))
        }
      )
    );
  };

  system func postupgrade() {
    registry := HashMap.fromIter<Principal, Principal>(
      registryEntries.vals(),
      10,
      Principal.equal,
      Principal.hash
    );
    accessControl := HashMap.fromIter<Principal, HashMap.HashMap<Principal, ()>>(
      Iter.map<(Principal, [(Principal, ())]), (Principal, HashMap.HashMap<Principal, ()>)>(
        accessControlEntries.vals(),
        func((user, allowedList)) {
          (user, HashMap.fromIter<Principal, ()>(allowedList.vals(), 10, Principal.equal, Principal.hash))
        }
      ),
      10,
      Principal.equal,
      Principal.hash
    );
  };

  // Request a new canister
  public shared({ caller }) func requestCanister() : async Result.Result<Principal, Text> {
    if (not isWasmReady) {
      return #err("WASM module is not ready or is being updated. Please try again later.");
    };

    switch (registry.get(caller)) {
      case (?canisterId) {
        return #ok(canisterId); // Return existing canister ID
      };
      case null {
        // Create a new canister with initial cycle funding
        Cycles.add<system>(1_000_000_000_000); // 1T cycles
        let ic = actor("aaaaa-aa") : actor {                                                               // Placeholder admin principal
          create_canister : <system> () -> async { canister_id : Principal };
          install_code : <system>({ canister_id : Principal; wasm_module : Blob; arg : Blob; mode : { #install } }) -> async ();
        };
        let { canister_id } = await ic.create_canister();

        // Install the WASM module
        switch (wasmModule) {
          case (?wasmModuleBlob) {
            await ic.install_code({
              canister_id;
              wasm_module = wasmModuleBlob;
              arg = Blob.fromArray([]); // Empty args
              mode = #install;
            });
          };
          case null {
            return #err("WASM module not available.");
          };
        };

        // Initialize the user canister with the owner
        let userCanister = actor(Principal.toText(canister_id)) : actor {
          init : (Principal) -> async ();
        };
        await userCanister.init(caller);

        // Register the canister and set up access control
        registry.put(caller, canister_id);
        let allowedMap = HashMap.HashMap<Principal, ()>(10, Principal.equal, Principal.hash);
        allowedMap.put(caller, ()); // Owner is always allowed
        accessControl.put(caller, allowedMap);

        return #ok(canister_id);
      };
    };
  };

  // Get canister ID if the caller is authorized
  public query({ caller }) func getCanisterId(user : Principal) : async ?Principal {
    switch (accessControl.get(user)) {
      case (?allowedMap) {
        if (Option.isSome(allowedMap.get(caller))) {
          return registry.get(user);
        } else {
          return null;
        };
      };
      case null {
        return null;
      };
    };
  };

  // Add an allowed principal (only callable by the owner)
  public shared({ caller }) func addAllowed(allowed : Principal) : async Result.Result<(), Text> {
    switch (accessControl.get(caller)) {
      case (?allowedMap) {
        allowedMap.put(allowed, ());
        return #ok(());
      };
      case null {
        return #err("No canister found for this user.");
      };
    };
  };

  // Remove an allowed principal (only callable by the owner)
  public shared({ caller }) func removeAllowed(allowed : Principal) : async Result.Result<(), Text> {
    switch (accessControl.get(caller)) {
      case (?allowedMap) {
        allowedMap.delete(allowed);
        return #ok(());
      };
      case null {
        return #err("No canister found for this user.");
      };
    };
  };

  // Upload WASM module (restricted to an admin principal for simplicity)
  public shared({ caller }) func uploadWasmModule(wasmModuleBlob : Blob) : async () {
    // Replace with your admin principal in production
    assert(caller == adminPrincipal);                                                               // Placeholder admin principal
    isWasmReady := false; // Mark as not ready during upload
    wasmModule := ?wasmModuleBlob;
    isWasmReady := true; // Mark as ready after upload completes
  };

  // Upgrade the user's canister with the current WASM module
  public shared({ caller }) func upgradeCanister() : async Result.Result<(), Text> {
    switch (registry.get(caller)) {
      case (?canisterId) {
        switch (wasmModule) {
          case (?wasmModuleBlob) {
            let ic = actor("aaaaa-aa") : actor {
              install_code : <system>({ canister_id : Principal; wasm_module : Blob; arg : Blob; mode : { #upgrade } }) -> async ();
            };
            await ic.install_code({
              canister_id = canisterId;
              wasm_module = wasmModuleBlob;
              arg = Blob.fromArray([]); // Empty args
              mode = #upgrade;
            });
            return #ok(());
          };
          case null {
            return #err("WASM module not available.");
          };
        };
      };
      case null {
        return #err("No canister found for this user.");
      };
    };
  };
};