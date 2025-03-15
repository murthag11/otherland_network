module {
  public type Management = actor {
    create_canister : () -> async { canister_id : Principal };
    install_code : (Principal, Blob, Blob) -> async ();
    set_controller : (Principal, Principal) -> async ();
  };
}