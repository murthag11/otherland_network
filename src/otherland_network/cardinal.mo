import Principal "mo:core/Principal";
import Map "mo:core/Map";
import Cycles "mo:core/Cycles";
import _Error "mo:core/Error";
import Blob "mo:core/Blob";
import Option "mo:core/Option";
import Result "mo:core/Result";
import Iter "mo:core/Iter";
import List "mo:core/List";
import Array "mo:core/Array";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Time "mo:core/Time";
import Debug "mo:core/Debug";

import Types "types";
import Compare "compare";
import IcManagement "ic_management";

persistent actor Cardinal {

  // Types
  type Position       = Types.Position;
  type Size           = Types.Size;
  type Scale          = Types.Scale;
  type KhetMetadata   = Types.KhetMetadata;
  type PlayerData     = Types.PlayerData;
  type Message        = Types.Message;
  type NodeStatus     = Types.NodeStatus;
  type Invitation      = Types.Invitation;
  type FriendRequest   = Types.FriendRequest;
  type AuditLogEntry   = Types.AuditLogEntry;
  type CanisterDetails = Types.CanisterDetails;

  transient let principalCompare = Compare.principalCompare;


  // Stable variables for raw data
  var _adminPrincipal : Principal = Principal.fromText("fxhz4-w423j-q2chq-mcdn2-ihrcb-egwai-7eoh5-x4y76-3zzsk-4loyy-fqe");
  var registryEntries : [(Principal, Principal)] = [];
  var wasmModule : ?Blob = null;
  var isWasmReady : Bool = false;
  var accessControlEntries : [(Principal, [(Principal, ())])] = [];
  var friendListsEntries : [(Principal, [Principal])] = [];
  var friendRequestsEntries : [(Principal, [FriendRequest])] = [];
  var invitationsEntries : [(Text, Invitation)] = [];
  var invitationCounter : Nat = 0;
  var nodeVisibilityEntries : [(Principal, Bool)] = [];
  var blockedUsersEntries : [(Principal, ())] = [];
  var auditLogEntries : [Types.AuditLogEntry] = [];
  var usernameEntries : [(Text, Principal)] = [];

  // In-memory HashMaps reconstructed from stable data
  transient var registry = Map.fromIter<Principal, Principal>(
    registryEntries.vals(),
    principalCompare
  );
  transient var accessControl = Map.fromIter<Principal, Map.Map<Principal, ()>>(
    Iter.map<(Principal, [(Principal, ())]), (Principal, Map.Map<Principal, ()>)>(
      accessControlEntries.vals(),
      func((user, allowedList)) {
        (user, Map.fromIter<Principal, ()>(allowedList.vals(), principalCompare))
      }
    ),
    principalCompare
  );
  transient var friendLists = Map.fromIter<Principal, [Principal]>(
    friendListsEntries.vals(),
    principalCompare
  );
  transient var friendRequests = Map.fromIter<Principal, [FriendRequest]>(
    friendRequestsEntries.vals(),
    principalCompare
  );
  transient var invitations = Map.fromIter<Text, Invitation>(
      invitationsEntries.vals(),
      Text.compare
  );
  transient var nodeVisibility = Map.fromIter<Principal, Bool>(
    nodeVisibilityEntries.vals(),
    principalCompare
  );
  transient var blockedUsers = Map.fromIter<Principal, ()>(
    blockedUsersEntries.vals(), principalCompare
  );
  transient var auditLog : [Types.AuditLogEntry] = [];
  transient var usernames = Map.fromIter<Text, Principal>(
    usernameEntries.vals(), Text.compare
  );
  
  // Upgrade hooks to save and restore HashMap data
  system func preupgrade() {
    registryEntries := Iter.toArray(registry.entries());
    accessControlEntries := Iter.toArray(
      Iter.map<(Principal, Map.Map<Principal, ()>), (Principal, [(Principal, ())])>(
        accessControl.entries(),
        func((user, allowedMap)) {
          (user, Iter.toArray(allowedMap.entries()))
        }
      )
    );
    friendListsEntries := Iter.toArray(friendLists.entries());
    friendRequestsEntries := Iter.toArray(friendRequests.entries());
    invitationsEntries := Iter.toArray(invitations.entries());
    nodeVisibilityEntries := Iter.toArray(nodeVisibility.entries());
    blockedUsersEntries := Iter.toArray(
      Iter.map<Principal, (Principal, ())>(blockedUsers.keys(), func(p : Principal) : (Principal, ()) {
        (p, ())
      })
    );
    auditLogEntries := auditLog;
    usernameEntries := Iter.toArray(usernames.entries());
  };

  system func postupgrade() {
    registry := Map.fromIter<Principal, Principal>(
      registryEntries.vals(),
      principalCompare
    );
    accessControl := Map.fromIter<Principal, Map.Map<Principal, ()>>(
      Iter.map<(Principal, [(Principal, ())]), (Principal, Map.Map<Principal, ()>)>(
        accessControlEntries.vals(),
        func((user, allowedList)) {
          (user, Map.fromIter<Principal, ()>(allowedList.vals(), principalCompare))
        }
      ),
      principalCompare
    );
    friendLists := Map.fromIter<Principal, [Principal]>(
      friendListsEntries.vals(),
      principalCompare
    );
    friendRequests := Map.fromIter<Principal, [FriendRequest]>(
      friendRequestsEntries.vals(),
      principalCompare
    );
    invitations := Map.fromIter<Text, Invitation>(
        invitationsEntries.vals(),
        Text.compare
    );
    nodeVisibility := Map.fromIter<Principal, Bool>(
      nodeVisibilityEntries.vals(),
      principalCompare
    );
    blockedUsers := Map.fromIter<Principal, ()>(
      blockedUsersEntries.vals(),
      principalCompare
    );
    auditLog := auditLogEntries;
    usernames := Map.fromIter<Text, Principal>(
      usernameEntries.vals(),
      Text.compare
    );
  };

  // NEW: Admin functions
  public shared({ caller }) func setAdmin(newAdmin: Principal) : async () {
    if (caller != _adminPrincipal) return;
    _adminPrincipal := newAdmin;
    _logAudit(caller, "setAdmin", "New admin set");
  };

  public shared({ caller }) func getAllRegisteredUsers() : async [(Principal, Principal)] {  // user -> node canister
    if (caller != _adminPrincipal) return [];
    Iter.toArray(registry.entries());
  };

  public shared({ caller }) func getNodeStatus(user: Principal) : async ?Types.NodeStatus {
    if (caller != _adminPrincipal and caller != user) return null;
    switch (registry.get(principalCompare, user)) {
      case (?canisterId) {
        let isPublic = Option.get(nodeVisibility.get(principalCompare, user), false);
        let nodeActor = actor(Principal.toText(canisterId)) : actor { getCyclesBalance : () -> async Nat };
        let cycles = try { await nodeActor.getCyclesBalance() } catch (_) { 0 };
        ?{ canisterId; isPublic; cycles };
      };
      case null { null };
    };
  };

  public shared({ caller }) func topUpNodeCycles(user: Principal, amount: Nat) : async () {
    if (caller != _adminPrincipal) return;
    switch (registry.get(principalCompare, user)) {
      case (?canisterId) {
        await (with cycles = amount) (actor(Principal.toText(canisterId)) : actor { acceptCycles : () -> async () }).acceptCycles();
        _logAudit(caller, "topUpNodeCycles", "Topped up " # Nat.toText(amount) # " for " # Principal.toText(user));
      };
      case null {};
    };
  };

  public shared({ caller }) func blockUser(user: Principal, block: Bool) : async () {
    if (caller != _adminPrincipal) return;
    if (block) {
      blockedUsers.add(principalCompare, user, ());
    } else {
      blockedUsers.remove(principalCompare, user);
    };
    _logAudit(caller, "blockUser", Principal.toText(user) # " blocked=" # debug_show(block));
  };

  public query func isBlocked(user: Principal) : async Bool {
    Option.isSome(blockedUsers.get(principalCompare, user));
  };

  // Friend helper (cross-cutting recommendation)
  public query func isFriendWith(userA: Principal, userB: Principal) : async Bool {
    switch (friendLists.get(principalCompare, userA)) {
      case (?friends) { Array.find(friends, func(f: Principal) : Bool { f == userB }) != null };
      case null { false };
    };
  };

  // Friend List Management
  public shared({ caller }) func addFriend(friend : Principal) : async () {
    if (caller == friend) return; // Prevent adding self
    switch (friendLists.get(principalCompare, caller)) {
      case (?friends) {
        let existing = Array.find<Principal>(friends, func(f) { f == friend });
        if (existing == null) {
          let newFriends = Array.tabulate(friends.size() + 1, func(i : Nat) : Principal { if (i < friends.size()) friends[i] else friend });
          friendLists.add(principalCompare, caller, newFriends);
        };
      };
      case null {
        friendLists.add(principalCompare, caller, [friend]);
      };
    };
  };

  public shared({ caller }) func removeFriend(friend : Principal) : async () {
    switch (friendLists.get(principalCompare, caller)) {
      case (?friends) {
        let newFriends = Array.filter<Principal>(friends, func(f : Principal) : Bool { f != friend });
        friendLists.add(principalCompare, caller, newFriends);
      };
      case null {
        // No friends to remove
      };
    };
  };

  public query({ caller }) func getFriends() : async [Principal] {
    switch (friendLists.get(principalCompare, caller)) {
      case (?friends) { friends };
      case null { [] };
    };
  };

  // Send friend request by username or principal
  public shared({ caller }) func sendFriendRequest(identifier: Text) : async Result.Result<(), Text> {
    // Try to parse as principal first
    let targetPrincipal = try {
      Principal.fromText(identifier)
    } catch (_) {
      // If not a valid principal, treat as username
      switch (usernames.get(Text.compare, identifier)) {
        case (?p) { p };
        case null { return #err("Username not found or invalid principal") };
      };
    };

    // Check if already friends
    switch (friendLists.get(principalCompare, caller)) {
      case (?friends) {
        if (Option.isSome(Array.find(friends, func(f) { f == targetPrincipal }))) {
          return #err("Already friends");
        };
      };
      case null {};
    };

    // Check if request already exists
    switch (friendRequests.get(principalCompare, targetPrincipal)) {
      case (?requests) {
        if (Option.isSome(Array.find(requests, func(r) { r.from == caller }))) {
          return #err("Friend request already sent");
        };
      };
      case null {};
    };

    // Add request to target's pending requests
    let request : FriendRequest = {
      from = caller;
      to = targetPrincipal;
      timestamp = Time.now();
    };

    switch (friendRequests.get(principalCompare, targetPrincipal)) {
      case (?requests) {
        let newRequests = Array.tabulate(requests.size() + 1, func(i : Nat) : FriendRequest {
          if (i < requests.size()) requests[i] else request
        });
        friendRequests.add(principalCompare, targetPrincipal, newRequests);
      };
      case null {
        friendRequests.add(principalCompare, targetPrincipal, [request]);
      };
    };

    #ok(())
  };

  // Get pending friend requests
  public query({ caller }) func getPendingFriendRequests() : async [FriendRequest] {
    switch (friendRequests.get(principalCompare, caller)) {
      case (?requests) { requests };
      case null { [] };
    };
  };

  // Accept friend request
  public shared({ caller }) func acceptFriendRequest(from: Principal) : async Result.Result<(), Text> {
    switch (friendRequests.get(principalCompare, caller)) {
      case (?requests) {
        switch (Array.find(requests, func(r) { r.from == from })) {
          case (?_) {
            // Add to each other's friend lists
            // Add to caller's friends
            switch (friendLists.get(principalCompare, caller)) {
              case (?friends) {
                let existing = Array.find(friends, func(f) { f == from });
                if (existing == null) {
                  let newFriends = Array.tabulate(friends.size() + 1, func(i : Nat) : Principal {
                    if (i < friends.size()) friends[i] else from
                  });
                  friendLists.add(principalCompare, caller, newFriends);
                };
              };
              case null {
                friendLists.add(principalCompare, caller, [from]);
              };
            };
            // Add to sender's friends
            switch (friendLists.get(principalCompare, from)) {
              case (?friends) {
                let existing = Array.find(friends, func(f) { f == caller });
                if (existing == null) {
                  let newFriends = Array.tabulate(friends.size() + 1, func(i : Nat) : Principal {
                    if (i < friends.size()) friends[i] else caller
                  });
                  friendLists.add(principalCompare, from, newFriends);
                };
              };
              case null {
                friendLists.add(principalCompare, from, [caller]);
              };
            };
            // Remove the request
            let newRequests = Array.filter(requests, func(r) { r.from != from });
            friendRequests.add(principalCompare, caller, newRequests);
            #ok(())
          };
          case null { #err("No such friend request") };
        };
      };
      case null { #err("No pending requests") };
    };
  };

  // Decline friend request
  public shared({ caller }) func declineFriendRequest(from: Principal) : async Result.Result<(), Text> {
    switch (friendRequests.get(principalCompare, caller)) {
      case (?requests) {
        let newRequests = Array.filter(requests, func(r) { r.from != from });
        friendRequests.add(principalCompare, caller, newRequests);
        #ok(())
      };
      case null { #err("No pending requests") };
    };
  };

  // Generate a friend invitation
  public shared({ caller }) func generateFriendInvitation() : async Text {
      let token = Nat.toText(invitationCounter) # "-" # Int.toText(Time.now());
      invitationCounter += 1;
      let expiration = Time.now() + 7 * 24 * 3600 * 1_000_000_000; // 7 days in nanoseconds
      invitations.add(Text.compare, token, { inviter = caller; expiration });
      return token;
  };

  // Accept a friend invitation
  public shared({ caller }) func acceptFriendInvitation(token: Text) : async Result.Result<(), Text> {
      switch (invitations.get(Text.compare, token)) {
          case (null) { return #err("Invalid token") };
          case (?invitation) {
              if (Time.now() > invitation.expiration) {
                  invitations.remove(Text.compare, token);
                  return #err("Invitation expired");
              };
              // Add to each other's friend lists
              switch (friendLists.get(principalCompare, invitation.inviter)) {
                  case (?friends) {
                      let existing = Array.find<Principal>(friends, func(f) { f == caller });
                      if (existing == null) {
                          friendLists.add(principalCompare, invitation.inviter, Array.tabulate(friends.size() + 1, func(i : Nat) : Principal { if (i < friends.size()) friends[i] else caller }));
                      };
                  };
                  case null {
                      friendLists.add(principalCompare, invitation.inviter, [caller]);
                  };
              };
              switch (friendLists.get(principalCompare, caller)) {
                  case (?friends) {
                      let existing = Array.find<Principal>(friends, func(f) { f == invitation.inviter });
                      if (existing == null) {
                          friendLists.add(principalCompare, caller, Array.tabulate(friends.size() + 1, func(i : Nat) : Principal { if (i < friends.size()) friends[i] else invitation.inviter }));
                      };
                  };
                  case null {
                      friendLists.add(principalCompare, caller, [invitation.inviter]);
                  };
              };
              invitations.remove(Text.compare, token);
              return #ok(());
          };
      };
  };

  // NEW: cancelInvitation and getPendingInvitations
  public shared({ caller }) func cancelInvitation(token: Text) : async Result.Result<(), Text> {
    switch (invitations.get(Text.compare, token)) {
      case (?inv) {
        if (inv.inviter == caller) {
          invitations.remove(Text.compare, token);
          return #ok(());
        } else { return #err("Not the inviter"); };
      };
      case null { #err("Invalid token"); };
    };
  };

  public query({ caller }) func getPendingInvitations() : async [(Text, Invitation)] {
    Iter.toArray(Iter.filter(invitations.entries(), func((_, inv): (Text, Invitation)) : Bool {
      inv.inviter == caller
    }));
  };

  // Internal helper
  private func _logAudit(user: Principal, action: Text, details: Text) {
    let oldLog = auditLog;
    auditLog := Array.tabulate(oldLog.size() + 1, func(i) = if (i < oldLog.size()) oldLog[i] else ({ timestamp = Time.now(); user; action; details }));
    if (auditLog.size() > 50) {
      let oldLog2 = auditLog;
      let excess = Nat.sub(oldLog2.size(), 50);
      auditLog := Iter.toArray(Iter.take(Iter.drop(oldLog2.values(), excess), 50));
    };
  };

  // Node Visibility Management
  public shared({ caller }) func setNodeVisibility(isPublic : Bool) : async () {
    switch (registry.get(principalCompare, caller)) {
      case (?_canisterId) {
        nodeVisibility.add(principalCompare, caller, isPublic);
      };
      case null {
        // No canister for this user
      };
    };
  };

  public query({ caller }) func getNodeVisibility() : async ?Bool {
    nodeVisibility.get(principalCompare, caller);
  };

  // Get Allowed Users
  public query({ caller }) func getAllowedUsers() : async [Principal] {
    switch (accessControl.get(principalCompare, caller)) {
      case (?allowedMap) {
        Iter.toArray(allowedMap.keys())
      };
      case null { [] };
    };
  };

  // Get List of all Canisters with Access
  public query({ caller }) func getAccessibleCanisters() : async [(Principal, Principal, Bool)] {
    let buf = List.empty<(Principal, Principal, Bool)>();
    for ((owner, canisterId) in registry.entries()) {
      let isPublic = switch (nodeVisibility.get(principalCompare, owner)) {
        case (?val) { val };
        case null { false };
      };
      if (isPublic or caller == owner) {
        buf.add((canisterId, owner, isPublic));
      } else {
        switch (accessControl.get(principalCompare, owner)) {
          case (?allowedMap) {
            if (Option.isSome(allowedMap.get(caller))) {
              buf.add((canisterId, owner, isPublic));
            }
          };
          case null {
            // No access control entry
          };
        }
      }
    };
    return List.toArray(buf);
  };

  // Get List of all Canisters with Details (username, cycles only for owner)
  public shared({ caller }) func getAccessibleCanistersWithDetails() : async [CanisterDetails] {
    let buf = List.empty<CanisterDetails>();
    for ((owner, canisterId) in registry.entries()) {
      let isPublic = switch (nodeVisibility.get(principalCompare, owner)) {
        case (?val) { val };
        case null { false };
      };
      let hasAccess = if (isPublic or caller == owner) {
        true
      } else {
        switch (accessControl.get(principalCompare, owner)) {
          case (?allowedMap) {
            Option.isSome(allowedMap.get(caller))
          };
          case null { false };
        }
      };
      if (hasAccess) {
        // Get username
        let username = do {
          var found : ?Text = null;
          for ((name, u) in usernames.entries()) {
            if (u == owner) {
              found := ?name;
            };
          };
          switch (found) {
            case (?name) { name };
            case null { Principal.toText(owner) };
          }
        };
        // Get cycles only if caller is owner
        let cycles = if (caller == owner) {
          let nodeActor = actor(Principal.toText(canisterId)) : actor { getCyclesBalance : () -> async Nat };
          ?(try { await nodeActor.getCyclesBalance() } catch (_) { 0 })
        } else {
          null
        };
        buf.add({
          canisterId;
          owner;
          username;
          isPublic;
          cycles;
        });
      }
    };
    return List.toArray(buf);
  };

  // Request a new canister
  public shared({ caller }) func requestCanister() : async Result.Result<Principal, Text> {
    if (Principal.isAnonymous(caller)) {
      return #err("Anonymous principals cannot request a canister.");
    };
    if (Option.isSome(blockedUsers.get(principalCompare, caller))) {
      return #err("User is blocked.");
    };
    if (not isWasmReady) {
      return #err("WASM module is not ready or is being updated. Please try again later.");
    };

    // Cap User canisters at 1 (remove if unwanted)
    switch (registry.get(principalCompare, caller)) {
      case (?canisterId) {
        return #ok(canisterId); // Return existing canister ID
      };
      case null {

        // Guard against cardinal running out of cycles
        if (Cycles.balance() < 2_500_000_000_000) {
          return #err("Cardinal canister has insufficient cycles. Top it up with: dfx ledger fabricate-cycles --all");
        };

        Debug.print("=== requestCanister start - balance: " # Nat.toText(Cycles.balance()));

        let ic = IcManagement.management();

        // 2.5x margin applied to measured usage
        let { canister_id } = await (with cycles = 1_200_000_000_000) ic.create_canister();

        Debug.print("create_canister done - balance now: " # Nat.toText(Cycles.balance()));

        // Install the WASM module
        switch (wasmModule) {
          case (?wasmModuleBlob) {
            // 2.5x margin for install + buffer for the init call
            await (with cycles = 100_000_000) ic.install_code({
              canister_id;
              wasm_module = wasmModuleBlob;
              arg = Array.toBlob([]); // Empty args
              mode = #install;
            });
            Debug.print("install_code done - balance now: " # Nat.toText(Cycles.balance()));
          };
          case null {
            return #err("WASM module not available.");
          };
        };

        // Initialize the user canister with the owner
        let userCanister = actor(Principal.toText(canister_id)) : actor {
          init : (Principal) -> async ();
        };
        // Extra cycles for the init call (small but safe)
        await (with cycles = 100_000_000) userCanister.init(caller);
        Debug.print("init done - balance now: " # Nat.toText(Cycles.balance()));

        // Register the canister and set up access control
        registry.add(principalCompare, caller, canister_id);
        nodeVisibility.add(principalCompare, caller, false); // Default to private
        let allowedMap = Map.empty<Principal, ()>();
        allowedMap.add(principalCompare, caller, ()); // Owner is always allowed
        accessControl.add(principalCompare, caller, allowedMap);
        Debug.print("=== requestCanister finished successfully");
        return #ok(canister_id);
      };
    };
  };

  // Get canister ID if the caller is authorized
  public query({ caller }) func getCanisterId(user : Principal) : async ?Principal {
    switch (accessControl.get(principalCompare, user)) {
      case (?allowedMap) {
        if (Option.isSome(allowedMap.get(caller))) {
          return registry.get(principalCompare, user);
        } else {
          return null;
        };
      };
      case null {
        return null;
      };
    };
  };

  // Add user to allowed list for a node
  public shared({ caller }) func addAllowedUser(nodeId: Principal, user: Principal) : async Result.Result<(), Text> {
      switch (registry.get(principalCompare, caller)) {
          case (?ownedNodeId) {
              if (ownedNodeId != nodeId) {
                  return #err("Not the owner of this node");
              };
              switch (accessControl.get(principalCompare, caller)) {
                  case (?allowedMap) {
                      allowedMap.add(principalCompare, user, ());
                  };
                  case null {
                      let newMap = Map.empty<Principal, ()>();
                      newMap.add(principalCompare, user, ());
                      accessControl.add(principalCompare, caller, newMap);
                  };
              };
              // Update the user node canister
              let userNodeActor = actor(Principal.toText(nodeId)) : actor {
                  addReader : (Principal) -> async ();
              };
              await userNodeActor.addReader(user);
              return #ok(());
          };
          case null {
              return #err("No node found for this user");
          };
      };
  };

  // Remove an allowed principal (only callable by the owner)
  public shared({ caller }) func removeAllowed(allowed : Principal) : async Result.Result<(), Text> {
    switch (registry.get(principalCompare, caller)) {
      case (?nodeId) {
        switch (accessControl.get(principalCompare, caller)) {
          case (?allowedMap) {
            allowedMap.remove(principalCompare, allowed);
          };
          case null {
            return #err("No access control entry for this user.");
          };
        };
        let userNodeActor = actor (Principal.toText(nodeId)) : actor {
          removeReader : (Principal) -> async ();
        };
        await userNodeActor.removeReader(allowed);
        return #ok(());
      };
      case null {
        return #err("No canister found for this user.");
      };
    };
  };

  // Upload WASM module (admin only)
  public shared({ caller }) func uploadWasmModule(wasmModuleBlob : Blob) : async Result.Result<(), Text> {
    if (caller != _adminPrincipal) {
      return #err("Unauthorized");
    };
    if (wasmModuleBlob.size() == 0) {
      return #err("Empty WASM module");
    };
    isWasmReady := false; // Mark as not ready during upload
    wasmModule := ?wasmModuleBlob;
    isWasmReady := true; // Mark as ready after upload completes
    _logAudit(caller, "uploadWasmModule", "WASM module updated (" # Nat.toText(wasmModuleBlob.size()) # " bytes)");
    #ok(())
  };

  // Upgrade the user's canister with the current WASM module
  public shared({ caller }) func upgradeCanister() : async Result.Result<(), Text> {
    switch (registry.get(principalCompare, caller)) {
      case (?canisterId) {
        switch (wasmModule) {
          case (?wasmModuleBlob) {
            let ic = IcManagement.management();
            await ic.install_code({
              canister_id = canisterId;
              wasm_module = wasmModuleBlob;
              arg = Array.toBlob([]); // Empty args
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

  // Username management
  public query func isUsernameTaken(name: Text) : async Bool {
    Option.isSome(usernames.get(Text.compare, name))
  };

  public shared({ caller }) func registerUsername(name: Text, user: Principal) : async Result.Result<(), Text> {
    // Only the user themselves, an admin, or a registered user-node for that user may register.
    let callerIsUserNode = switch (registry.get(principalCompare, user)) {
      case (?nodeId) { caller == nodeId };
      case null { false };
    };
    if (caller != user and caller != _adminPrincipal and not callerIsUserNode) {
      return #err("Unauthorized");
    };
    if (Text.size(name) < 3 or Text.size(name) > 32) {
      return #err("Username must be 3-32 characters");
    };
    if (Option.isSome(usernames.get(Text.compare, name))) {
      return #err("Username already taken");
    };
    usernames.add(Text.compare, name, user);
    _logAudit(user, "registerUsername", "Registered username: " # name);
    #ok(())
  };

  public query func getUsername(user: Principal) : async ?Text {
    for ((name, u) in usernames.entries()) {
      if (u == user) return ?name;
    };
    null
  };
};