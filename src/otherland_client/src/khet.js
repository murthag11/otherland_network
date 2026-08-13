// Thin barrel/facade — re-exports the public Khet API so existing imports keep working.
// Implementation lives in smaller modules under ./khet/, ./utils/, and ./storage/.

export { computeSHA256 } from './utils/sha256.js';
export { getFromCache, saveToCache } from './storage/idbCache.js';
export { mapKhetType } from './khet/types.js';
export { createKhetCodeExecutor } from './khet/codeExecutor.js';
export { createKhet } from './khet/create.js';
export { khetController } from './khet/controller.js';
export { uploadKhet } from './khet/upload.js';
export { loadKhet, loadKhetMeshOnly, clearAllKhets } from './khet/load.js';
export { updateKhetTable, changekhetEditorDrawer } from './khet/uiTable.js';
export {
    currentEditingKhetId,
    setCurrentEditingKhetId,
    clearCurrentEditingKhetId,
} from './khet/editingState.js';

// Side-effect: register upload / cache button listeners
import './khet/upload.js';
