import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { avatarState } from "./avatar.js";
import { viewerState, sceneObjects } from "./index.js";

// Pre-approved functions
export const preApprovedFunctions = {

    pickedUpObject: null,

    // Change color of object
    editProperty: function(content, object) {
        console.log(`Editing ${content.property} to ${content.value}`);
        object.traverse(child => {
            if (child.isMesh && child.material) {
                child.material.color.set("red");
            }
        });
    },

    // In your main script where pickupObject is defined
    pickupObject: function(content, object) {
        if (object.userData.khetType !== 'MobileObject') {
            console.log(`Wrong object type: ${object.userData.khetType}`);
            return;
        }
        console.log('Picking up object');

        // Keep the object in the scene, not as a child of avatarMesh
        this.pickedUpObject = object;
        avatarState.hasObjectPickedUp = true;
        object.userData.isPickedUp = true;

        // Calculate the offset in world space based on avatar's position and orientation
        // const offset = new THREE.Vector3(0, 1, 1); // y=1 (above), z=-0.3 (in front)
        // offset.applyQuaternion(avatarState.avatarMesh.quaternion); // Align with avatar's rotation
        // object.position.copy(avatarState.avatarMesh.position).add(offset); // Set position in world space

        //object.quaternion.copy(avatarState.avatarMesh.quaternion);
        // console.log(sceneObjects);
        // viewerState.world.removeRigidBody(object.userData.body);; // Remove from physics
    },

    // Ensure placeObject remains consistent (assuming it’s already working as desired)
    placeObject: function() {
        console.log('Placing down object');
        let object = this.pickedUpObject;
        if (object) {
            // Update state flags
            avatarState.hasObjectPickedUp = false;
            object.userData.isPickedUp = false;

            // Set the RigidBody's translation to match the Three.js object's position
            // const pos = object.position;
            //object.userData.body.setTranslation(new RAPIER.Vector3(pos.x, pos.y, pos.z), true);

            // Set the RigidBody's rotation to match the Three.js object's quaternion
            //const quat = object.quaternion;
            //object.userData.body.setRotation(new RAPIER.Quaternion(quat.x, quat.y, quat.z, quat.w), true);

            // Reset velocities to ensure the object doesn’t retain momentum
            // object.userData.body.setLinvel(new RAPIER.Vector3(0, 0, 0), true);
            //object.userData.body.setAngvel(new RAPIER.Vector3(0, 0, 0), true);

            // Re-add the RigidBody to the physics world
            // viewerState.world.addRigidBody(object.userData.body);

            // Clear the picked-up reference
            this.pickedUpObject = null;
        } else {
            console.log('No object to place down');
        }
    }
};

// Trigger Interaction function
export function triggerInteraction(point, object) {
    document.getElementById("interactionHint").style.display = "none";
    let actionFunction;

    if (typeof point.action === 'string') {
        if (preApprovedFunctions[point.action]) {
            actionFunction = function(content, object, preApprovedFunctions) {
                preApprovedFunctions[point.action](content, object);
            };
        } else {
            try {
                actionFunction = new Function('content', 'object', 'preApprovedFunctions', point.action);
            } catch (error) {
                console.error('Error creating function from custom code:', error);
                document.getElementById("interactionHint").innerHTML = "Invalid custom action";
                return;
            }
        }
    } else {
        document.getElementById("interactionHint").innerHTML = "No action defined for interaction type";
        console.log(`No action defined for interaction type: ${point.type}`);
        return;
    }

    try {
        console.log(`Interaction triggered: ${point.action} at ${object}`);
        actionFunction(point.content, object, preApprovedFunctions);
        
        document.getElementById("interactionHint").innerHTML = point.action;
    } catch (error) {
        console.error('Error executing interaction action:', error);
        document.getElementById("interactionHint").innerHTML = "Error executing action";
    }
}