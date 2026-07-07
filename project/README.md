# Stock Tracker

Local-first stock portfolio and exit-plan tracker built with React, Vite, NestJS, and npm workspaces.

## Requirements

- Node.js 22.12 or later
- npm 10 or later

## Setup

```bash
npm install
npm run dev
```

The React development server runs at `http://localhost:5173` and proxies `/api` requests to Nest at `http://localhost:3000`.

## Production build

```bash
npm run build
npm start
```

Vite writes the production frontend to `backend/public`. Nest serves both that frontend and the API from `http://localhost:3000`; backend endpoints live under `/api`.

## Validation

```bash
npm run lint
npm test
npm run test:e2e
npm run check
```

`npm run check` runs lint, unit tests, and the production build. End-to-end tests remain separate because they open a local HTTP listener.

## Workspace commands

- `npm run dev:frontend` — start only Vite
- `npm run dev:backend` — start only Nest in watch mode
- `npm run build:frontend` — build the React application into `backend/public`
- `npm run build:backend` — compile Nest into `backend/dist`

Generated builds, local databases, backups, environment files, and editor metadata are excluded from version control.
