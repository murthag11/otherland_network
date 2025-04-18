import Peer from 'peerjs';
import { nodeSettings } from './nodeManager.js';
import { Principal } from '@dfinity/principal';
import { viewerState } from './index.js';
import { avatarState } from './avatar.js';
import { userIsInWorld } from './menu.js';
import { chat } from './chat.js';
import { khetController, loadKhetMeshOnly, saveToCache, getFromCache, getUserNodeActor } from './khet.js';

function prepareForSending(khet) {
    const prepared = { ...khet };
    if (typeof prepared.gltfDataSize === 'bigint') {
        prepared.gltfDataSize = prepared.gltfDataSize.toString();
    }
    if (Array.isArray(prepared.gltfDataRef) && prepared.gltfDataRef.length === 1 &&
        Array.isArray(prepared.gltfDataRef[0]) && prepared.gltfDataRef[0].length === 3) {
        const [principal, blobId, size] = prepared.gltfDataRef[0];
        prepared.gltfDataRef = [[principal.toText(), blobId, size.toString()]];
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
        khet.gltfDataRef = [[Principal.fromText(principalText), blobId, BigInt(sizeStr)]];
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

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunk

function splitIntoChunks(data, chunkSize) {
    const chunks = [];
    const totalChunks = Math.ceil(data.byteLength / chunkSize);
    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, data.byteLength);
        chunks.push(data.slice(start, end));
    }
    return chunks;
}

