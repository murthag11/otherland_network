import { Actor, HttpAgent } from '@dfinity/agent';
import { idlFactory as cardinalIdlFactory } from '../../declarations/cardinal'; // Adjust path based on your project structure
import { online } from './peermesh.js'
import { khetController } from './khet.js';
import { Principal } from '@dfinity/principal';

// Cardinal canister ID
const CARDINAL_CANISTER_ID = 'bw4dl-smaaa-aaaaa-qaacq-cai';
  
// Create the nodeSettings object
export const nodeSettings = {

    // Own TreeHouse Config
    groundPlane: true,          // Enable the fallback ground plane
    groundPlaneSize: 200,       // Set the ground plane size to 200 units
    groundPlaneColor: 0x00ff00,  // Set the ground plane color to green

    localKhets: {};

    availableNodes: null,

    // Connected Node Config
    nodeType: 0, // 0 = Own TreeHouse | 1 = Friend's TreeHouse | 2 = Own Node | 3 = Private Node | 4 = Public Node
    nodeOwnerPrincipal: null,
    peerNetworkAllowed: false,
    freeAvatarChoice: true,
    standardAccessMode: "standard",

    userOwnedNodes: [],

    // Export Node Configuration
    exportNodeConfig () {

        // Calculate total size of all khets
        let totalSize = 0;
        for (const khet of Object.values(khetController.khets)) {
            totalSize += khet.gltfData.byteLength;
        }

        // Export own TreeHouse
        return {
            type: 0,
            owner: online.ownID,
            totalSize: totalSize,
            peerNetworkAllowed: this.peerNetworkAllowed,
            freeAvatarChoice: this.freeAvatarChoice,
            standardAccessMode: this.standardAccessMode
        }
    },

    // Import Node Configuration
    importNodeConfig (data) {
        this.type = data.type
        this.nodeOwner = data.owner;
        this.peerNetworkAllowed = data.peerNetworkAllowed;
        this.freeAvatarChoice = data.freeAvatarChoice;
        this.standardAccessMode = data.standardAccessMode;

        this.displayNodeConfig();
        return;
    },
    
    // Turn P2P on / off
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

    // Update Info Box with new Node Configuration
    displayNodeConfig () {
      switch (this.nodeType) {
        case 0:
          document.getElementById("node-info").innerHTML = "Node: My TreeHouse";
          break;
        case 1:
          document.getElementById("node-info").innerHTML = "Node: TreeHouse of \n\n" + this.nodeOwner;
          break;
        case 2:
          document.getElementById("node-info").innerHTML = "Node: My Node";
          break;
        case 3:
          document.getElementById("node-info").innerHTML = "Node: Node of" + this.nodeOwner;
          break;
        case 4:
          document.getElementById("node-info").innerHTML = "Node: Otherland Node";
          break;
        default:
      }
      return;
    }
};

// Fetch the storage canister ID
export async function getStorageCanisterId() {
  const agent = new HttpAgent({ host: window.location.origin, identity: getIdentity() });
  if (process.env.DFX_NETWORK === 'local') { await agent.fetchRootKey().catch(err => console.warn('Unable to fetch root key:', err)) };
  const cardinalActor = Actor.createActor(cardinalIdlFactory, { agent, canisterId: CARDINAL_CANISTER_ID });
  return await cardinalActor.getStorageCanisterId();
}

// Get List of all Canisters with Access
export async function getAccessibleCanisters() {
  try {

      // Initialize agent with user identity
      const agent = new HttpAgent({ host: window.location.origin, identity: getIdentity() });
      if (process.env.DFX_NETWORK === 'local') {
          await agent.fetchRootKey().catch(err => console.warn('Unable to fetch root key:', err));
      }

      // Create actor for the cardinal canister
      const cardinalActor = Actor.createActor(cardinalIdlFactory, { 
          agent, 
          canisterId: CARDINAL_CANISTER_ID 
      });

      // Call the new function
      const accessibleCanisters = await cardinalActor.getAccessibleCanisters();
      
      // Convert Principal array to text array
      return accessibleCanisters.map(principal => principal.toText());
  } catch (error) {
      console.error('Error getting accessible canisters:', error);
      return [];
  }
}

// Request new canister creation by Cardinal
export async function requestNewCanister() {
    try {
        // Initialize agent with user identity (e.g., Internet Identity)
        const agent = new HttpAgent({ host: window.location.origin, identity: getIdentity() });
        if (process.env.DFX_NETWORK === 'local') { await agent.fetchRootKey().catch(err => console.warn('Unable to fetch root key:', err)) };
        const cardinalActor = Actor.createActor(cardinalIdlFactory, { agent, canisterId: CARDINAL_CANISTER_ID });

        // Call the cardinal canister’s requestCanister function
        const result = await cardinalActor.requestCanister();
        
        // Assuming the response contains the canister ID
        const userCanisterId = result.canisterId;
        localStorage.setItem('userCanisterId', userCanisterId.toString());
        displayCanisterId(userCanisterId);
        return userCanisterId;
    } catch (error) {
        console.error('Error requesting canister:', error);
    }
}

// Get own canister ID from cache or Cardinal
export async function getUserCanisterId() {
    const canisterId = nodeSettings.userOwnedNodes[0] || null;
    if (!canisterId) {
      console.error('No canister assigned. Please request a canister first.');
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