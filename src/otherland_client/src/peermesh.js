import { nodeSettings } from './nodeManager.js';
import { Principal } from '@dfinity/principal';
import { scene } from './index.js';
import { khetController, loadKhetMeshOnly } from './khet.js';

function prepareForSending(khet) {
    const prepared = {
        ...khet
    };
    if (typeof prepared.gltfDataSize === 'bigint') {
        prepared.gltfDataSize = prepared.gltfDataSize.toString();
    }
    if (Array.isArray(prepared.gltfDataRef) && prepared.gltfDataRef.length === 1 &&
        Array.isArray(prepared.gltfDataRef[0]) && prepared.gltfDataRef[0].length === 3) {
        const [principal, blobId, size] = prepared.gltfDataRef[0];
        prepared.gltfDataRef = [
            [principal.toText(), blobId, size.toString()]
        ];
    }
    return prepared;
}

function restoreAfterReceiving(khet) {
    if (typeof khet.gltfDataSize === 'string') {
        khet.gltfDataSize = BigInt(khet.gltfDataSize);
    }
    if (Array.isArray(khet.gltfDataRef) && khet.gltfDataRef.length === 1 &&
        Array.isArray(khet.gltfDataRef[0]) && khet.gltfDataRef[0].length === 3) {
        const [principalText, blobId, sizeStr] = khet.gltfDataRef[0];
        khet.gltfDataRef = [
            [Principal.fromText(principalText), blobId, BigInt(sizeStr)]
        ];
    }
    if (khet.gltfData instanceof ArrayBuffer) {
        khet.gltfData = new Uint8Array(khet.gltfData);
    }
    return khet;
}

function updateDownloadBar(percentage) {
    const downloadBar = document.getElementById('download-bar');
    if (percentage >= 100) {
        downloadBar.innerText = 'Download finished';
    } else {
        downloadBar.innerText = `Downloading Node Data at ${Math.round(percentage)}%`;
    }
}

