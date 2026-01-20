# Identity prototype (standalone)

This is a standalone prototype for:

- Camera capture (browser)
- Face recognition (face-api.js descriptors)
- Local profile creation (name/age/interests)
- Face enrollment (store descriptor + optional face image in localStorage)

## Run locally

Camera access requires a secure context. Use the included local server:

```bash
node dev_server.mjs
```

Then open `http://localhost:5175` in your browser.

## Models

By default the prototype loads face-api.js model weights from GitHub (`raw.githubusercontent.com`).

If you want offline/local weights, download them into `identity_prototype/models/` and set the model base URL in the UI.

