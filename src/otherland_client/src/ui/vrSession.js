import { viewerState } from '../index.js';

async function enterVR() {
    if (!navigator.xr) {
        alert('WebXR is not supported on this device/browser');
        return;
    }

    const isVRAvailable = await navigator.xr.isSessionSupported('immersive-vr');
    if (!isVRAvailable) {
        alert('VR is not available on this device');
        return;
    }

    try {
        const sessionInit = {
            requiredFeatures: ['local-floor', 'bounded-floor'],
            optionalFeatures: ['local', 'viewer']
        };

        console.log('Requesting immersive-vr session with features:', sessionInit);

        const session = await navigator.xr.requestSession('immersive-vr', sessionInit);
        console.log('VR session created successfully');

        await viewerState.renderer.xr.setSession(session);
        console.log('XR session set on renderer successfully');

        if (viewerState.controls && viewerState.controls.isLocked) {
            viewerState.controls.unlock();
        }

        const gameMenu = document.getElementById('game-menu');
        if (gameMenu) {
            gameMenu.style.display = 'none';
        }

        session.addEventListener('end', () => {
            console.log('VR session ended');

            if (viewerState.renderer && viewerState.renderer.xr) {
                viewerState.renderer.xr.enabled = false;
            }
            if (gameMenu) {
                gameMenu.style.display = 'block';
            }
        });

        console.log('VR session started successfully - SteamVR should now be active');
    } catch (error) {
        console.error('Failed to start VR session:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);

        let errorMessage = 'Failed to start VR session: ';
        if (error.name === 'NotSupportedError') {
            errorMessage += 'Reference space not supported. Try different VR features.';
        } else if (error.name === 'InvalidStateError') {
            errorMessage += 'Invalid XR state. Please refresh the page.';
        } else {
            errorMessage += error.message;
        }

        alert(errorMessage);
    }
}

/** Wire Enter VR button and WebXR availability checks. */
export function initVrSession() {
    const vrBtn = document.getElementById('vr-btn');
    if (!vrBtn) return;

    if (navigator.xr) {
        navigator.xr.isSessionSupported('immersive-vr').then(supported => {
            vrBtn.disabled = !supported;
            if (!supported) {
                vrBtn.textContent = 'VR Not Available';
            }
        });
    } else {
        vrBtn.disabled = true;
        vrBtn.textContent = 'VR Not Supported';
    }

    vrBtn.addEventListener('click', async () => {
        if (!vrBtn.disabled) {
            vrBtn.disabled = true;
            vrBtn.textContent = 'Starting VR...';
            await enterVR();
            setTimeout(() => {
                if (vrBtn.textContent.includes('Starting')) {
                    vrBtn.disabled = false;
                    vrBtn.textContent = 'Enter VR';
                }
            }, 3000);
        }
    });
}
