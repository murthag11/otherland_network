// Khet Type Mapping
export function mapKhetType(typeStr) {
    switch (typeStr) {
        case 'SceneObject': return "SceneObject";
        case 'InteractiveObject': return "InteractiveObject";
        case 'MobileObject': return "MobileObject";
        case 'Entity': return "Entity";
        case 'Avatar': return "Avatar";
        default: throw new Error(`Unknown khetType: ${typeStr}`);
    }
}
