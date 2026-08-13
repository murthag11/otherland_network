import { nodeSettings, getUserNodeActor } from '../nodeManager.js';
import { online } from '../peermesh.js';
import { getFromCache, saveToCache } from '../storage/idbCache.js';

// Khet Controller
export const khetController = {
    khets: {}, // { khetId: khet }

    // Load all Khets from the backend
    async loadAllKhets() {
        let allKhets = [];
        this.khets = {};
    
        if (nodeSettings.nodeType == 0) { // Own TreeHouse: Load khets from local storage
            for (const [khetId, khetMetadata] of Object.entries(nodeSettings.localKhets)) {

                // Get 3D data from cache
                const cachedKhet = await getFromCache(khetId);
                if (cachedKhet && cachedKhet.gltfData) {
                    const khet = { ...khetMetadata, gltfData: cachedKhet.gltfData };
                    this.khets[khetId] = khet;
                    allKhets.push(khet);
                } else {
                    console.warn(`Khet ${khetId} in localKhets missing gltfData in cache`);
                }
            }
            console.log(`Loaded ${allKhets.length} Khets from TreeHouse`);
            return allKhets;
            
        } else if (nodeSettings.nodeType == 1) {// Friend's TreeHouse: Load from online.khets via PeerJS
            for (const [khetId, khet] of Object.entries(online.khets)) {
                khetController.khets[khetId] = { ...khetController.khets[khetId], gltfData: khet.gltfData };
            }
            if (online.khetsAreLoaded) {
                console.log("Loading Khets from Peer Network");
                this.khets = { ...online.khets }; // Clone to avoid direct reference issues
                allKhets = Object.values(this.khets);
    
                // Ensure gltfData is present; fetch from cache or request from peer if missing
                for (const [khetId, khet] of Object.entries(this.khets)) {
                    if (!khet.gltfData) {
                        const cachedKhet = await getFromCache(khetId);
                        if (cachedKhet && cachedKhet.gltfData) {
                            khet.gltfData = cachedKhet.gltfData;
                            console.log(`Loaded gltfData for Khet ${khetId} from cache`);
                        } else {

                            // Request gltfData from the peer (host)
                            try {
                                const fullKhet = await online.requestGltfData(khetId);
                                if (fullKhet && fullKhet.gltfData) {
                                    khet.gltfData = fullKhet.gltfData;
                                    await saveToCache(khetId, khet);
                                    console.log(`Fetched gltfData for Khet ${khetId} from peer`);
                                } else {
                                    console.warn(`Failed to fetch gltfData for Khet ${khetId} from peer`);
                                }
                            } catch (error) {
                                console.error(`Error fetching gltfData for Khet ${khetId}:`, error);
                            }
                        }
                    } else {
                        await saveToCache(khetId, khet); // Cache if gltfData is already present
                    }
                }
                return allKhets;
            } else {
                console.log("Still loading Khets from Peer Network");
                return [];
            }
        } else { // Own Node (2) or Otherland Node (3): Load from user_node
            console.log("Loading Khet List from Node Backend");
            const backendActor = await getUserNodeActor();
            try {
                const backendKhets = await backendActor.getAllKhets();
                console.log(`Backend returned ${backendKhets.length} Khets`);
                for (const khet of backendKhets) {
                    this.khets[khet.khetId] = khet;

                    // Get 3D data from cache
                    const cachedKhet = await getFromCache(khet.khetId);
                    if (cachedKhet && cachedKhet.gltfData) {
                        khet.gltfData = cachedKhet.gltfData;
                        console.log(`Loaded gltfData for Khet ${khet.khetId} from cache`);

                    } else { // Get 3D data from user_node
                        const [[nodeId, blobId, gltfDataSize]] = khet.gltfDataRef;
                        const CHUNK_SIZE = 2000000; // Must match upload chunk size
                        const totalChunks = Math.ceil(Number(gltfDataSize) / CHUNK_SIZE);
                        let gltfDataChunks = [];
                        for (let i = 0; i < totalChunks; i++) {
                            const chunkOpt = await backendActor.getBlobChunk(blobId, i);
                            if (chunkOpt && chunkOpt.length > 0) {
                                gltfDataChunks.push(chunkOpt[0]);
                            } else {
                                console.warn(`Failed to fetch chunk ${i} for Khet ${khet.khetId}`);
                                break;
                            }
                        }
                        if (gltfDataChunks.length === totalChunks) {
                            khet.gltfData = new Uint8Array(Number(gltfDataSize));
                            let offset = 0;
                            for (const chunk of gltfDataChunks) {
                                khet.gltfData.set(new Uint8Array(chunk), offset);
                                offset += chunk.length;
                            } 
                        }
                        await saveToCache(khet.khetId, khet);
                    }
                    allKhets.push(khet);
                }
                console.log(`Total Khets loaded from backend: ${allKhets.length}`);
                return allKhets;
            } catch (error) {
                console.error('Error loading all Khets from backend:', error);
                return [];
            }
        }
    },

    // Fetch gltfData for a specific khet if not already loaded
    async fetchGltfDataForKhet(khetId) {
        const khet = this.khets[khetId];
        if (!khet) {
            console.error(`Khet ${khetId} not found`);
            return false;
        }
        if (khet.gltfData) {
            return true; // Already has data
        }

        // Try cache first
        const cachedKhet = await getFromCache(khetId);
        if (cachedKhet && cachedKhet.gltfData) {
            khet.gltfData = cachedKhet.gltfData;
            console.log(`Loaded gltfData for Khet ${khetId} from cache`);
            return true;
        }

        // Fetch from node
        if (khet.gltfDataRef && khet.gltfDataRef.length > 0) {
            const backendActor = await getUserNodeActor();
            const [[nodeId, blobId, gltfDataSize]] = khet.gltfDataRef;

            console.log(khet.gltfDataRef);

            const CHUNK_SIZE = 2000000; // Must match upload chunk size
            const totalChunks = Math.ceil(Number(gltfDataSize) / CHUNK_SIZE);
            let gltfDataChunks = [];

            console.log(totalChunks);
            
            for (let i = 0; i < totalChunks; i++) {
                const chunkOpt = await backendActor.getBlobChunk(blobId, i);
                if (chunkOpt && chunkOpt.length > 0) {
                    gltfDataChunks.push(chunkOpt[0]);
                } else {
                    console.warn(`Failed to fetch chunk ${i} for Khet ${khetId}`);
                    return false;
                }
            }
            if (gltfDataChunks.length === totalChunks) {
                khet.gltfData = new Uint8Array(Number(gltfDataSize));
                let offset = 0;
                for (const chunk of gltfDataChunks) {
                    khet.gltfData.set(new Uint8Array(chunk), offset);
                    offset += chunk.length;
                }
                await saveToCache(khetId, khet);
                console.log(`Fetched and cached gltfData for Khet ${khetId}`);
                return true;
            }
        }
        return false;
    },

    // Get a specific Khet by ID
    getKhet(khetId) {
        return this.khets[khetId] || null;
    },

    // Get all avatars
    getAvatars() {
        console.log('All Khets before filtering:', khetController.khets);
        const avatars = Object.values(this.khets).filter(khet => khet.khetType === 'Avatar');
        console.log('Filtered Avatars:', avatars);
        return avatars;
    },

    // Remove a Khet from the list, but keep the asset in cache
    async removeEntry(khetId) {
        if (nodeSettings.nodeType == 0) {

            // Remove from treehouse metadata and persist
            delete nodeSettings.localKhets[khetId];
            nodeSettings.saveLocalKhets();
            delete this.khets[khetId];
        } else if (nodeSettings.nodeType == 2) {

            // Existing logic for Own Node
            const backendActor = await getUserNodeActor();
            await backendActor.removeKhet(khetId);
            delete this.khets[khetId];
        } else {
            console.warn(`Cannot remove Khet for nodeType ${nodeSettings.nodeType}`);
        }
    },

    // Removes all khets
    clearKhet() {
        if (nodeSettings.nodeType == 0) {
            nodeSettings.localKhets = {};
            nodeSettings.saveLocalKhets();
        }
        this.khets = {};
        return;
    }
};
