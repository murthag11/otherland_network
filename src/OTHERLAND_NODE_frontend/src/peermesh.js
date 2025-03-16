import { nodeSettings } from './nodeManager.js';

// Peer to Peer Online Logic
export const online = {

    // Properties
    connected: false,
    quickConnect: false,
    isHosting: false,
    isJoined: false,
    update: false,
    ownID: "",
    remoteID: "",
    init: false,

    isSending: false,
    isReceiving: false,
    remoteShotOngoing: false,
    sendBuffer: [],
    receiveBuffer: [],
    audioStream: null,

    remoteShotsBuffer: [],
    remoteAngle: 0,
    peer: null,
    conn: null,

    // Create Peer Functions
    openPeer: function () {

        const nodeConfig = nodeSettings.exportNodeConfig();

        if (this.ownID == "") {

            // Text
            document.getElementById("user-id-title").innerHTML = "Waiting for Peer ID...";

            // Create Peer 
            this.peer = new Peer();

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

                    // Send Game Configuration
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

                // Assign Peer ID.
                online.ownID = id;
                console.log("ownID: " + online.ownID)

                // Display in menu
                document.getElementById("user-id-title").innerHTML = "Peer ID:<br><br>" + online.ownID;
                document.getElementById("share-th-link-btn").style.display = "block";

                // Quick Connect
                if (online.quickConnect) {
                    online.connect();

                    // Create Peer Connection
                    online.conn = online.peer.connect(online.remoteID);
                    console.log("remoteID: " + online.remoteID)

                    // Exchange Data
                    online.conn.on('open', function () {

                        online.remoteID = online.conn.peer;
                        console.log("remoteID: " + online.remoteID)

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
    incomingData: function (data) {
        console.log("Received: " + data);

        // Receive Khets
        if (data.type == "khetlist") {

            if (online.isJoined) {

            }
            
            return;
        };
        
        // Receive Avatar
        if (data.type == "avatar") {

            
            return;

        };
        
        // Receive Pos Update
        if (data.type == "position") {

            
            return;

        };
        
        // Receive Avatar
        if (data.type == "code") {

            
            return;

        } else {

            // unknown input
            console.log("Unknown Data received: " + data);
        }
        return;
    },

    startReceiving: function () {
        
        if (online.connected && online.isReceiving) {

            // Determine lowest unconfirmed index
            for (var receiveIndex = 0; receiveIndex < online.receiveBuffer.length - 1; receiveIndex++) {
                if (online.receiveBuffer[receiveIndex].confirmed == false) { break; }
            }
            
            var data = online.receiveBuffer[receiveIndex];
            
            // Confirm Receiving
            online.send("confirm", data.index);

            // Apply Input
            if (!localConfig.shooterIsActive) {
                switch (data.type) {
    
                        // Initialize
                    case "init":
                        gameConfig = data.value;
                        localConfig.resetGame(gameConfig, stats);
                        displayGameConfig();
                        online.init = true;
                        startGameButton();
                        online.init = false;
                        localConfig.playerOneActive = false;
                        touchShutdown();
                        break;
    
                        // Shooting
                    case "shot":
                        online.update = true;
                        this.remoteAngle = data.value.angle;
                        
                        // Items
                        items.p2list = data.value.p1list;
                        items.p1list = data.value.p2list;
                        items.isActive = data.value.isActive;
                        break;
    
                        // Items
                    case "items":
                        items.p2list = data.value.p1list;
                        items.p1list = data.value.p2list;
                        items.isActive = data.value.isActive;
                        break;
    
                        // Change Player and sync
                    case "sync":

                        orbs.list = online.invertOrbs(data.value.orbsList);
                        gameConfig = data.value.config;

                        // Change Life stats
                        var tempLives = gameConfig.lifePlayerOne;
                        gameConfig.lifePlayerOne = gameConfig.lifePlayerTwo;
                        gameConfig.lifePlayerTwo = tempLives;
                        calculatePlayerLives(gameConfig);

                        // Prevent sync error
                        gaz.reset();

                        // Detect Finish
                        if(localConfig.pointsAreReached) {
                            localConfig.stopGame();
                        }

                        // Change Player
                        if (data.value.change == true) {
                            localConfig.changePlayer(stats, remoteSync = true);
                        }
                        
                        // Sync Stats
                        // TODO: All stats into separate value list, change all files
                        //stats = online.invertStats(data.value.stats);
                        
                        displayGameConfig();
                        break;
    
                        // Game Reset
                    case "reset":
                        localConfig.resetGame(gameConfig, stats);
                        break;
    
                        // Disconnect
                    case "exit":
                        online.disconnect();
                        localConfig.resetGame(gameConfig, stats);
                        break;
                }
                localConfig.updateGameState = true;
                
                online.receiveBuffer[data.index].confirmed = true;
                //console.log("Input applied [" + data.index + "], Type: " + this.receiveBuffer[receiveIndex].type);
            }

            // Stay active if necessary
            this.receiveBuffer[data.index].confirmed = true;
            if (this.receiveBuffer[this.receiveBuffer.length - 1].confirmed == true) {
                this.isReceiving = false;
                //console.log("Receiving finished");
            } else {
                setTimeout(online.startReceiving, 100);
            }
        }
        return;
    },

    invertOrbs: function(orbs) {

        for (i = 0; i < orbs.length; i++ ) {
            orbs[i].posX = field.WIDTH - orbs[i].posX;
            orbs[i].posY = field.HEIGHT - orbs[i].posY;
        }
        return orbs;
    },

    invertStats: function(stats) {

        // Invert Stats values

        return stats;
    },

    // Send Value
    send: function (type, value) {
        if (this.connected) {

            // Save to Buffer
            if (type == "confirm") {

                console.log("confirmation sent, index: " + value);
                
                // Send Confirm
                online.conn.send({
                    type: type,
                    value: null,
                    index: value
                });
            } else {
                this.sendBuffer.push({ type: type, value: value, index: online.sendBuffer.length, confirmed: false });

                if (online.isSending == false) {
                    online.isSending = true;
                    console.log("Sending invoked");
                    online.startSending();
                }
            }
        }
        return;
    },

    startSending: function () {
        
        if (online.connected && online.isSending) {

            // Determine lowest unconfirmed count
            for (var sendIndex = 0; sendIndex < online.sendBuffer.length - 1; sendIndex++) {
                if (online.sendBuffer[sendIndex].confirmed == false) { break; }
            }

            if (online.sendBuffer[sendIndex].confirmed == false) {
                
                // Send Value
                online.conn.send({
                    type: online.sendBuffer[sendIndex].type,
                    value: online.sendBuffer[sendIndex].value,
                    index: online.sendBuffer[sendIndex].index
                });

                // Log to Console
                console.log("Sent [" + sendIndex + "], Type: " + online.sendBuffer[sendIndex].type);

                // Stay active if necessary
                setTimeout(online.startSending, 500);
            } else {
                online.isSending = false;
                console.log("Sending finished");
            }
        }
        return;
    },

    // set online connection
    connect: function () {
        online.connected = true;
        document.getElementById("reset-button").innerHTML = "Disconnect & Reset";
        document.getElementById("reset-button").onclick = online.disconnect;
        document.getElementById("reset-button2").style.display = "block";

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

            sendCount = 0;
            receiveCount = 0;
            sendBuffer = [];
            receiveBuffer = [];

            resetGameButton();
            document.getElementById("reset-button").onclick = "resetGameButton();";
            document.getElementById("reset-button2").style.display = "none";
            localConfig.menuState = 10;
            changeMenu();
        }
        return;
    },

    // Reset Everything
    reset: function () {
        this.disconnect();
        this.peer.destroy();
        this.ownID = "";
        this.remoteShotsBuffer = [];
        this.remoteAngle = 0;
        this.openPeer();
        return;
    }
}
