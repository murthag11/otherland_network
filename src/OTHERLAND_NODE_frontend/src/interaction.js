// Trigger Ineraction function
export function triggerInteraction(point, object) {
    document.getElementById("interactionHint").style.display = "block";
    if (point.action) {
        point.action(point.content, object);
        document.getElementById("interactionHint").innerHTML = point.action;
    } else {
        document.getElementById("interactionHint").innerHTML = "No action defined for interaction type";
        console.log(`No action defined for interaction type: ${point.type}`);
    }
}

// Interaction: Edit Khet Properties
export function editProperty(content, object) {
    console.log(`Editing ${content.property} to ${content.value}`);
    // Example: Change object color
    object.traverse(child => {
        if (child.isMesh && child.material) {
            child.material.color.set(content.value);
        }
    });
}

// Interaction: Pick Up Object
export function pickupObject(content, object) {
    console.log('Picking up object');
    // Example: Attach object to avatar
    avatarMesh.add(object);
    object.position.set(0, 1, -1); // Position in front of avatar
    world.removeBody(object.userData.body); // Remove from physics
}