async function computeSHA256(data) {
    const buffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

export const online = {
    connected: false,
    quickConnect: false,
    isHosting: false,
    isJoined: false,
    ownID: "",
    remoteID: "",
    khets: {},
    khetLoadingProgress: 0,
    khetLoadingGoal: 0,
    khetsAreLoaded: false,
    peer: null,
    connectedPeers: new Map(),
    remoteAvatars: new Map(),
    lastSendTime: 0,
    pendingGltfData: new Map(),
    khetGltfDataLoaded: new Map(),
    expectedChunk: null,
    requestedKhets: new Set(),
    gltfDataPromises: new Map(),
    gltfDataResolvers: new Map(), // Added to store resolve/reject functions
    remoteAvatarQueue: new Map(),
    latestPositions: new Map(), // peerId => { position, quaternion }
    khetQueue: [],
    currentKhetId: null,
    networkMode: false,
    nearbyPeers: new Set(),
    
    async openPeerForNetwork() {
        this.networkMode = true;
        if (!this.peer) this.openPeer(); // Reuse existing PeerJS setup
    },

    async connectToNearbyPeers() {
        const actor = await getUserNodeActor();
        const nearby = await actor.getNearbyPlayers(5);
        for (const principal of nearby) {
            if (!this.connectedPeers.has(principal.toText()) && principal.toText() !== this.ownID) {
                const conn = this.peer.connect(principal.toText());
                conn.on('open', () => this.addConnection(conn));
            }
        }
        this.nearbyPeers = new Set(nearby.map(p => p.toText()));
    },

    async handleSignaling() {
        const actor = await getUserNodeActor();
        const messages = await actor.getSignalingMessages();
        for (const [from, msg] of messages) {
            const parsed = JSON.parse(msg);
            if (parsed.type === 'offer') {
                const conn = this.connectedPeers.get(from.toText()) || this.peer.connect(from.toText());
                conn.on('open', () => {
                    conn.send({ type: 'answer', value: 'answer-data' }); // Simplified
                    this.addConnection(conn);
                });
            }
            // Handle answer, ICE candidates similarly
        }
    },

    openPeer: function () {
        if (this.ownID === "") {
            document.getElementById("user-id-title").innerHTML = "Waiting for Peer ID...";
            this.peer = new Peer();
            if (nodeSettings.nodeType === 0) {
                document.getElementById("node-info").innerHTML = "Node: TreeHouse (open)";
                this.isHosting = true;
                this.isJoined = false;
            } else {
                this.isHosting = false;
                this.isJoined = true;
            }
            this.peer.on('connection', (conn) => this.addConnection(conn));
            this.peer.on('open', (id) => {
                this.ownID = id;
                console.log("ownID: " + this.ownID);
                document.getElementById("user-id-title").innerHTML = "Peer ID:<br><br>" + this.ownID;
                document.getElementById("share-th-link-btn").style.display = "block";
                if (this.quickConnect) this.connectToHost(this.remoteID);
            });
            this.peer.on('error', (err) => console.error('PeerJS error:', err));
        }
    },

    addConnection: function (conn) {
        const peerId = conn.peer;
        this.connectedPeers.set(peerId, conn);
        this.connected = true;
        conn.on('open', () => {
            console.log(`Connected to ${peerId}`);
            if (this.isHosting) {
                const otherPeers = [...this.connectedPeers.keys()].filter(id => id !== peerId);
                conn.send({ type: "peerList", value: otherPeers });
                const nodeConfig = nodeSettings.exportNodeConfig();
                conn.send({ type: "init", value: nodeConfig });

                // Send avatar IDs of all connected peers, including self
                const avatarData = {};
                for (const [id, remote] of this.remoteAvatars.entries()) {
                    avatarData[id] = remote.avatarId;
                }
                if (avatarState.selectedAvatarId) {
                    avatarData[this.ownID] = avatarState.selectedAvatarId;
                }
                conn.send({ type: "avatars", value: avatarData });
            } else {
                // Guest: send own avatar ID to host
                if (avatarState.selectedAvatarId) {
                    conn.send({ type: "avatar", value: avatarState.selectedAvatarId });
                }
            }
        });
        conn.on('data', (data) => this.incomingData(peerId, data));
        conn.on('close', () => this.removeConnection(peerId));
    },

    removeConnection: function (peerId) {
        this.connectedPeers.delete(peerId);
        const remote = this.remoteAvatars.get(peerId);
        if (remote && remote.mesh) viewerState.scene.remove(remote.mesh);
        this.remoteAvatars.delete(peerId);
        this.remoteAvatarQueue.delete(peerId);
        console.log(`Disconnected from ${peerId}`);
        if (this.connectedPeers.size === 0) {
            this.connected = false;
            this.isHosting = false;
            this.isJoined = false;
        }
    },

    connectToHost: function (hostId) {
        const conn = this.peer.connect(hostId);
        conn.on('open', () => this.addConnection(conn));
        document.getElementById('enter-treehouse-btn').disabled = true;
    },

    requestGltfData(khetId) {
        const promise = new Promise((resolve, reject) => {
            this.gltfDataResolvers.set(khetId, { resolve, reject }); // Store resolvers
            if (this.isJoined && this.connectedPeers.size > 0) {
                const hostConn = this.connectedPeers.values().next().value;
                if (hostConn) {
                    this.requestedKhets.add(khetId);
                    this.pendingGltfData.set(khetId, { 
                        chunks: new Map(), 
                        totalChunks: 0, 
                        totalSize: 0, 
                        receivedChunks: 0, 
                        hash: null 
                    });
                    hostConn.send({ type: "request-gltfdata", value: khetId });
                    console.log(`Sent request-gltfdata for ${khetId} to host ${hostConn.peer}`);
                    this.currentKhetId = khetId;
                } else {
                    console.error("No host connection available");
                    reject("No host connection");
                    this.gltfDataResolvers.delete(khetId);
                    this.currentKhetId = null;
                    this.processNextKhet();
                }
            } else {
                console.error("Not joined or no peers connected");
                reject("Not joined or no peers connected");
                this.gltfDataResolvers.delete(khetId);
                this.currentKhetId = null;
                this.processNextKhet();
            }
        });
        this.gltfDataPromises.set(khetId, promise);
        return promise;
    },

    processNextKhet: function () {
        if (this.khetQueue.length > 0 && !this.currentKhetId) {
            const nextKhetId = this.khetQueue.shift();
            console.log(`Processing next khet: ${nextKhetId}`);
            this.requestGltfData(nextKhetId);
        } else if (this.khetQueue.length === 0) {
            console.log("Khet queue is empty");
        }
    },

    incomingData: async function (peerId, data) {
        console.log(`Received from ${peerId}:`, data instanceof Uint8Array ? `Uint8Array(${data.length})` : data);
        if (typeof data === 'object' && data.type) {
            switch (data.type) {
                case "init":
                    if (this.isJoined) {
                        console.log("Node Configuration received, asking for khetlist");
                        this.khetLoadingProgress = 0;
                        this.khetLoadingGoal = data.value.totalSize;
                        nodeSettings.importNodeConfig(data.value);
                        document.getElementById('download-container').style.display = 'block';
                        this.send("request-khetlist", "", peerId);
                    }
                    break;

                case "request-khetlist":
                    if (this.isHosting) {
                        console.log("Khetlist Request received, sending khets");
                        const preparedKhets = {};
                        for (const [khetId, khet] of Object.entries(khetController.khets)) {
                            const { gltfData, ...metadata } = khet;
                            preparedKhets[khetId] = prepareForSending(metadata);
                        }
                        this.send("khetlist", preparedKhets, peerId);
                    }
                    break;

                case "khetlist":
                    if (this.isJoined) {
                        console.log("Khetlist received");
                        const khetsReceived = data.value;
                        for (const [khetId, khet] of Object.entries(khetsReceived)) {
                            const restoredKhet = restoreAfterReceiving(khet);
                            this.khets[khetId] = restoredKhet;
                            if (!restoredKhet.gltfData) {
                                this.khetGltfDataLoaded.set(khetId, false);
                                this.khetQueue.push(khetId);
                            } else {
                                this.khetGltfDataLoaded.set(khetId, true);
                            }
                        }
                        this.khetsAreLoaded = true;
                        this.processNextKhet();
                    }
                    break;

                case "request-gltfdata":
                    if (this.isHosting) {
                        const khetId = data.value;
                        const khet = khetController.getKhet(khetId);
                        if (khet && khet.gltfData) {
                            const conn = this.connectedPeers.get(peerId);
                            if (conn) {
                                const chunks = splitIntoChunks(khet.gltfData, CHUNK_SIZE);
                                const totalChunks = chunks.length;
                                const hash = await computeSHA256(khet.gltfData);
                                conn.send({
                                    type: "gltfdata-meta",
                                    value: { khetId, totalChunks, totalSize: khet.gltfData.byteLength, hash }
                                });
                                console.log(`Sent gltfdata-meta for ${khetId}: ${totalChunks} chunks, size: ${khet.gltfData.byteLength}, hash: ${hash}`);
                                for (let index = 0; index < totalChunks; index++) {
                                    conn.send({ 
                                        type: "gltfdata-chunk", 
                                        value: { khetId, index, totalChunks } 
                                    });
                                    conn.send(chunks[index]);
                                    console.log(`Sent chunk ${index + 1}/${totalChunks} for ${khetId}, size: ${chunks[index].length} bytes`);
                                    await new Promise(resolve => setTimeout(resolve, 10));
                                }
                                conn.send({ type: "gltfdata-chunk-end", value: { khetId } });
                                console.log(`Sent gltfdata-chunk-end for ${khetId}`);
                            }
                        }
                    }
                    break;

                case "gltfdata-meta":
                    if (this.isJoined && data.value.khetId === this.currentKhetId) {
                        const { khetId, totalChunks, totalSize, hash } = data.value;
                        this.pendingGltfData.set(khetId, {
                            chunks: new Map(),
                            receivedChunks: 0,
                            totalChunks,
                            totalSize,
                            hash
                        });
                        this.khetLoadingGoal = totalSize;
                        this.khetLoadingProgress = 0;
                        console.log(`Received gltfdata-meta for ${khetId}: ${totalChunks} chunks, size: ${totalSize}, hash: ${hash}`);
                    }
                    break;

                case "gltfdata-chunk":
                    if (this.isJoined && data.value.khetId === this.currentKhetId) {
                        const { khetId, index, totalChunks } = data.value;
                        this.expectedChunk = { khetId, index, totalChunks };
                        console.log(`Expecting chunk ${index + 1}/${totalChunks} for ${khetId}`);
                    }
                    break;

                case "gltfdata-chunk-end":
                    if (this.isJoined && data.value.khetId === this.currentKhetId) {
                        const khetId = data.value.khetId;
                        const pending = this.pendingGltfData.get(khetId);
                        if (pending && pending.receivedChunks === pending.totalChunks) {
                            console.log(`Received gltfdata-chunk-end for ${khetId}, all chunks confirmed`);
                            this.finalizeGltfData(khetId);
                        } else {
                            console.log(`Received gltfdata-chunk-end for ${khetId}, but chunks incomplete: ${pending?.receivedChunks}/${pending?.totalChunks}`);
                        }
                    }
                    break;

                case "peerList":
                    if (this.isJoined) {
                        const peerList = data.value;
                        for (const otherPeerId of peerList) {
                            if (!this.connectedPeers.has(otherPeerId)) {
                                const conn = this.peer.connect(otherPeerId);
                                conn.on('open', () => this.addConnection(conn));
                            }
                        }
                    }
                    break;

                case "request-missing-chunks":
                    if (this.isHosting) {
                        const { khetId, missingChunks } = data.value;
                        const khet = khetController.getKhet(khetId);
                        if (khet && khet.gltfData) {
                            const conn = this.connectedPeers.get(peerId);
                            if (conn) {
                                const chunks = splitIntoChunks(khet.gltfData, CHUNK_SIZE);
                                for (const index of missingChunks) {
                                    if (index >= 0 && index < chunks.length) {
                                        conn.send({ 
                                            type: "gltfdata-chunk", 
                                            value: { khetId, index, totalChunks: chunks.length } 
                                        });
                                        conn.send(chunks[index]);
                                        console.log(`Resent chunk ${index + 1}/${chunks.length} for ${khetId}, size: ${chunks[index].length} bytes`);
                                    }
                                }
                            }
                        }
                    }
                    break;

                case "avatars":
                    if (this.isJoined) {
                        const avatars = data.value;
                        for (const [peerId, avatarId] of Object.entries(avatars)) {
                            this.remoteAvatarQueue.set(peerId, avatarId);
                            console.log(`Received avatar ID ${avatarId} for peer ${peerId}, queued for loading`);
                            if (this.khets[avatarId] && this.khets[avatarId].gltfData) {
                                console.log(`Avatar khet ${avatarId} already available`);
                            } else {
                                console.log(`Requesting gltfData for avatar khet ${avatarId}`);
                                this.khetQueue.push(avatarId);
                                if (!this.currentKhetId) this.processNextKhet();
                            }
                        }
                    }
                    break;

                case "avatar":
                    const avatarId = data.value;
                    this.remoteAvatarQueue.set(peerId, avatarId);
                    console.log(`Received avatar ID ${avatarId} from ${peerId}`);

                    if (userIsInWorld) {
                        if (khetController.khets[avatarId] && khetController.khets[avatarId].gltfData) {
                            await this.loadRemoteAvatars(); // Load immediately from local data
                        } else {
                            console.error(`Khet ${avatarId} not found locally for peer ${peerId}`);
                        }
                    } else {
                        const avatarId = data.value;
                        this.remoteAvatarQueue.set(peerId, avatarId);
                        console.log(`Received avatar ID ${avatarId} from ${peerId}, queued for loading`);
                    }
                    break;

                case "position":
                    if (userIsInWorld) {
                        this.latestPositions.set(peerId, data.value);
                        const remoteAvatar = this.remoteAvatars.get(peerId);
                        if (remoteAvatar && remoteAvatar.mesh) {
                            const { position, quaternion } = data.value;
                            remoteAvatar.mesh.position.set(position.x, position.y, position.z);
                            remoteAvatar.mesh.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
                            //console.log(`Updated position for peer ${peerId}`);
                        } else {
                            //console.log(`Avatar mesh for peer ${peerId} not yet loaded, position stored`);
                        }
                    }
                    break;

                case "chat":
                    if (this.isHosting) {
                        for (const conn of this.connectedPeers.values()) {
                            if (conn.peer !== peerId) conn.send({ type: "chat", value: data.value });
                        }
                    }
                    chat.receiveMessage(data.value);
                    break;

                default:
                    console.log(`Unknown data type from ${peerId}:`, data);
            }
        } else if (data instanceof Uint8Array) {
            if (this.isJoined && this.expectedChunk && this.expectedChunk.khetId === this.currentKhetId) {
                const { khetId, index, totalChunks } = this.expectedChunk;
                const pending = this.pendingGltfData.get(khetId);
                if (!pending) {
                    console.error(`No pending data for ${khetId}`);
                    this.expectedChunk = null;
                    return;
                }
                if (!pending.chunks.has(index)) {
                    pending.chunks.set(index, data);
                    pending.receivedChunks++;
                    console.log(`Stored chunk ${index + 1}/${totalChunks} for ${khetId}, receivedChunks: ${pending.receivedChunks}`);
                    this.khetLoadingProgress += data.length;
                    const percentage = (this.khetLoadingProgress / this.khetLoadingGoal) * 100;
                    updateDownloadBar(percentage);
                } else {
                    console.log(`Chunk ${index + 1} for ${khetId} already received`);
                }
                this.expectedChunk = null;
                if (pending.receivedChunks === pending.totalChunks) {
                    console.log(`All chunks received for ${khetId}, finalizing`);
                    this.finalizeGltfData(khetId);
                    this.currentKhetId = null;
                    this.processNextKhet();
                }
            } else {
                console.warn("Received Uint8Array but no expectedChunk or not joined", {
                    isJoined: this.isJoined,
                    expectedChunk: this.expectedChunk,
                    currentKhetId: this.currentKhetId
                });
            }
        }
    },

    finalizeGltfData: async function(khetId) {
        const pending = this.pendingGltfData.get(khetId);
        if (!pending || pending.receivedChunks !== pending.totalChunks) {
            console.error(`Cannot finalize ${khetId}: incomplete data`);
            const resolvers = this.gltfDataResolvers.get(khetId);
            if (resolvers) {
                resolvers.reject(new Error(`Incomplete data for ${khetId}`));
                this.gltfDataResolvers.delete(khetId);
            }
            return;
        }
        const sortedChunks = Array.from(pending.chunks.entries())
            .sort((a, b) => a[0] - b[0])
            .map(entry => entry[1]);
        const gltfData = new Uint8Array(pending.totalSize);
        let offset = 0;
        for (const chunk of sortedChunks) {
            gltfData.set(chunk, offset);
            offset += chunk.length;
        }
        try {
            const hash = await computeSHA256(gltfData);
            if (hash === pending.hash) {
                console.log(`GLTF data for ${khetId} finalized successfully, size: ${pending.totalSize} bytes, hash: ${hash}`);
                this.khets[khetId].gltfData = gltfData;
                await saveToCache(khetId, this.khets[khetId]); // Assuming saveToCache is async
                this.pendingGltfData.delete(khetId);
                this.khetGltfDataLoaded.set(khetId, true);
                const resolvers = this.gltfDataResolvers.get(khetId);
                if (resolvers) {
                    resolvers.resolve(this.khets[khetId]);
                    this.gltfDataResolvers.delete(khetId);
                }
                this.checkAllKhetsLoaded();
            } else {
                console.error(`Hash mismatch for ${khetId}: expected ${pending.hash}, got ${hash}`);
                const resolvers = this.gltfDataResolvers.get(khetId);
                if (resolvers) {
                    resolvers.reject(new Error(`Hash mismatch for ${khetId}`));
                    this.gltfDataResolvers.delete(khetId);
                }
            }
        } catch (error) {
            console.error(`Error finalizing ${khetId}:`, error);
            const resolvers = this.gltfDataResolvers.get(khetId);
            if (resolvers) {
                resolvers.reject(error);
                this.gltfDataResolvers.delete(khetId);
            }
        }
    },

    requestMissingChunks(khetId, missingChunks) {
        const conn = this.connectedPeers.values().next().value;
        if (conn) {
            conn.send({ 
                type: "request-missing-chunks", 
                value: { khetId, missingChunks } 
            });
        }
    },

    checkAllKhetsLoaded: function () {
        const allLoaded = [...this.khetGltfDataLoaded.values()].every(loaded => loaded);
        if (allLoaded && this.khetsAreLoaded) {
            console.log("All khets including gltfData are loaded");
            updateDownloadBar(100);
            document.getElementById('enter-treehouse-btn').disabled = false;
            setTimeout(() => {
                document.getElementById('download-container').style.display = 'none';
            }, 2000);
        }
    },

    send: function (type, value, targetPeerId = null) {
        const message = { type, value };
        console.log("Sending this message:");
        console.log(message);
        
        if (targetPeerId) {
            const conn = this.connectedPeers.get(targetPeerId);
            if (conn) conn.send(message);
        } else {
            for (const conn of this.connectedPeers.values()) {
                conn.send(message);
            }
        }
    },

    reset: function () {
        for (const conn of this.connectedPeers.values()) {
            conn.close();
        }
        this.connectedPeers.clear();
        this.remoteAvatars.clear();
        this.remoteAvatarQueue.clear();
        this.peer.destroy();
        this.ownID = "";
        this.connected = false;
        this.isHosting = false;
        this.isJoined = false;
        this.requestedKhets.clear();
        this.pendingGltfData.clear();
        this.khetGltfDataLoaded.clear();
        this.gltfDataPromises.clear();
        this.gltfDataResolvers.clear(); // Clear resolvers to prevent memory leaks
        this.khetQueue = [];
        this.currentKhetId = null;
        this.openPeer();
    },

    async loadRemoteAvatars() {
        for (const [peerId, avatarId] of this.remoteAvatarQueue) {
            const khetData = khetController.khets[avatarId];
            if (khetData && khetData.gltfData) {
                const mesh = await loadKhetMeshOnly(avatarId, viewerState.scene);
                if (mesh) {
                    this.remoteAvatars.set(peerId, { avatarId, mesh });
                    console.log(`Loaded remote avatar ${avatarId} for peer ${peerId}`);
                    const latest = this.latestPositions.get(peerId);
                    if (latest) {
                        mesh.position.set(latest.position.x, latest.position.y, latest.position.z);
                        mesh.quaternion.set(latest.quaternion.x, latest.quaternion.y, latest.quaternion.z, latest.quaternion.w);
                        console.log(`Applied stored position for peer ${peerId}`);
                    }
                }
            } else {
                console.error(`Khet ${avatarId} not found or no gltfData for peer ${peerId}`);
            }
        }
        this.remoteAvatarQueue.clear();
    }
};