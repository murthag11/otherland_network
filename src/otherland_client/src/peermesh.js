import { nodeSettings } from './nodeManager.js';
import { Principal } from '@dfinity/principal';
import { scene } from './index.js';
import { khetController, loadKhetMeshOnly } from './khet.js';

function prepareForSending(khet) {
  const prepared = { ...khet };
  
  // Convert gltfDataSize BigInt to string
  if (typeof prepared.gltfDataSize === 'bigint') {
    prepared.gltfDataSize = prepared.gltfDataSize.toString();
  }
  
  // Handle gltfDataRef: [Principal, string, BigInt]
  if (Array.isArray(prepared.gltfDataRef) && prepared.gltfDataRef.length === 1 && 
      Array.isArray(prepared.gltfDataRef[0]) && prepared.gltfDataRef[0].length === 3) {
    const [principal, blobId, size] = prepared.gltfDataRef[0];
    prepared.gltfDataRef = [[principal.toText(), blobId, size.toString()]];
  }
  
  return prepared;
};

function restoreAfterReceiving(khet) {

    // Restore gltfDataSize from string to BigInt
    if (typeof khet.gltfDataSize === 'string') {
        khet.gltfDataSize = BigInt(khet.gltfDataSize);
    }
    
    // Restore gltfDataRef from [ [string, string, string] ] to [ [Principal, string, BigInt] ]
    if (Array.isArray(khet.gltfDataRef) && khet.gltfDataRef.length === 1 && 
        Array.isArray(khet.gltfDataRef[0]) && khet.gltfDataRef[0].length === 3) {
        const [principalText, blobId, sizeStr] = khet.gltfDataRef[0];
        khet.gltfDataRef = [[Principal.fromText(principalText), blobId, BigInt(sizeStr)]];
    }
    
    // Restore gltfData from ArrayBuffer to Uint8Array
    if (khet.gltfData instanceof ArrayBuffer) {
        khet.gltfData = new Uint8Array(khet.gltfData);
    }
    
    return khet;
};

// Function to update the loading bar
function updateDownloadBar(percentage) {
    const downloadBar = document.getElementById('download-bar');
    // downloadBar.style.width = `${percentage}%`;
    // downloadBar.innerText = `Downloading Node Data at ${Math.round(percentage)}%`;
    if (percentage >= 100) {
        downloadBar.innerText = 'Download finished';
    };
}

