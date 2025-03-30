import { avatarState } from "./avatar.js";
import { world, scene, sceneObjects } from "./index.js";

// Pre-approved functions
export const preApprovedFunctions = {

    pickedUpObject: null,

    editProperty: function(content, object) {
        console.log(`Editing ${content.property} to ${content.value}`);
        object.traverse(child => {
            if (child.isMesh && child.material) {
                child.material.color.set("red");
            }
        });
    },
    pickupObject: function(content, object) {
        console.log('Picking up object');
        avatarState.avatarMesh.add(object);
        this.pickedUpObject = object;
        avatarState.hasObjectPickedUp = true;
        object.position.set(0, 1, 0.3);
        world.removeBody(object.userData.body);
    },
    placeObject: function() {
        console.log('Placing down object');
        let object = this.pickedUpObject;
        console.log(object);
        if (object) {
            avatarState.hasObjectPickedUp = false;
            // Calculate position with offset (1 unit in front of avatar)
            const offset = new THREE.Vector3(0, 0, -1); // Forward direction (-z in Three.js)
            offset.applyQuaternion(avatarState.avatarMesh.quaternion); // Apply avatar's rotation
            object.position.copy(avatarState.avatarMesh.position).add(offset); // Set position
            world.addBody(object.userData.body);
            avatarState.avatarMesh.remove(object);
            scene.add(object);
            sceneObjects.push(object);
            this.pickedUpObject = null;
            this.originalParent = null; // Clean up
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
        actionFunction(point.content, object, preApprovedFunctions);
        console.log(`Interaction triggered: ${point.action} at ${object}`);
        
        document.getElementById("interactionHint").innerHTML = point.action;
    } catch (error) {
        console.error('Error executing interaction action:', error);
        document.getElementById("interactionHint").innerHTML = "Error executing action";
    }
}