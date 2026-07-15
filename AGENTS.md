# AGENTS.md

## Project context

This is the Bawjiase Community Bank Finance Payslip Platform. It uses a React/Vite frontend and a local Flask API.

## Key files

- `src/`: frontend source.
- `src/api/portalClient.js`: authenticated local API client.
- `mail-api/app.py`: Flask API and application rules.
- `mail-api/*.json`: local development data stores.
- `vite.config.js`: frontend configuration and Flask proxy.

## Working notes

- Preserve the existing banking interface and role-based access rules.
- Run Flask on port 4190 and Vite on port 5173.
- Use `npm run lint`, `npm run build`, and `python -m py_compile mail-api/app.py` before finishing.
- Do not commit secrets, active sessions, or production payroll information.
