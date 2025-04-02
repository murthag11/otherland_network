// Avatar State
export const avatarState = {
    avatarBody: {
        isGrounded: false,
        wasGrounded: false,
        canJump: true
    },
    avatarMesh: null,
    selectedAvatarId: null,
    hasObjectPickedUp: false,
    collidingWithGround: new Set(),

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