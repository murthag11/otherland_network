// Avatar State
export const avatarState = {
    avatarBody: null,
    avatarMesh: null,
    selectedAvatarId: null,
    hasObjectPickedUp: false,
    collidingWithGround: new Set(), // remove?

    // Properties
    isGrounded: false,
    wasGrounded: false,
    canJump: true,
    lastLandingTime: 0, // Initialize landing time


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