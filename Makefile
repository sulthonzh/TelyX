.PHONY: help build test clean run stop logs backend-test frontend-test docker-build docker-up docker-down

# Variables
BACKEND_DIR := backend
FRONTEND_DIR := frontend
DOCKER_DIR := docker

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(BLUE)TelyX - Unified Observability Suite$(NC)"
	@echo ""
	@echo "$(GREEN)Available targets:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'

# Build targets
build: backend-build frontend-build ## Build all components

backend-build: ## Build backend
	@echo "$(BLUE)Building backend...$(NC)"
	@cd $(BACKEND_DIR) && go build -o main .
	@echo "$(GREEN)Backend build complete!$(NC)"

frontend-build: ## Build frontend
	@echo "$(BLUE)Building frontend...$(NC)"
	@cd $(FRONTEND_DIR) && npm run build
	@echo "$(GREEN)Frontend build complete!$(NC)"

# Test targets
test: backend-test frontend-test ## Run all tests

backend-test: ## Run backend tests
	@echo "$(BLUE)Running backend tests...$(NC)"
	@cd $(BACKEND_DIR) && go test -v ./...
	@echo "$(GREEN)Backend tests complete!$(NC)"

backend-test-coverage: ## Run backend tests with coverage
	@echo "$(BLUE)Running backend tests with coverage...$(NC)"
	@cd $(BACKEND_DIR) && go test -cover -coverprofile=coverage.out ./...
	@cd $(BACKEND_DIR) && go tool cover -html=coverage.out -o coverage.html
	@echo "$(GREEN)Coverage report generated: backend/coverage.html$(NC)"

frontend-test: ## Run frontend tests
	@echo "$(BLUE)Running frontend tests...$(NC)"
	@cd $(FRONTEND_DIR) && npm test -- --watchAll=false
	@echo "$(GREEN)Frontend tests complete!$(NC)"

frontend-test-coverage: ## Run frontend tests with coverage
	@echo "$(BLUE)Running frontend tests with coverage...$(NC)"
	@cd $(FRONTEND_DIR) && npm test -- --coverage --watchAll=false
	@echo "$(GREEN)Coverage report generated: frontend/coverage/$(NC)"

# Development targets
dev-backend: ## Run backend in development mode
	@echo "$(BLUE)Starting backend in development mode...$(NC)"
	@cd $(BACKEND_DIR) && go run main.go

dev-frontend: ## Run frontend in development mode
	@echo "$(BLUE)Starting frontend in development mode...$(NC)"
	@cd $(FRONTEND_DIR) && npm start

# Docker targets
docker-build: ## Build Docker images
	@echo "$(BLUE)Building Docker images...$(NC)"
	@cd $(DOCKER_DIR) && docker-compose build
	@echo "$(GREEN)Docker images built!$(NC)"

docker-up: ## Start all services with Docker Compose
	@echo "$(BLUE)Starting all services...$(NC)"
	@cd $(DOCKER_DIR) && docker-compose up -d
	@echo "$(GREEN)All services started!$(NC)"
	@echo ""
	@echo "$(YELLOW)Services are available at:$(NC)"
	@echo "  Frontend:              http://localhost:3000"
	@echo "  Backend:               http://localhost:8080"
	@echo "  OpenSearch Dashboards: http://localhost:5601"
	@echo "  Prometheus:            http://localhost:9090"
	@echo "  Metrics:               http://localhost:8080/metrics"

docker-down: ## Stop all services
	@echo "$(BLUE)Stopping all services...$(NC)"
	@cd $(DOCKER_DIR) && docker-compose down
	@echo "$(GREEN)All services stopped!$(NC)"

docker-logs: ## Show Docker logs
	@cd $(DOCKER_DIR) && docker-compose logs -f

docker-restart: docker-down docker-up ## Restart all services

docker-clean: docker-down ## Clean Docker resources
	@echo "$(BLUE)Cleaning Docker resources...$(NC)"
	@cd $(DOCKER_DIR) && docker-compose down -v --remove-orphans
	@echo "$(GREEN)Docker resources cleaned!$(NC)"

