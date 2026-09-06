# Repository Guidelines

## Project Structure & Module Organization

PLANKA is a Node.js 20+ monorepo split into two applications:

- `client/` contains the React/Vite frontend. UI components, Redux actions/models, utilities, and styles live under `client/src/`; unit tests are colocated there, and browser acceptance tests are in `client/tests/acceptance/`.
- `server/` contains the Sails.js backend. API policies/controllers, models, services, database migrations, and seeds are organized under their respective directories; tests are under `server/test/`.
- `assets/` holds artwork; `charts/` contains the Helm chart. Root Dockerfiles and Compose files support containerized deployment.

## Build, Test, and Development Commands

Run from the root after `npm install`:

- `npm start` — starts the client and server concurrently for local development.
- `npm run client:build` / `npm run server:build` — builds the frontend / prepares the backend.
- `npm run lint` — runs the configured ESLint checks for both packages.
- `npm test` — runs server Mocha tests, then client Jest tests.
- `cd client && npm run test:acceptance` — runs Cucumber/Playwright acceptance tests.
- `npm run server:db:init`, `npm run server:db:migrate`, and `npm run server:db:seed` — initialize, migrate, and seed the development database as needed.

## Coding Style & Naming Conventions

Use JavaScript/JSX with two-space indentation, single quotes, trailing commas, and a 100-character print width. Follow Airbnb conventions and let ESLint/Prettier be the source of truth. React components and directories use PascalCase (for example, `client/src/components/boards/Boards/Boards.jsx`); utilities, actions, and server modules follow neighboring kebab- or lower-case names. Run `npm run lint` before submitting.

## Testing Guidelines

Name server tests `*.test.js` and place them under `server/test/`; client unit tests use `*.test.js` or `*.test.jsx` near the code they cover. Add or update tests for behavior changes. Run focused tests, then `npm test`; include acceptance coverage for end-to-end flows.

## Commit & Pull Request Guidelines

Use Conventional Commits. Subjects should be imperative, capitalized, no longer than 70 characters, and have no final period (for example, `fix: Preserve board filter state`). Keep each commit a single stable change, separating subject and body with a blank line; explain why in the body. Discuss substantial changes in an issue before implementation. Pull requests should link the issue, describe behavior and validation, mention database/configuration changes, and include screenshots or recordings for UI changes.

## Security & Configuration

Do not commit secrets, local environment files, generated version files, or database credentials. Use the repository’s environment configuration and Docker Compose examples, and consult `SECURITY.md` for vulnerability reporting.
