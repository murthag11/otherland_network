import { online } from './peermesh.js'
import { khetController } from './khet.js';

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