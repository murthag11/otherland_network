// IndexedDB Cache Setup
const DB_NAME = 'KhetCache';
const STORE_NAME = 'assets';
const DB_VERSION = 3;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('khets')) {
                db.createObjectStore('khets', { keyPath: 'id' });
            }
        };
    });
}

export async function getFromCache(id) {
    //console.log("DB retrieval, ID: " + id);
    const db = await openDB();
    return new Promise((resolve, reject) => {
        //console.log("reading...");
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => {
            const data = request.result ? request.result.data : null;
            //console.log(`Retrieved from cache for ID ${id}: ${data ? 'data found' : 'no data'}`);
            resolve(data);
        };
        request.onerror = () => {
            console.error(`Error retrieving from cache for ID ${id}:`, request.error);
            reject(request.error);
        };
        transaction.oncomplete = () => db.close();
    });
}

export async function saveToCache(id, data) {
    //console.log("DB storage, ID: " + id);
    const db = await openDB();
    return new Promise((resolve, reject) => {
        //console.log("writing...");
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put({ id, data });
        request.onsuccess = () => {
            //console.log(`Successfully cached data for ID ${id}`);
            resolve();
        };
        request.onerror = () => {
            console.error(`Error saving to cache for ID ${id}:`, request.error);
            reject(request.error);
        };
        transaction.oncomplete = () => db.close();
    });
}
