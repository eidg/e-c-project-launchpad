# E C Project Launchpad

A real-time chat application with AI workflow orchestration using LangGraph.

## Architecture

- **Frontend**: React with Vite
- **Backend API**: Node.js with Express and WebSockets
- **LangGraph Service**: Python with FastAPI
- **MCP Service**: Python
- **Database**: PostgreSQL
- **Admin**: Adminer

## Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd e-c-project-launchpadject-v2

# Create environment file
cp .env.example .env

# Start all services (builds containers, runs migrations, starts services)
docker compose up --build -d

# Verify everything is working
docker compose ps
```

## CLI Scaffolder

Create rebranded copies of this codebase with a single command:

```bash
# Install CLI (one-time setup)
cd cli
npm install
npm link

# Create a new rebranded project
e-c-project-launchpad create-app "My New App"
```

This will:
- Create a new directory at `~/Documents/my-new-app`
- Copy and rebrand the entire codebase (replace "E C Project Launchpad" → "My New App")
- Initialize git repository
- Create GitHub repository (if `GITHUB_TOKEN` is set)
- Push initial commit

See [`cli/README.md`](./cli/README.md) for full documentation.

### Health Checks

After the stack is up, validate service health:

```bash
# LangGraph service
curl http://localhost:5001/healthz

# Backend API
curl http://localhost:4000/health
curl http://localhost:4000/ai/health
```

## Services

- **Frontend**: http://localhost:3000 (React + Vite)
- **Backend API**: http://localhost:4000 (Node.js + Express + WebSockets)
- **Database**: localhost:5432 (PostgreSQL)
- **Adminer**: http://localhost:8080 (Database admin)
- **LangGraph Service**: http://localhost:5001 (Python + FastAPI)
- **MCP Service**: http://localhost:5100 (Python)

## Features

- ✅ **Authentication**: JWT-based auth with refresh token rotation
- ✅ **Real-time Chat**: ChatGPT-style interface with WebSocket support
- ✅ **Conversation Management**: Create, edit, delete conversations
- ✅ **Database Persistence**: PostgreSQL with automated migrations
- ✅ **AI Integration**: Real AI chat with OpenAI/Anthropic via LangGraph service
  - Frontend -> Backend API -> LangGraph `/graphs/chat/run`
  - Toggle with `USE_CHAT_GRAPH=true|false` (default true)

## Development

This is a monorepo with containerized services. Each service has its own Dockerfile and is orchestrated with Docker Compose.

### Database Migrations

Migrations run automatically on container startup. Manual migration files are in `scripts/migrate/`.

Deprecated audit-related tables have been dropped as of migration `007_drop_audit.sql`.

### Environment Variables

Key environment variables (see `.env.example`):

- `ACCESS_SECRET` / `REFRESH_SECRET`: JWT signing keys
- `DATABASE_URL`: PostgreSQL connection string
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`: Local DB bootstrap
- `NODE_ENV`: Environment mode
- `VITE_API_BASE_URL`: Frontend to backend base URL (local: http://localhost:4000)
- `LANGGRAPH_SERVICE_URL`: Backend -> LangGraph base URL (local: http://langgraph.local:5000)
- `OPENAI_API_KEY`: OpenAI API key (optional; fallback available)
- `ANTHROPIC_API_KEY`: Anthropic API key (optional)
- `USE_CHAT_GRAPH`: `true` to route via LangGraph chat graph (default `true`)

## Notes

- Property audit, Airbnb RPA, and web search integrations have been removed.
- The project is repurposed for core chat and platform features.
