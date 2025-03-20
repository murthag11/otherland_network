import Principal "mo:base/Principal";
import HashMap "mo:base/HashMap";
import Option "mo:base/Option";
import Nat "mo:base/Nat";

actor {
  stable var owner : ?Principal = null;
  stable var allowedReaders = HashMap.HashMap<Principal, ()>(10, Principal.equal, Principal.hash);
  stable var khets = HashMap.HashMap<Nat, Text>(10, Nat.equal, func(x) { x });

  // Replace with the cardinal canister's principal in production
  let cardinal = actor("aaaaa-aa") : actor {};

  // Initialization by the cardinal canister
  public shared({ caller }) func init(ownerPrincipal : Principal) : async () {
    assert(caller == Principal.fromActor(cardinal));
    assert(owner == null);
    owner := ?ownerPrincipal;
    allowedReaders.put(ownerPrincipal, ()); // Owner is always allowed
  };

  // Store a khet (only callable by the owner)
  public shared({ caller }) func storeKhet(khet : Text) : async Nat {
    assert(caller == Option.unwrap(owner));
    let id = khets.size();
    khets.put(id, khet);
    return id;
  };

  // Retrieve a khet (accessible to owner and allowed readers)
  public query({ caller }) func getKhet(id : Nat) : async ?Text {
    if (caller == Option.unwrap(owner) or Option.isSome(allowedReaders.get(caller))) {
      return khets.get(id);
    } else {
      return null;
    };
  };

  // Add a reader (only callable by the owner)
  public shared({ caller }) func addReader(reader : Principal) : async () {
    assert(caller == Option.unwrap(owner));
    allowedReaders.put(reader, ());
  };

  // Remove a reader (only callable by the owner)
  public shared({ caller }) func removeReader(reader : Principal) : async () {
    assert(caller == Option.unwrap(owner));
    allowedReaders.delete(reader);
  };
};