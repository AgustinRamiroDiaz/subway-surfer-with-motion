SHELL := /bin/bash

.PHONY: help start dev frontend backend frontend-dev backend-dev build test lint

BACKEND_DIR := pose-estimation-tracker-server
BACKEND_HOST ?= 127.0.0.1
BACKEND_PORT ?= 8765
BACKEND_MODEL ?= yolo26s-pose.pt
BACKEND_TRACKER ?= botsort.yaml
BACKEND_CONF ?= 0.35
BACKEND_IMGSZ ?= 640
BACKEND_MAX_POSES ?= 2
POSE_TRACKER_WS_URL ?= ws://$(BACKEND_HOST):$(BACKEND_PORT)

BACKEND_ARGS := --host $(BACKEND_HOST) --port $(BACKEND_PORT) --model $(BACKEND_MODEL) --tracker $(BACKEND_TRACKER) --conf $(BACKEND_CONF) --imgsz $(BACKEND_IMGSZ) --max-poses $(BACKEND_MAX_POSES)

help:
	@printf "Targets:\n"
	@printf "  make dev       Run frontend and backend with autoreload\n"
	@printf "  make start     Run frontend and backend\n"
	@printf "  make frontend  Run the Vite frontend\n"
	@printf "  make backend   Run the pose tracker server\n"
	@printf "  make build     Build the frontend\n"
	@printf "  make test      Run frontend tests\n"
	@printf "  make lint      Run frontend lint\n"

start:
	$(MAKE) -j2 frontend backend

dev:
	$(MAKE) -j2 frontend-dev backend-dev

frontend:
	VITE_POSE_TRACKER_WS_URL=$(POSE_TRACKER_WS_URL) pnpm start

frontend-dev: frontend

backend:
	cd $(BACKEND_DIR) && uv run pose-tracker-server $(BACKEND_ARGS)

backend-dev:
	cd $(BACKEND_DIR) && uv run --with watchfiles watchfiles --filter python "env -u VIRTUAL_ENV uv run pose-tracker-server $(BACKEND_ARGS)" src tests pyproject.toml

build:
	pnpm build

test:
	pnpm test

lint:
	pnpm lint
