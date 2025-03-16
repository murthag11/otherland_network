import { online } from './peermesh.js'

// Create the nodeSettings object
export const nodeSettings = {
    groundPlane: true,          // Enable the fallback ground plane
    groundPlaneSize: 200,       // Set the ground plane size to 200 units
    groundPlaneColor: 0x00ff00,  // Set the ground plane color to green

    peerNetworkAllowed: false,
    freeAvatarChoice: true,
    standardAccessMode: "standard",

    exportNodeConfig () {
        return {
            peerNetworkAllowed: this.peerNetworkAllowed,
            freeAvatarChoice: this.freeAvatarChoice,
            standardAccessMode: this.standardAccessMode
        }
    },
    importNodeConfig (data) {
        this.peerNetworkAllowed = data.peerNetworkAllowed;
        this.freeAvatarChoice = data.freeAvatarChoice;
        this.standardAccessMode = data.standardAccessMode;
        return;
    },
    
    togglePeerNetworkAllowed () {
        if (this.peerNetworkAllowed) {
            this.peerNetworkAllowed = false;
            document.getElementById("toggle-p2p-btn").innerHTML = "No";
        } else {
            this.peerNetworkAllowed = true;
            document.getElementById("toggle-p2p-btn").innerHTML = "Yes";
            document.getElementById("peer-info").style.display = "block";
            online.openPeer();
        }
        return;
    }
};