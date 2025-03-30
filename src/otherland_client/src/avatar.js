// Avatar State
export const avatarState = {
    avatarBody: null,
    avatarMesh: null,
    selectedAvatarId: null,
    hasObjectPickedUp: false,

    setAvatarBody (newBody) {
        this.avatarBody = newBody;
        return;
    },
    setAvatarMesh (newMesh) {
        this.avatarMesh = newMesh;
        return;
    },
    getAvatarMesh () {
        return this.avatarMesh;
    },
    setSelectedAvatarId (newId) {
        this.selectedAvatarId = newId;
        return;
    },
    getSelectedAvatarId () {
        return this.selectedAvatarId;
    }
};