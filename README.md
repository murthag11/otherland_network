# `Otherland Network`

Original Idea (2021): \
https://docs.google.com/document/d/10aCnPtlk5jxao3bkXkVag74I6hlBHozo3HQKZCO9zkg/edit?usp=sharing 

Otherland Network on X: \
https://x.com/otherland_x

Otherland Network on YouTube: \
https://www.youtube.com/@Otherland_Network

`Tech Stack`

- Dfinity ICP Application
- written in Motoko and HTML5 / CSS / JS
- for VR, Desktop and Mobile (cross play)
- using three.js for 3D Rendering
- using Rapier as Physics Engine
- using peer.js for P2P communication
- using esprima for custom code
- written with assistance from Grok

`Current Functionality`

- Loads the environment, list of entities and program code from the local/network node
- Caches data of nodes with hash, loads data from cache if hash stayed the same
- Subscribes to other entities via WebRTC to stream their position, movement, etc.
- Broadcasts own location, movement, etc. at WebRTC address deposited in the node
- Renders the view of the environment and entities, animated with program code
- Reacts to basic gestures from the user provides menu options Basic User Interface

`Future Roadmap`

- In-World Chat and VoiceChat (Global / Channel / Single)
- Inventory, Items and Scarcity mechanisms for RPG economy
- Radar for Interaction Points
- Friendlist with direct calling, messaging and data sharing
- Better Avatar and visibility management
- Automate user movement & gestures with pre recorded macros
- Better Interface for Node and TreeHouse management, allow external asset sources
- Wallet to pay for all expenses in Otherland and to receive donations
- Convert glTF, obj, 3ds and other file formats to glb in App
- NPCs controlled by LLMs through APIs (custom)

`Setup IDE`

https://internetcomputer.org/docs/building-apps/getting-started/install 
- Install WSL (ubuntu)
- Install VS Code (start in WSL mode!)
- Install nvm, node.js, npm, mops, dfx
- Clone Git Repo
- `npm install`
- `npm run mops:setup`  (installs Motoko 1.14 via mops; required for `mo:core` 2.6)
- Copy `.env.example` to `.env` (dfx will fill canister IDs on deploy)
- `dfx start --background --clean`
- Prefer `npm run deploy` (sets `DFX_MOC_PATH=moc-wrapper`). Plain `dfx deploy` only works after `mops toolchain init` and a new shell.

If you see `actorOfPrincipal does not exist` while building Motoko, dfx is using its bundled moc 1.1 instead of the mops toolchain. Fix with:
```bash
npm run mops:setup
# reopen the terminal, or:
export DFX_MOC_PATH=moc-wrapper
npm run deploy
```

`Reset Network`

'dfx stop' (or 'dfx --killall' if needed)
'rm -rf .dfx' (if internet identity anchors fail)
'dfx start --background --clean'
'npm run deploy'

`Participate`

If you are working on something similar or find this idea interesting, don't hesitate to make contact.

`Disclaimer`

This project is not related to any crypto project or token.

This project is a fan-based initiative and is not officially affiliated with, endorsed by, or connected to any of the original creators or entities involved in the development of Otherland, including Game OL GmbH, DRAGO Entertainment S.A., or Tad Williams.