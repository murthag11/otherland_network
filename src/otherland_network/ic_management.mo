// Typed view of the IC management canister used by Cardinal
import Principal "mo:core/Principal";
import Blob "mo:core/Blob";

module {
  public type InstallMode = { #install; #reinstall; #upgrade };

  public type Service = actor {
    create_canister : <system> () -> async { canister_id : Principal };
    install_code : <system>({
      canister_id : Principal;
      wasm_module : Blob;
      arg : Blob;
      mode : InstallMode;
    }) -> async ();
  };

  public func management() : Service {
    actor ("aaaaa-aa") : Service
  };
}
