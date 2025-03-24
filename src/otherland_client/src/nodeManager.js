import { Actor, HttpAgent } from '@dfinity/agent';
import { idlFactory as cardinalIdlFactory } from '../../declarations/cardinal'; // Adjust path based on your project structure
import { user, authReady, getIdentity } from './user.js';
import { khetController } from './khet.js';
import { online } from './peermesh.js'

// Cardinal canister ID
const CARDINAL_CANISTER_ID = 'bkyz2-fmaaa-aaaaa-qaaaq-cai';

let agentInstance = null;
let cardinalActor = null;

// Initialize cardinal agent actor with user identity
export async function getCardinalActor() {

    // Create HTTP Agent with Internet Identity
    if (!agentInstance) {

        await authReady;

        agentInstance = new HttpAgent({ 
            host: process.env.DFX_NETWORK === 'local' ? 'http://localhost:4943' : window.location.origin, 
            identity: getIdentity() 
        });

        if (process.env.DFX_NETWORK === 'local') {
            try {
                await agentInstance.fetchRootKey();
                console.log('Root key fetched successfully');
            } catch (err) {
                console.error('Unable to fetch root key:', err);
                throw err;
            }
        }
    }

    // Create actor for the cardinal canister
    if (!cardinalActor) {
        cardinalActor = Actor.createActor(cardinalIdlFactory, { 
            agent: agentInstance, 
            canisterId: CARDINAL_CANISTER_ID 
        });
    }

    return cardinalActor;
}

// Get List of all Canisters with Access
export async function getAccessibleCanisters() {
    try {

        // Get Cardinal Actor
        const actor = await getCardinalActor();
        
        // Call the updated function, which returns [(Principal, Principal)]
        const accessibleCanisters = await actor.getAccessibleCanisters();
        
        // Get the user's principal as a string
        const userPrincipal = user.getUserPrincipal();
        
        // Find the user's own canister by matching the owner to the user's principal
        const ownCanister = accessibleCanisters.find(([canisterId, owner]) => owner.toText() === userPrincipal);
        if (ownCanister) {
            nodeSettings.userOwnedNodes = [ownCanister[0].toText()];
        } else {
            nodeSettings.userOwnedNodes = [];
        }
        
        // Convert the tuple array to an array of objects for easier use
        const accessibleList = accessibleCanisters.map(([canisterId, owner]) => ({
            canisterId: canisterId.toText(),
            owner: owner.toText()
        }));
        
        // Update UI: Show/hide the "request-new-canister" button
        if (!ownCanister) {
            document.getElementById("request-new-canister").style.display = "block";
        } else {
            document.getElementById("request-new-canister").style.display = "none";
        }
        
        return accessibleList;
    } catch (error) {
        console.error('Error getting accessible canisters:', error);
        return [];
    }
}

// Request new canister creation by Cardinal
export async function requestNewCanister() {
    try {
        // Get Cardinal Actor
        const actor = await getCardinalActor();
        
        // Call the cardinal canister’s requestCanister function
        const result = await actor.requestCanister();
        
        // Assuming the response contains the canister ID
        if ('ok' in result) {
            const userCanisterId = result.ok; // Result.ok is the Principal
            localStorage.setItem('userCanisterId', userCanisterId.toText());
            nodeSettings.nodeId = userCanisterId;
            nodeSettings.userOwnedNodes = [userCanisterId.toText()];
            
            // Update Node Table, with edit button (existing comment preserved)
            return userCanisterId;
        } else {
            throw new Error(result.err);
        }
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
    } else {
        return canisterId;
    };
}

// Create the nodeSettings object
export const nodeSettings = {

    // Own TreeHouse Config
    groundPlane: true,          // Enable the fallback ground plane
    groundPlaneSize: 200,       // Set the ground plane size to 200 units
    groundPlaneColor: 0x00ff00,  // Set the ground plane color to green

    localKhets: {},

    userOwnedNodes: [],
    availableNodes: null,

    // Connected Node Config
    nodeId: null,
    nodeType: 0, // 0 = Own TreeHouse | 1 = Friend's TreeHouse | 2 = Own Node | 3 = Private Node | 4 = Public Node
    nodeOwnerPrincipal: null,
    peerNetworkAllowed: false,
    freeAvatarChoice: true,
    standardAccessMode: "standard",

    // Change Node
    changeNode (newNode) {
        this.nodeType = newNode.type;
        this.nodeId = newNode.id;

        // Disbale / Hide all Buttons
        //uploadBtn.disabled = !nodeSettings.nodeId || isGuest;
        //requestCanisterBtn.disabled = isGuest;
        //clearBtn.disabled = isGuest;
        
        // Enable Buttons based on type again
        switch (this.nodeType) {
            case 0:
                
            break;
            case 1:
                
            break;
            case 2:
                
            break;
            case 3:
                
            break;
            case 4:
                
            break;
            default:
        }

        this.displayNodeConfig();
    },

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
        document.getElementById("conn-info").innerHTML = this.nodeId;
        return;
    }
};