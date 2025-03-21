import { Actor, HttpAgent } from '@dfinity/agent';
import { idlFactory as cardinalIdlFactory } from '../../declarations/cardinal'; // Adjust path based on your project structure
import { online } from './peermesh.js'
import { khetController } from './khet.js';
import { Principal } from '@dfinity/principal';

// Cardinal canister ID
const CARDINAL_CANISTER_ID = 'bw4dl-smaaa-aaaaa-qaacq-cai';

// Request new canister creation by Cardinal
export async function requestNewCanister() {
  try {
    // Initialize agent with user identity (e.g., Internet Identity)
    const agent = new HttpAgent({ host: 'https://ic0.app' });
    const cardinalActor = Actor.createActor(cardinalIdl, {
      agent,
      canisterId: CARDINAL_CANISTER_ID,
    });

    // Call the cardinal canister’s requestCanister function
    const result = await cardinalActor.requestCanister();
    
    // Assuming the response contains the canister ID
    const userCanisterId = result.canisterId;
    localStorage.setItem('userCanisterId', userCanisterId.toString());
    displayCanisterId(userCanisterId);
    return userCanisterId;
  } catch (error) {
    console.error('Error requesting canister:', error);
    displayError('Failed to request a canister. Please try again.');
  }
}

// Get own canister ID from cache or Cardinal
export async function getUserCanisterId() {
    const canisterId = this.userOwnedNodes[0] || null;
    if (!canisterId) {
      displayError('No canister assigned. Please request a canister first.');
      return null;
    }
  
    await authReady;
    const agent = new HttpAgent({ host: window.location.origin, identity: getIdentity() });
    if (process.env.DFX_NETWORK === 'local') {
        await agent.fetchRootKey().catch(err => console.warn('Unable to fetch root key:', err));
    }

    const userCanisterActor = Actor.createActor(userCanisterIdl, {
      agent,
      canisterId: Principal.fromText(canisterId),
    });
    const canisterIdOpt = await cardinalActor.getCanisterId(getIdentity().getPrincipal());
    return canisterIdOpt ? canisterIdOpt[0].toText() : null;
  }

// Create the nodeSettings object
export const nodeSettings = {
    groundPlane: true,          // Enable the fallback ground plane
    groundPlaneSize: 200,       // Set the ground plane size to 200 units
    groundPlaneColor: 0x00ff00,  // Set the ground plane color to green

    nodeType: "TreeHouse",
    nodeOwner: "",
    peerNetworkAllowed: false,
    freeAvatarChoice: true,
    standardAccessMode: "standard",

    userOwnedNodes: [],

    exportNodeConfig () {

        // Calculate total size of all khets
        let totalSize = 0;
        for (const khet of Object.values(khetController.khets)) {
            totalSize += khet.gltfData.byteLength;
        }

        return {
            owner: online.ownID,
            totalSize: totalSize,
            peerNetworkAllowed: this.peerNetworkAllowed,
            freeAvatarChoice: this.freeAvatarChoice,
            standardAccessMode: this.standardAccessMode
        }
    },
    importNodeConfig (data) {
        this.nodeOwner = data.owner;
        this.peerNetworkAllowed = data.peerNetworkAllowed;
        this.freeAvatarChoice = data.freeAvatarChoice;
        this.standardAccessMode = data.standardAccessMode;

        this.displayNodeConfig();
        return;
    },
    
    togglePeerNetworkAllowed () {
        if (this.peerNetworkAllowed) {
            this.peerNetworkAllowed = false;
            document.getElementById("toggle-p2p-btn").innerHTML = "Off";
            document.getElementById("peer-info").style.display = "none";
        } else {
            this.peerNetworkAllowed = true;
            document.getElementById("toggle-p2p-btn").innerHTML = "On";
            document.getElementById("peer-info").style.display = "block";
            khetController.loadAllKhets();
            online.openPeer();
        }
        return;
    },

    displayNodeConfig () {
        document.getElementById("node-state").innerHTML = "Node: TreeHouse of \n\n" + this.nodeOwner;
        return;
    }
};

// Function to fetch the backend canister ID
export async function getBackendCanisterId() {
  const agent = new HttpAgent({ host: window.location.origin });
  if (process.env.DFX_NETWORK === 'local') {
    await agent.fetchRootKey().catch(err => console.warn('Unable to fetch root key:', err));
  }
  const cardinalActor = Actor.createActor(cardinalIdlFactory, { agent, canisterId: CARDINAL_CANISTER_ID });
  return await cardinalActor.getBackendCanisterId();
}

// Function to fetch the storage canister ID
export async function getStorageCanisterId() {
  const agent = new HttpAgent({ host: window.location.origin });
  if (process.env.DFX_NETWORK === 'local') {
    await agent.fetchRootKey().catch(err => console.warn('Unable to fetch root key:', err));
  }
  const cardinalActor = Actor.createActor(cardinalIdlFactory, { agent, canisterId: CARDINAL_CANISTER_ID });
  return await cardinalActor.getStorageCanisterId();
}