# Social Media Engagement Simulation Tool

A TypeScript-based SaaS system for simulating social media engagement using Playwright, with multi-platform support, session management, Grok-powered comment generation, and comprehensive interaction tracking.

## Features

- **Multi-Platform Support**: Twitter and Facebook adapters with Playwright automation
- **Dynamic Interaction Flows**: Create and execute ordered interaction scenarios
- **AI-Powered Comments**: Grok API integration for generating contextually relevant comments
- **Comprehensive Tracking**: Detailed interaction logging with entity relationships
- **Session Management**: Enforced session duration (8-15 min) and daily limits (max 3 per account)
- **Superuser Authentication**: Single admin account with JWT-based authentication
- **Queue-Based Processing**: BullMQ with Redis for scalable job processing
- **Observability**: Structured logging, metrics collection, and health checks

## Prerequisites

- Node.js 20+
- PostgreSQL
- Redis
- Playwright browsers (installed automatically)

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/social_automation

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-key-change-in-production

# Encryption (32 bytes in hex = 64 characters)
ENCRYPTION_KEY=your-32-byte-encryption-key-here

# Grok API (X.AI)
GROK_API_KEY=your-grok-api-key
GROK_API_URL=https://api.x.ai/v1

# GoLogin (Anti-detect browser)
GOLOGIN_TOKEN=your-gologin-api-token

# Server
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Run database migrations:
```bash
psql $DATABASE_URL -f migrations/001_initial_schema.sql
psql $DATABASE_URL -f migrations/002_add_browser_state.sql
psql $DATABASE_URL -f migrations/004_gologin_integration.sql
```

3. Create superuser (one-time setup):
   - Generate a bcrypt hash for your password (you can use an online tool or Node.js: `require('bcrypt').hashSync('your_password', 10)`)
   - Run the SQL statement in `src/database/migrations/001_create_superuser.sql` with your username and the generated hash
   - Example:
   ```sql
   INSERT INTO superuser (username, password_hash, created_at, updated_at)
   VALUES ('admin', '$2b$10$YourGeneratedHashHere', NOW(), NOW());
   ```
   **Note**: Only one superuser should exist. This account controls all APIs. Social media accounts are separate and only used for running automation jobs.

4. Build the project:
```bash
npm run build
```

## Running

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

## API Endpoints

All endpoints except `/api/health` require superuser authentication via JWT token in the `Authorization: Bearer <token>` header.

### Authentication
- `POST /api/auth/login` - Superuser login (returns JWT)

### Social Accounts
- `POST /api/social-accounts` - Create social account
- `GET /api/social-accounts` - List all accounts
- `GET /api/social-accounts/:id` - Get account by ID
- `PUT /api/social-accounts/:id` - Update account
- `DELETE /api/social-accounts/:id` - Delete account

### Scenarios
- `POST /api/scenarios` - Create interaction flow scenario
- `GET /api/scenarios` - List scenarios
- `GET /api/scenarios/:id` - Get scenario by ID
- `PUT /api/scenarios/:id` - Update scenario
- `DELETE /api/scenarios/:id` - Delete scenario

### Sessions
- `POST /api/sessions/start` - Start a session with optional scenario
- `GET /api/sessions` - List sessions
- `GET /api/sessions/:id` - Get session by ID

### Interactions
- `GET /api/interactions` - Query interactions with filters

### Metrics
- `GET /api/metrics` - Query metrics (add `?aggregated=true` for aggregated metrics)

### Health
- `GET /api/health` - Health check (public)

## Deployment

### Railway

1. Connect your repository to Railway
2. Set environment variables in Railway dashboard
3. Railway will automatically build and deploy using the Dockerfile

### Docker

```bash
docker build -t social-automation .
docker run -p 3000:3000 --env-file .env social-automation
```

## Database Migration Strategy

1. Run schema migrations on first deployment:
```bash
psql $DATABASE_URL -f migrations/001_initial_schema.sql
```

2. Create the superuser manually via SQL (see step 3 in Installation above). This is a one-time setup.

3. For production, migrations should be run as part of the deployment process or manually before starting the application.

## Architecture

- **Adapters**: Platform-specific implementations (Twitter, Facebook)
- **Workers**: Session and scenario execution workers
- **Services**: Business logic (sessions, scenarios, metrics, LLM)
- **API**: Fastify-based REST API
- **Queue**: BullMQ for job processing
- **Database**: PostgreSQL for persistent storage

## Safety and Compliance

- Rate limiting per account/platform
- Session duration enforcement (8-15 minutes)
- Maximum 3 sessions per day per account
- Encrypted credential storage
- Audit logging for all actions

**Note**: This tool is for load testing and resilience testing purposes. Ensure compliance with social media platform Terms of Service.

## License

ISC

