# `Otherland Network`

Original Idea (2021): \
https://docs.google.com/document/d/10aCnPtlk5jxao3bkXkVag74I6hlBHozo3HQKZCO9zkg/edit?usp=sharing 

Otherland Network on X: \
https://x.com/otherland_x

Otherland Network on YouTube: \
https://www.youtube.com/@Otherland_Network

`Tech Stack`

- Dfinity ICP Application
- written in motoko and html5/css/js
- using three.js for 3D Rendering
- using Rapier as Physics Engine
- using peer.js for P2P communication
- using esprima for custom coding
- written by Grok3

`Current Functionality`

Loads the environment, list of entities and program code from the local/network node \
Caches data of nodes with hash, loads data from cache if hash stayed the same \
Subscribes to other entities via WebRTC to stream their position, movement, etc. \
Broadcasts own location, movement, etc. at WebRTC address deposited in the node \
Renders the view of the environment and entities, animated with program code \
Reacts to basic gestures from the user provides menu options Basic User Interface \

`Future Roadmap`

Implementing functionality to placeholdes UI areas:
- Chat (World / Group / Single)
- Friends list
- Mini Map
- Inventory
- Interaction Points
Keeping a contact list with direct calling, messaging and data sharing \
Reduce own visibility further, no presence marker, only register in the node \
Automate user movement & gestures with pre recorded macros \
Provides an Interface to the Otherland Network to manage own nodes, exchange data between own nodes/entities and personal computing space, etc. \
Serves as a wallet to pay for all expenses in Otherland and to receive payment \
Convert glTF, obj, 3ds and other file formats to glb in App \

`Setup IDE`

https://internetcomputer.org/docs/building-apps/getting-started/install 
- Install VS Code (start in WSL mode!)
- Run wsl --install in PowerShell Admin
- Finish Ubuntu Installation
- Install nvm, node.js, and npm
- Install dfx
- Clone Git Repo
- 'dfx start --background --clean'
- 'dfx deploy'

`Reset Network`

'dfx stop' (or 'dfx --killall' if needed)
'dfx start --background --clean'
'dfx deploy'

`Participate`

If you are working on something similar or find this idea interesting, don't hesitate to make contact.