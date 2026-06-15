# Sompi Minigolf

Browser minigolf rooms inspired by classic 2000s web minigolf.

## Live

- Netlify: https://sompi-minigolf.netlify.app/
- Public realtime test endpoint: https://coinathlete.tail4ce556.ts.net/

The Netlify client currently uses the public realtime endpoint above for Socket.IO rooms. That endpoint is good for playtesting, but the next production step is moving realtime hosting off the local PC.

## What Works

- Static browser client deploys to Netlify.
- Fullscreen viewport scaling without remote desktop streaming.
- Create/join multiplayer rooms by code.
- Host can start a room and all players receive the same track.
- Basic shared stroke broadcast.
- Playable browser shot loop with friction, wall bounce, and stop state.

## Local Development

```sh
npm install
npm run dev
```

Default ports:

```sh
VITE_PORT=8080
VITE_WS_PORT=8081
VITE_WS_URL=
```

Use `VITE_WS_URL` when the browser client should connect to a remote Socket.IO endpoint.

## Build

```sh
npm run build
```

## Attribution

This project started from the MIT-licensed `eioo/minigolf` TypeScript remake and keeps attribution to the original reverse-engineering and porting work:

- WorldStarHipHopX for original source-code recovery work.
- PhilippvK and contributors at `PhilippvK/playforia-minigolf`.
- Nokkasiili for Rust port/reference work.
- eioo for the TypeScript/React canvas remake.

Classic game names and trademarks belong to their owners.

## License

MIT.
