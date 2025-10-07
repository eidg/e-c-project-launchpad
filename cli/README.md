# E C Project Launchpad CLI

A scaffolding tool to create rebranded copies of the E C Project Launchpad codebase with automatic GitHub repository creation.

## Installation

```bash
cd cli
npm install
npm link
```

After linking, the `e-c-project-launchpad` command will be available globally.

## Usage

### Create a New App

```bash
e-c-project-launchpad create-app "My Awesome App"
```

This will:
1. Create a new directory at `~/Documents/my-awesome-app`
2. Copy the entire E C Project Launchpad codebase
3. Rebrand all instances of "E C Project Launchpad" to "My Awesome App" (with proper casing)
4. Initialize a git repository
5. Create a GitHub repository (if `GITHUB_TOKEN` is set)
6. Push the initial commit to GitHub

### Dry Run (Preview)

To see what the CLI will do without actually creating files:

```bash
e-c-project-launchpad create-app "My Awesome App" --dry-run
```

### GitHub Integration

To enable GitHub repository creation, set one of these environment variables:

```bash
export GITHUB_TOKEN=your_github_token_here
# or
export GH_TOKEN=your_github_token_here
```

Create a token at: https://github.com/settings/tokens

Required scopes: `repo` (for creating repositories)

## Name Variations

The CLI automatically handles different casing conventions:

| Input | Example Output |
|-------|---------------|
| `"My New App"` | |
| PascalCase | `MyNewApp` |
| kebab-case | `my-new-app` |
| snake_case | `my_new_app` |
| UPPER_SNAKE | `MY_NEW_APP` |
| Space Case | `My New App` |

These variations are used throughout:
- **PascalCase**: JavaScript/React component names
- **kebab-case**: Directory names, Docker container names, repository name
- **snake_case**: Database names, environment variables
- **UPPER_SNAKE**: Constants, Docker networks
- **Space Case**: UI display text, README titles

## What Gets Rebranded

The CLI replaces "E C Project Launchpad" in all its variations across:

- ✅ README.md and documentation
- ✅ package.json files (all services)
- ✅ Docker Compose configuration
- ✅ Database names
- ✅ Container names and network names
- ✅ Frontend UI text
- ✅ Comments and descriptions
- ✅ Environment variable names

## What Gets Excluded

The following are NOT copied to the new project:

- `node_modules/` directories
- `.git/` directory
- Build artifacts (`dist/`, `build/`, `.next/`)
- Cache directories
- `.env` files (you'll need to create these)
- Log files
- `.DS_Store` files

## After Creation

Once your new app is created:

```bash
cd ~/Documents/my-awesome-app

# Create environment file
cp .env.example .env

# Edit .env with your API keys
nano .env

# Start the application
docker compose up --build -d
```

## Example

```bash
# Create a new app called "Customer Portal"
e-c-project-launchpad create-app "Customer Portal"

# Output:
# 🚀 Creating new app: Customer Portal
#
# Source: /path/to/e-c-project-launchpadject-v2
# Destination: /Users/you/Documents/customer-portal
#
# ✅ Created project directory
# ✅ Copied and rebranded all files
# ✅ Initialized git repository
# ✅ GitHub repository created: https://github.com/you/customer-portal
#
# ✨ Success! Your new app "Customer Portal" is ready!
#
# 📝 Next steps:
#    cd /Users/you/Documents/customer-portal
#    cp .env.example .env
#    # Edit .env with your API keys
#    docker compose up --build -d
```

## Troubleshooting

### CLI command not found

Run `npm link` again from the `cli/` directory.

### GitHub creation fails

- Verify your `GITHUB_TOKEN` is set and valid
- Check token has `repo` scope
- The CLI will still create the local project and git repo if GitHub fails

### Permission errors

- Ensure you have write access to `~/Documents/`
- Check that the destination directory doesn't already exist

## Commands

| Command | Description |
|---------|-------------|
| `e-c-project-launchpad create-app <name>` | Create a new rebranded project |
| `e-c-project-launchpad create-app <name> --dry-run` | Preview without creating files |
| `e-c-project-launchpad new <name>` | Alias for `create-app` |
| `e-c-project-launchpad --help` | Show help |
| `e-c-project-launchpad --version` | Show version |
