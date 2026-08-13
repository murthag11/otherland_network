// Pure access-control helpers shared by user_node
import Principal "mo:core/Principal";
import Map "mo:core/Map";
import Option "mo:core/Option";
import Array "mo:core/Array";
import Compare "compare";

module {
  public func isOwner(owner : ?Principal, caller : Principal) : Bool {
    switch (owner) {
      case (?own) { caller == own };
      case null { false };
    }
  };

  public func isReader(
    owner : ?Principal,
    allowedReaders : Map.Map<Principal, ()>,
    caller : Principal
  ) : Bool {
    if (isOwner(owner, caller)) { return true };
    Option.isSome(allowedReaders.get(Compare.principalCompare, caller))
  };

  public func isWriter(
    owner : ?Principal,
    allowedWriters : Map.Map<Principal, ()>,
    caller : Principal
  ) : Bool {
    if (isOwner(owner, caller)) { return true };
    Option.isSome(allowedWriters.get(Compare.principalCompare, caller))
  };

  public func canWriteKhet(
    owner : ?Principal,
    allowedWriters : Map.Map<Principal, ()>,
    khetWriters : ?[Principal],
    caller : Principal
  ) : Bool {
    if (isOwner(owner, caller)) { return true };
    if (isWriter(owner, allowedWriters, caller)) { return true };
    switch (khetWriters) {
      case (?list) {
        Option.isSome(Array.find<Principal>(list, func(p) { p == caller }))
      };
      case null { false };
    }
  };
}
