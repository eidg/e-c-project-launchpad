# App Replication CLI

This CLI duplicates the entire application into a new directory outside the current repo, updates branding (name), and initializes a fresh Git repository. It does not modify the current project.

- Script: `scripts/tools/replicate_app.py`
- Language: Python 3
- Goal: Create a new repo with a fully working copy of this app under a new name (e.g., "Ghost").

## Requirements

- Python 3.9+
- Git
- Sufficient disk space to copy the repo

## What it does

- Copies the entire repository to a target directory (outside the current repo)
- Renames visible branding strings `E C Project Launchpad` to your provided name in:
  - `README.md`
  - `frontend/src/components/Dashboard.jsx`
- Ensures the replicated `.env` has a unique `COMPOSE_PROJECT_NAME=<slug>` to avoid Docker Compose name collisions
- Initializes a new Git repository and creates an initial commit
- Explicitly avoids copying heavy or transient artifacts (e.g., `.git`, `node_modules`, `__pycache__`, `rpa/results`, etc.)

## What it does not do

- It does not change service directory names or internal code identifiers beyond the targeted branding replacements above.
- It does not modify the original repository.
- It does not publish the new repo; you can add a remote after creation if desired.

## Usage

```bash
python3 scripts/tools/replicate_app.py --name <NewAppName> --dest </absolute/or/tilde/path>
```

- `--name` (required): The new application name, e.g., `Ghost`.
- `--dest` (required): Parent directory where the new app folder will be created.
- `--overwrite` (optional): Allow overwrite if the target directory already exists (only if empty). Default: disabled.

### Example

```bash
python3 scripts/tools/replicate_app.py --name Ghost --dest ~/Projects
```

This will create a new directory at `~/Projects/Ghost` containing a copy of the app with branding changed.

### Start the new app

```bash
cd ~/Projects/Ghost
# Optional: review or adjust .env
# Ensure COMPOSE_PROJECT_NAME is set uniquely.
docker compose up -d --build
open http://localhost:3000
```

## Safety checks

- The destination must be outside the current repo (the tool will refuse to write inside the current repo tree).
- If the target directory exists and is not empty, the tool will abort (unless you handle the directory yourself first).
- The tool generates `COMPOSE_PROJECT_NAME` from the name (slugified) to namespace Docker resources.

## Customization

You can extend the branding replacements to more files or patterns by editing `replace_in_file()` call sites in `replicate_app.py`:

- Current replacements:
  - `README.md`: replace `E C Project Launchpad` → `<NewAppName>`
  - `frontend/src/components/Dashboard.jsx`: replace `E C Project Launchpad` → `<NewAppName>`

To add more files, duplicate the `replace_in_file(...)` calls with additional file paths and patterns.

## Troubleshooting

- If Docker containers from both projects collide in names, verify `COMPOSE_PROJECT_NAME` in the new `.env` is unique.
- If you see old branding in the UI or docs, expand the replacement list in the script to cover additional files.
- If the script complains about the destination path, ensure `--dest` is outside this repository and you have write permissions.
- If `git` commands fail, ensure Git is installed and accessible in your PATH.

## Limitations

- This tool focuses on practical replication for running the same stack under a new name. It does not refactor internal code/module names beyond visible branding.
- For large-scale rebranding (package names, module paths), consider using more extensive search-and-replace or templating.

## File reference

- CLI script: `scripts/tools/replicate_app.py`
- This README: `scripts/tools/README.md`
