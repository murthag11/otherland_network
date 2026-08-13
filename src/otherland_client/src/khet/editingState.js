/** Mutable khet editor selection state (shared by khet table + asset UI). */
export let currentEditingKhetId = null;

export function setCurrentEditingKhetId(id) {
    currentEditingKhetId = id;
}

export function clearCurrentEditingKhetId() {
    currentEditingKhetId = null;
}
