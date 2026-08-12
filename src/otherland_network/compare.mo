// Shared comparison helpers for Map keys
import Principal "mo:core/Principal";
import Order "mo:core/Order";

module {
  public func principalCompare(a : Principal, b : Principal) : Order.Order {
    Principal.compare(a, b)
  };
}
