# Contributing to TelyX

Thanks for checking this out! Here's how to get started.

## Development Setup

You'll need:
- Docker & Docker Compose
- Go 1.21+
- Node.js 18+

### Running locally

```bash
# Backend
cd backend && go run main.go

# Frontend
cd frontend && npm install && npm start
```

### With Docker

```bash
docker compose -f docker/docker-compose.yml up --build
```

## Making Changes

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/your-thing`)
3. Make your changes
4. Test that nothing broke
5. Open a PR with a clear description

## What to work on

Check the Issues tab. Good first issues are tagged `good-first-issue`.

Some areas that always need help:
- **Frontend components** — new dashboard widgets, better log visualization
- **Backend endpoints** — more search filters, aggregation queries
- **Docs** — examples, guides, use cases
- **Integrations** — alerts (Slack, email), more export formats

## Code Style

- Go: `gofmt` is law
- React/TypeScript: keep it simple, functional components with hooks
- CSS: use the existing variables in `App.css`

## Questions?

Open an issue, don't be shy.