# Dependency management
deps-backend: ## Install backend dependencies
	@echo "$(BLUE)Installing backend dependencies...$(NC)"
	@cd $(BACKEND_DIR) && go mod download
	@echo "$(GREEN)Backend dependencies installed!$(NC)"

deps-frontend: ## Install frontend dependencies
	@echo "$(BLUE)Installing frontend dependencies...$(NC)"
	@cd $(FRONTEND_DIR) && npm install
	@echo "$(GREEN)Frontend dependencies installed!$(NC)"

deps: deps-backend deps-frontend ## Install all dependencies

# Code quality targets
fmt-backend: ## Format backend code
	@echo "$(BLUE)Formatting backend code...$(NC)"
	@cd $(BACKEND_DIR) && go fmt ./...
	@cd $(BACKEND_DIR) && gofmt -s -w .
	@echo "$(GREEN)Backend code formatted!$(NC)"

lint-backend: ## Lint backend code
	@echo "$(BLUE)Linting backend code...$(NC)"
	@cd $(BACKEND_DIR) && golangci-lint run || echo "$(YELLOW)golangci-lint not installed. Run: go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest$(NC)"

fmt: fmt-backend ## Format all code

# Clean targets
clean-backend: ## Clean backend build artifacts
	@echo "$(BLUE)Cleaning backend...$(NC)"
	@cd $(BACKEND_DIR) && rm -f main backend.log coverage.out coverage.html
	@echo "$(GREEN)Backend cleaned!$(NC)"

clean-frontend: ## Clean frontend build artifacts
	@echo "$(BLUE)Cleaning frontend...$(NC)"
	@cd $(FRONTEND_DIR) && rm -rf build node_modules coverage
	@echo "$(GREEN)Frontend cleaned!$(NC)"

clean: clean-backend clean-frontend ## Clean all build artifacts
	@echo "$(GREEN)All clean!$(NC)"

# Health check targets
health: ## Check health of all services
	@echo "$(BLUE)Checking service health...$(NC)"
	@echo ""
	@echo "$(YELLOW)Backend Health:$(NC)"
	@curl -s http://localhost:8080/health | jq '.' || echo "$(RED)Backend not responding$(NC)"
	@echo ""
	@echo "$(YELLOW)OpenSearch Health:$(NC)"
	@curl -s http://localhost:9200/_cluster/health | jq '.' || echo "$(RED)OpenSearch not responding$(NC)"
	@echo ""
	@echo "$(YELLOW)Prometheus Health:$(NC)"
	@curl -s http://localhost:9090/-/healthy || echo "$(RED)Prometheus not responding$(NC)"

# Installation target
install: deps build ## Install dependencies and build

# Full setup
setup: ## Complete setup (dependencies, build, start)
	@echo "$(BLUE)Setting up TelyX...$(NC)"
	@make deps
	@make docker-up
	@echo ""
	@echo "$(GREEN)Setup complete!$(NC)"
	@make health

# Quick start
start: docker-up ## Quick start all services

stop: docker-down ## Stop all services

restart: docker-restart ## Restart all services

# Development workflow
dev: ## Start development environment
	@echo "$(BLUE)Starting development environment...$(NC)"
	@echo "$(YELLOW)Backend will run on :8080$(NC)"
	@echo "$(YELLOW)Frontend will run on :3000$(NC)"
	@echo ""
	@echo "Run these commands in separate terminals:"
	@echo "  $(GREEN)make dev-backend$(NC)"
	@echo "  $(GREEN)make dev-frontend$(NC)"

# CI targets (for GitHub Actions)
ci-test: ## Run CI tests
	@make backend-test
	@make frontend-test

ci-build: ## Run CI build
	@make build

# Version
version: ## Show version information
	@echo "$(BLUE)TelyX Version Information$(NC)"
	@echo ""
	@echo "Backend:"
	@cd $(BACKEND_DIR) && go version
	@echo ""
	@echo "Frontend:"
	@cd $(FRONTEND_DIR) && npm --version

# Default target
.DEFAULT_GOAL := help
