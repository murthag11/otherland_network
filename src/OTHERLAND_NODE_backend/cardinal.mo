// Dumb wrapper that just returns the fixed canister and storage id for now

actor Cardinal {
  public query func getBackendCanisterId() : async Text {
    return "bkyz2-fmaaa-aaaaa-qaaaq-cai"; // Hardcoded backend canister ID
  };

  public query func getStorageCanisterId() : async Text {
    return "be2us-64aaa-aaaaa-qaabq-cai"; // Hardcoded storage canister ID
  };
}