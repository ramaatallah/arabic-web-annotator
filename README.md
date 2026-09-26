# Arabic Web Annotator

A Chrome extension that lets users highlight text on any web page, attach a note to it, and have it saved to a database — the highlight and note reappear the next time the page is opened.

Graduation project, Course/Supervisor: <course or doctor's name>

## Team

| Name | Track |
|---|---|
| Rahaf / Sereen (edit names) | Track 1: Highlighting (Content Script) |
| Rima | Track 2: Popup & Backend connection (Popup + Background) |
| <Name> | Track 3: Server & Database (Backend) |

## Project structure

```
arabic-web-annotator/
├── extension/          ← Chrome extension files
│   ├── manifest.json
│   ├── popup.html / popup.js
│   ├── content.js / styles.css
│   ├── background.js
│   └── icons/
├── backend/             ← Server and database
│   ├── server.js
│   ├── db.js
│   └── package.json
├── docs/
│   └── api-contract.md  ← Agreed data shape between the three tracks
└── README.md
```

## Running the extension

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension` folder.
4. Pin the icon from the toolbar puzzle-piece menu.

After any code change, click the ↻ reload button on the extension's card at `chrome://extensions`.

## Running the server

```bash
cd backend
npm install
node server.js
```

The server runs on `http://localhost:5000`.

## API endpoints

```
POST   /annotations          Add a new annotation
GET    /annotations?url=...  Get annotations for a specific page
PUT    /annotations/:id      Update an annotation
DELETE /annotations/:id      Delete an annotation
```

Full data schema is documented in [`docs/api-contract.md`](docs/api-contract.md).

## Working on this repo

- One branch per task (`feature/task-name`).
- One Pull Request per change, reviewed and approved by a teammate before merging.
- Full workflow details are in the team's Git guide (outside this repo).

## Project status

- [x] Basic extension skeleton
- [x] Popup: enable toggle and annotations list
- [x] Backend: create, read, update, delete annotations
- [x] Popup ↔ Backend connection (`background.js`)
- [ ] Text selection and highlighting (`content.js`)
- [ ] Login
- [ ] Cross-site testing and final polish