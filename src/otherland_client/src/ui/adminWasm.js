import { getCardinalActor } from '../nodeManager.js';

/**
 * WASM upload for admins. Password gate removed — canister enforces admin access.
 * Ignores #wasm-pw if present in the DOM.
 */
export function initAdminWasm() {
    const wasmFile = document.getElementById('wasm-file-input');
    if (!wasmFile) return;

    wasmFile.addEventListener('change', async () => {
        const file = wasmFile.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async () => {
            const wasmArrayBuffer = reader.result;
            const wasmBlob = new Uint8Array(wasmArrayBuffer);

            try {
                const actor = await getCardinalActor();
                const result = await actor.uploadWasmModule(wasmBlob);
                if (result && 'err' in result) {
                    console.error('WASM upload rejected:', result.err);
                    return;
                }
                console.log('WASM module uploaded successfully');
            } catch (error) {
                console.error('Error uploading WASM module:', error);
            }
        };
        reader.readAsArrayBuffer(file);
    });
}
