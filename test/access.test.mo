import Test "mo:test";
import Principal "mo:core/Principal";
import Map "mo:core/Map";
import Access "../src/otherland_network/access";
import Compare "../src/otherland_network/compare";

Test.suite("Access helpers", func() {

  Test.test("isOwner recognizes owner principal", func() {
    let owner = Principal.fromText("2vxsx-fae");
    assert Access.isOwner(?owner, owner);
    assert (not Access.isOwner(?owner, Principal.fromText("aaaaa-aa")));
    assert (not Access.isOwner(null, owner));
  });

  Test.test("isReader / isWriter honor ACL maps", func() {
    let owner = Principal.fromText("2vxsx-fae");
    let reader = Principal.fromText("aaaaa-aa");
    let writers = Map.empty<Principal, ()>();
    let readers = Map.empty<Principal, ()>();
    readers.add(Compare.principalCompare, reader, ());
    assert Access.isReader(?owner, readers, reader);
    assert Access.isReader(?owner, readers, owner);
    assert (not Access.isWriter(?owner, writers, reader));
    writers.add(Compare.principalCompare, reader, ());
    assert Access.isWriter(?owner, writers, reader);
  });

  Test.test("principalCompare is consistent with Principal.compare", func() {
    let a = Principal.fromText("aaaaa-aa");
    let b = Principal.fromText("2vxsx-fae");
    assert (Compare.principalCompare(a, a) == #equal);
    assert (Compare.principalCompare(a, b) != #equal);
  });

});