// Peer to Peer Online Logic
export const online = {

    // Properties
    update: false,      //eliminate?
    init: false,        //eliminate?

    // State handling
    connected: false,
    quickConnect: false,
    isHosting: false,
    isJoined: false,
    ownID: "",
    remoteID: "",

    // Khets Handling
    khets: {},
    khetLoadingProgress: 0,
    khetLoadingGoal: 0,
    khetsAreLoaded: false,

    // Remote Avatar
    remoteAvatar: null,
    remoteAvatarMesh: null,
    lastSendTime: 0,
    
    // Audio Stream
    audioStream: null,

    // Peer Connection
    peer: null,
    conn: null,

    // Create Peer Functions
    openPeer: function () {

        if (this.ownID == "") {

            // Adjust Text
            document.getElementById("user-id-title").innerHTML = "Waiting for Peer ID...";

            // Create Peer 
            this.peer = new Peer();

            // Display Node State
            document.getElementById("node-info").innerHTML = "Node: TreeHouse (open)";

            // On Incoming Connection (Host)
            this.peer.on('connection', function (conn) {

                online.conn = conn;

                // Exchange Initial Data
                conn.on('open', function () {

                    online.isHosting = true;
                    online.remoteID = conn.peer;
                    online.connect();

                    // Receive messages
                    conn.on('data', function (data) {

                        // Handle Incoming Data
                        online.incomingData(data)
                    });

                    // Handle Close
                    online.conn.on('close', function () {
                        online.remoteID = "";
                        online.disconnect();
                    });

                    // Send Node Configuration
                    const nodeConfig = nodeSettings.exportNodeConfig();
                    online.send("init", nodeConfig);

                    // Notify User that peer connection is established in friendlist and with sound
                    
                    // Start Audio Stream
                    // online.openAudioStream(true);
                });
            });

            this.peer.on('call', function(call) {

            	// Answer the call, providing our mediaStream
            	call.answer(online.openAudioStream(false));

                call.on('stream', function(stream) {

	                // `stream` is the MediaStream of the remote peer.
	                // Here you'd add it to an HTML video/canvas element.
                    const callAudio = document.getElementById("callAudio");
                    callAudio.src = stream;
                });
            });


            // Open Peer Connection (Join)
            this.peer.on('open', function (id) {

                // Assign Peer ID
                online.ownID = id;
                console.log("ownID: " + online.ownID)

                // Display in menu
                document.getElementById("user-id-title").innerHTML = "Peer ID:<br><br>" + online.ownID;
                document.getElementById("share-th-link-btn").style.display = "block";

                // Quick Connect
                if (online.quickConnect) {

                    // Create Peer Connection
                    online.conn = online.peer.connect(online.remoteID);

                    // Exchange Data
                    online.conn.on('open', function () {

                        online.remoteID = online.conn.peer;

                        // Set Connection
                        online.connect();
                        online.isJoined = true;

                        // Notify User that peer connection is established in friendlist and with sound
                        // Show Button to Enter Treeland of other User

                        // Receive messages
                        online.conn.on('data', function (data) {

                            // Handle Incoming Data
                            online.incomingData(data)
                        });
                    });

                    // Handle close
                    online.conn.on('close', function () {
                        online.remoteID = "";
                        online.disconnect();
                    });
                }
            });
        }
        return;
    },

    // Open Audio Stream for Calling
    openAudioStream: function(call) {
        const audioCtx = new AudioContext();
        const microphone = null;
        if (navigator.mediaDevices) {
            navigator.mediaDevices.getUserMedia({"audio": true}).then((stream) => {
                microphone = audioCtx.createMediaStreamSource(stream);
                // `microphone` can now act like any other AudioNode
                console.log("Audio Call attempt");
                //
                if (call) {
                    online.peer.call(online.remoteID, microphone);
                }
            }).catch((err) => {
                // browser unable to access microphone
                // (check to see if microphone is attached)
            });
        } else {
            // browser unable to access media devices
            console.log("Audio Call not supported");
        }
        return microphone;
    },

    // Handle Incoming Data
    incomingData: async function (data) {
        console.log("Received: " + data);

        // Receive Node Config
        if (data.type == "init") {

            if (online.isJoined) {
                this.khetLoadingProgress = 0;
                this.khetLoadingGoal = data.value.totalSize;
                nodeSettings.importNodeConfig(data.value);
            }
            document.getElementById('download-container').style.display = 'block';
            online.send("request-khetlist", "");
            
            return;
        };

        // Receive Request for Khets
        if (data.type == "request-khetlist") {

            if (online.isHosting) {

                console.log(khetController.khets);

                // Send Khets                
                const preparedKhets = {};
                for (const [khetId, khet] of Object.entries(khetController.khets)) {
                  preparedKhets[khetId] = prepareForSending(khet);
                }
                online.send("khetlist", preparedKhets);
                
            } else {
                console.log("Request for Khets received, but not hosting");
            }
            
            return;
        };

        // Receive Khets
        if (data.type === "khetlist") {
            if (online.isJoined) {
                
                console.log("Received data value:", data.value);

                const khetsReceived = data.value;
                const khets = {};
                for (const [khetId, khet] of Object.entries(khetsReceived)) {
                    const restoredKhet = restoreAfterReceiving(khet);
                    khets[khetId] = restoredKhet;

                    this.khetLoadingProgress += khet.gltfData.byteLength; // Track received bytes
                    const progress = (this.khetLoadingProgress / this.khetLoadingGoal) * 100;
                    updateDownloadBar(progress); // Update UI
                }
                online.khets = khets;
                online.khetsAreLoaded = true;
                console.log("Received and restored khets:", khets);
            
                // Cache the khets (assuming loadAllKhets is async)
                try {
                await khetController.loadAllKhets();
                console.log("All khets cached successfully!");
                } catch (error) {
                console.error("Error caching khets:", error);
                }

                // Hide the progress bar
                setTimeout(() => {
                    document.getElementById('download-container').style.display = 'none';
                }, 2000);
            }
            return;
        };
        
        // Receive Avatar
        if (data.type == "avatar") {

            const avatarId = data.value;
            if (this.remoteAvatar != avatarId) {
                // Remove previous remote avatar mesh if it exists
                if (this.remoteAvatarMesh) {
                    scene.remove(this.remoteAvatarMesh);
                    this.remoteAvatarMesh = null;
                }
                this.remoteAvatar = avatarId;
                loadKhetMeshOnly(avatarId, scene).then(mesh => {
                    if (mesh) {
                        this.remoteAvatarMesh = mesh;
                    }
                });
            }
            return;
        };
        
        // Receive Pos Update
        if (data.type == "position") {
            if (this.remoteAvatarMesh) {
                const { position, quaternion } = data.value;
                const bottomOffset = this.remoteAvatarMesh.userData.bottomOffset || 0;
                this.remoteAvatarMesh.position.set(position.x, position.y - bottomOffset, position.z);
                this.remoteAvatarMesh.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
            }
            return;
        };
        
        // Receive Code
        if (data.type == "code") {

            
            return;

        } else {

            // unknown input
            console.log("Unknown Data received: " + data);
        }
        return;
    },

    // Send Value
    send: function (type, value) {
        if (this.connected) {
            online.conn.send({
                type: type,
                value: value
            });
        }
        return;
    },

    // set online connection
    connect: function () {
        online.connected = true;
        online.lastSendTime = performance.now();

        console.log("Connection with " + online.remoteID + " established");

        online.quickConnect = false;
        return;
    },

    // remove online connection
    disconnect: function () {
        if (online.connected == true) {
            online.conn.send({ type: "exit" });
            online.conn.close();
            online.remoteID = "";
            online.connected = false;
            online.isHosting = false;
            online.isJoined = false;
            online.isSending = false;

            // Remove remote avatar mesh
            if (online.remoteAvatarMesh) {
                scene.remove(online.remoteAvatarMesh);
                online.remoteAvatarMesh = null;
            }
        }
        return;
    },

    // Reset Everything
    reset: function () {
        this.disconnect();
        this.peer.destroy();
        this.ownID = "";
        this.openPeer();
        return;
    }
}