export const online = {

    // State handling
    connected: false,
    quickConnect: false,
    isHosting: false,
    isJoined: false,
    ownID: "",
    remoteID: "", // Used only for initial quick connect

    // Khet Handling
    khets: {},
    khetLoadingProgress: 0,
    khetLoadingGoal: 0,
    khetsAreLoaded: false,

    // Peer Connections and Avatars
    peer: null,
    connectedPeers: new Map(), // peerId => connection
    remoteAvatars: new Map(), // peerId => { avatarId, mesh }
    lastSendTime: 0,

    // Initialize Peer
    openPeer: function () {
        if (this.ownID === "") {
            document.getElementById("user-id-title").innerHTML = "Waiting for Peer ID...";
            this.peer = new Peer();

            document.getElementById("node-info").innerHTML = "Node: TreeHouse (open)";

            // Handle incoming connections (for host and guests)
            this.peer.on('connection', (conn) => {
                this.addConnection(conn);
            });

            // Handle peer open
            this.peer.on('open', (id) => {
                this.ownID = id;
                console.log("ownID: " + this.ownID);
                document.getElementById("user-id-title").innerHTML = "Peer ID:<br><br>" + this.ownID;
                document.getElementById("share-th-link-btn").style.display = "block";

                if (this.quickConnect) {
                    this.connectToHost(this.remoteID);
                }
            });

            this.peer.on('error', (err) => {
                console.error('PeerJS error:', err);
            });
        }
    },

    // Add a connection to connectedPeers
    addConnection: function (conn) {
        const peerId = conn.peer;
        this.connectedPeers.set(peerId, conn);
        this.connected = true;

        conn.on('open', () => {
            console.log(`Connected to ${peerId}`);
            if (nodeSettings.nodeType === 0) { // Host
                this.isHosting = true;
                const otherPeers = [...this.connectedPeers.keys()].filter(id => id !== peerId);
                conn.send({
                    type: "peerList",
                    value: otherPeers
                });
                const nodeConfig = nodeSettings.exportNodeConfig();
                conn.send({
                    type: "init",
                    value: nodeConfig
                });
            } else if (nodeSettings.nodeType === 1) { // Guest
                this.isJoined = true;
            }
        });

        conn.on('data', (data) => {
            this.incomingData(peerId, data);
        });

        conn.on('close', () => {
            this.removeConnection(peerId);
        });
    },

    // Remove a connection
    removeConnection: function (peerId) {
        this.connectedPeers.delete(peerId);
        const remote = this.remoteAvatars.get(peerId);
        if (remote && remote.mesh) {
            scene.remove(remote.mesh);
        }
        this.remoteAvatars.delete(peerId);
        console.log(`Disconnected from ${peerId}`);
        if (this.connectedPeers.size === 0) {
            this.connected = false;
            this.isHosting = false;
            this.isJoined = false;
        }
    },

    // Connect to the host (for guests)
    connectToHost: function (hostId) {
        const conn = this.peer.connect(hostId);
        conn.on('open', () => {
            this.addConnection(conn);
        });
    },

    // Track pending gltfData requests
    pendingGltfData: new Map(), // khetId => resolve function

    // Request gltfData from the host
    requestGltfData: function(khetId) {
        return new Promise((resolve, reject) => {
            if (this.isJoined && this.connectedPeers.size > 0) {
                const hostConn = this.connectedPeers.values().next().value; // Assume first peer is host
                if (hostConn) {
                    this.pendingGltfData.set(khetId, resolve);
                    hostConn.send({ type: "request-gltfdata", value: khetId });
                } else {
                    reject("No host connection");
                }
            } else {
                reject("Not joined or no peers connected");
            }
        });
    },

    // Handle incoming data
    incomingData: async function (peerId, data) {
        console.log(`Received from ${peerId}:`, data);

        switch (data.type) {
            case "init":
                if (this.isJoined) {
                    this.khetLoadingProgress = 0;
                    this.khetLoadingGoal = data.value.totalSize;
                    nodeSettings.importNodeConfig(data.value);
                    document.getElementById('download-container').style.display = 'block';
                    this.send("request-khetlist", "", peerId);
                }
                break;

            case "request-khetlist":
                if (this.isHosting) {
                    const preparedKhets = {};
                    for (const [khetId, khet] of Object.entries(khetController.khets)) {
                        const { gltfData, ...metadata } = khet; // Exclude gltfData
                        preparedKhets[khetId] = prepareForSending(metadata);
                    }
                    this.send("khetlist", preparedKhets, peerId);
                }
                break;

            case "khetlist":
                if (this.isJoined) {
                    const khetsReceived = data.value;
                    const khets = {};
                    for (const [khetId, khet] of Object.entries(khetsReceived)) {
                        const restoredKhet = restoreAfterReceiving(khet);
                        khets[khetId] = restoredKhet;
                        this.khetLoadingProgress += khet.gltfDataSize || 0; // Use size for progress
                        const progress = (this.khetLoadingProgress / this.khetLoadingGoal) * 100;
                        updateDownloadBar(progress);
                    }
                    this.khets = khets;
                    this.khetsAreLoaded = true;
                    await khetController.loadAllKhets();
                    setTimeout(() => {
                        document.getElementById('download-container').style.display = 'none';
                    }, 2000);
                }
                break;
    
            case "request-gltfdata":
                if (this.isHosting) {
                    const khetId = data.value;
                    const khet = khetController.getKhet(khetId);
                    if (khet && khet.gltfData) {
                        const conn = this.connectedPeers.get(peerId);
                        if (conn) {
                            conn.send({ type: "gltfdata", value: { khetId, gltfData: Array.from(khet.gltfData) } });
                        }
                    }
                }
                break;
    
            case "gltfdata":
                if (this.isJoined) {
                    const { khetId, gltfData } = data.value;
                    const khet = this.khets[khetId];
                    if (khet) {
                        khet.gltfData = new Uint8Array(gltfData);
                        await saveToCache(khetId, khet);
                        const resolve = this.pendingGltfData.get(khetId);
                        if (resolve) {
                            resolve(khet);
                            this.pendingGltfData.delete(khetId);
                        }
                    }
                }
                break;

            case "peerList":
                if (this.isJoined) {
                    const peerList = data.value;
                    for (const otherPeerId of peerList) {
                        if (!this.connectedPeers.has(otherPeerId)) {
                            const conn = this.peer.connect(otherPeerId);
                            conn.on('open', () => {
                                this.addConnection(conn);
                            });
                        }
                    }
                }
                break;

            case "avatar":
                let remote = this.remoteAvatars.get(peerId);
                if (!remote) {
                    remote = {
                        avatarId: null,
                        mesh: null
                    };
                    this.remoteAvatars.set(peerId, remote);
                }
                if (remote.avatarId !== data.value) {
                    if (remote.mesh) {
                        scene.remove(remote.mesh);
                    }
                    remote.avatarId = data.value;
                    loadKhetMeshOnly(data.value, scene).then(mesh => {
                        if (mesh) {
                            remote.mesh = mesh;
                            this.remoteAvatars.set(peerId, remote);
                        }
                    });
                }
                break;

            case "position":
                const remoteAvatar = this.remoteAvatars.get(peerId);
                if (remoteAvatar && remoteAvatar.mesh) {
                    const {
                        position,
                        quaternion
                    } = data.value;
                    remoteAvatar.mesh.position.set(position.x, position.y, position.z);
                    remoteAvatar.mesh.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
                }
                break;

            default:
                console.log(`Unknown data type from ${peerId}:`, data);
        }
    },

    // Send data to a specific peer or broadcast to all
    send: function (type, value, targetPeerId = null) {
        const message = {
            type,
            value
        };
        if (targetPeerId) {
            const conn = this.connectedPeers.get(targetPeerId);
            if (conn) conn.send(message);
        } else {
            for (const conn of this.connectedPeers.values()) {
                conn.send(message);
            }
        }
    },

    // Reset peer connection
    reset: function () {
        for (const conn of this.connectedPeers.values()) {
            conn.close();
        }
        this.connectedPeers.clear();
        this.remoteAvatars.clear();
        this.peer.destroy();
        this.ownID = "";
        this.connected = false;
        this.isHosting = false;
        this.isJoined = false;
        this.openPeer();
    }
};