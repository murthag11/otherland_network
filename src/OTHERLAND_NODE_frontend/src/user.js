// import { AuthClient } from "@dfinity/auth-client";
// import { Actor, HttpAgent } from '@dfinity/agent';

export const user = {
    userPrincipal: "",
    userName: "",

    setUserPrincipal (newPrincipal) {
        this.userPrincipal = newPrincipal;
    },
    getUserPrincipal () {
        return this.userPrincipal;
    },

    setUserName (newName) {
        this.userName = newName;
    },
    getUserName () {
        return this.userName;
    }
}