# Docker Infrastructure Lab

A hands-on Docker infrastructure project designed to explore containerization, networking, reverse proxying, load balancing, persistent storage, database backup and restore, and multi-container application deployment.

The project is built incrementally using Docker CLI commands before moving to Docker Compose. The goal is to understand how each infrastructure component works independently and how the components communicate with each other.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Docker Network](#docker-network)
- [Services](#services)
- [Request Routing](#request-routing)
- [Getting Started](#getting-started)
- [Nginx Configuration](#nginx-configuration)
- [Persistent Storage](#persistent-storage)
- [Database Backup and Restore](#database-backup-and-restore)
- [Useful Docker Commands](#useful-docker-commands)
- [Troubleshooting](#troubleshooting)
- [Current Project Status](#current-project-status)
- [Roadmap](#roadmap)

---

## Project Overview

Docker Infrastructure Lab demonstrates a containerized application architecture consisting of:

- A React frontend.
- A Node.js REST API running multiple instances.
- Nginx as a reverse proxy and load balancer.
- PostgreSQL as the relational database.
- Redis as the in-memory data store.
- Docker bridge networking for internal service communication.
- Docker named volumes for persistent data.
- PostgreSQL logical backup and restore procedures.

The project initially uses individual `docker run` commands to understand container lifecycle, networking, port publishing, volumes, and service communication.

Docker Compose will be introduced in a later phase.

## Architecture

### High-Level Architecture

```text
                         CLIENT / BROWSER
                                |
                                |
                         localhost:8080
                                |
                                v
                      +-------------------+
                      |   NGINX GATEWAY   |
                      |   Reverse Proxy   |
                      |   Load Balancer   |
                      +-------------------+
                                |
                 +--------------+--------------+
                 |                             |
              /  |                         /api/
                 |                             |
                 v                             v
        +----------------+            +----------------+
        | Frontend Nginx |            | API Upstream    |
        | Static Content |            | Load Balancing  |
        +----------------+            +----------------+
                                              |
                             +----------------+----------------+
                             |                |                |
                             v                v                v
                        +---------+      +---------+      +---------+
                        | API 1   |      | API 2   |      | API 3   |
                        | :3000   |      | :3000   |      | :3000   |
                        +---------+      +---------+      +---------+
                             |                |                |
                             +----------------+----------------+
                                              |
                                   +----------+----------+
                                   |                     |
                                   v                     v
                             +-----------+         +-----------+
                             | PostgreSQL|         |   Redis   |
                             |   :5432   |         |   :6379   |
                             +-----------+         +-----------+
                                   |                     |
                                   v                     v
                             Named Volume          Named Volume
```

### Network Design

All application services communicate through a dedicated Docker bridge network.

```text
Docker Host
    |
    +-- lab-infra-network (bridge)
            |
            +-- lab-nginx
            +-- lab-frontend
            +-- lab-api-1
            +-- lab-api-2
            +-- lab-api-3
            +-- lab-postgres
            +-- lab-redis
```

### Single Entry Point

Only the Nginx Gateway should be publicly exposed.

| Service | Internal Port | Host Port |
|---|---:|---:|
| Nginx Gateway | 80 | 8080 |
| Frontend Nginx | 80 | Not published |
| API instances | 3000 | Not published |
| PostgreSQL | 5432 | Not published |
| Redis | 6379 | Not published |

The internal services remain accessible to other containers through Docker networking.

> During the initial manual setup, some API ports and the frontend port were published for direct testing. The target architecture uses the single-entry-point model described above.

## Technology Stack

| Technology | Purpose |
|---|---|
| Docker Engine | Container runtime |
| Docker CLI | Container lifecycle management |
| Docker Bridge Network | Internal service communication |
| Node.js | Backend runtime |
| React | Frontend application |
| Vite | Frontend build tooling |
| Nginx | Reverse proxy and load balancer |
| PostgreSQL 16 | Relational database |
| Redis | In-memory data store |
| Docker Volumes | Persistent storage |

## Project Structure

The current project uses a simple structure:

```text
docker-infrastructure-lab/
│
├── app/                       # Backend application
│   └── Dockerfile
│
├── frontend/                  # React + Vite application
│   ├── src/
│   │   ├── App.jsx
│   │   └── App.css
│   ├── package.json
│   └── Dockerfile
│
├── nginx/
│   ├── default.conf           # Gateway configuration
│   └── default.conf.bak       # Previous configuration backup
│
├── backups/                   # Database backup files
│
├── README.md
└── .gitignore
```

Additional infrastructure directories and automation scripts can be introduced as the project grows.

## Prerequisites

Install the following tools:

- Docker Engine
- Docker CLI
- Node.js and npm (for local frontend/backend development)
- Git
- curl

Verify the installations:

```bash
docker --version
docker compose version
node --version
npm --version
git --version
```

## Docker Network

Create the application network:

```bash
docker network create \
  --driver bridge \
  lab-infra-network
```

Inspect the network:

```bash
docker network inspect lab-infra-network
```

List Docker networks:

```bash
docker network ls
```

Containers attached to this network can resolve each other by container name.

For example:

```text
lab-api-1:3000
lab-postgres:5432
lab-redis:6379
lab-frontend:80
```

Container names are used for internal DNS resolution instead of hardcoding container IP addresses.

## Services

### 1. Frontend

The frontend is a React application built with Vite.

The production build is served by Nginx.

Dockerfile:

```dockerfile
# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

Build the frontend image:

```bash
docker build \
  -t infrastructure-frontend:v1 \
  ./frontend
```

Run the frontend internally:

```bash
docker run -d \
  --name lab-frontend \
  --network lab-infra-network \
  --restart unless-stopped \
  infrastructure-frontend:v1
```

The frontend is accessed through the Gateway:

```text
http://localhost:8080
```

### 2. Backend API

The backend is a Node.js application running on port `3000` inside each container.

Three API instances are used to demonstrate load balancing.

| Container | Internal Port |
|---|---:|
| lab-api-1 | 3000 |
| lab-api-2 | 3000 |
| lab-api-3 | 3000 |

The API instances connect to PostgreSQL and Redis through the internal Docker network.

Example environment variables:

```env
PORT=3000

DB_HOST=lab-postgres
DB_PORT=5432
DB_NAME=db_test
DB_USER=db_user
DB_PASSWORD=labpass

REDIS_HOST=lab-redis
```

These credentials are for local lab use only. Do not use them in production.

Example API endpoints:

| Endpoint | Description |
|---|---|
| `/` | API information |
| `/health` | Health check |
| `/db` | Database connectivity |
| `/cache` | Redis connectivity |

Build the API image (adjust the build context if the backend Dockerfile is in another directory):

```bash
docker build \
  -t api-infrastructure:v1 \
  ./app
```

### 3. Nginx Gateway

Nginx is the single entry point for external HTTP traffic.

Responsibilities:

- Serve requests through the frontend container.
- Route API requests to the API upstream.
- Distribute API traffic across multiple instances.
- Forward client and request headers.
- Hide internal service ports from external clients.

### 4. PostgreSQL

PostgreSQL runs using:

```text
postgres:16-alpine
```

Database configuration:

| Setting | Value |
|---|---|
| Database | db_test |
| Username | db_user |
| Internal Port | 5432 |
| Container | lab-postgres |
| Volume | lab-postgres-data |

The database data directory is persisted through a named Docker volume.

### 5. Redis

Redis is used as the application's in-memory data store.

Image:

```text
redis:alpine
```

Container:

```text
lab-redis
```

Redis persistence is enabled using Append Only File (AOF):

```bash
redis-server --appendonly yes
```

Named volume:

```text
lab-redis-data
```

AOF helps Redis recover data after a restart, but it is not a substitute for an independent backup.

## Request Routing

### Nginx Configuration

File:

```text
nginx/default.conf
```

Configuration:

```nginx
# API Load Balancer
upstream api_backend {
    server lab-api-1:3000;
    server lab-api-2:3000;
    server lab-api-3:3000;
}

# Frontend
upstream frontend_backend {
    server lab-frontend:80;
}

server {
    listen 80;
    server_name _;

    # Frontend requests
    location / {
        proxy_pass http://frontend_backend;

        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API requests
    location /api/ {
        proxy_pass http://api_backend/;

        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Important: URI Rewriting

The trailing slash in this directive is intentional:

```nginx
proxy_pass http://api_backend/;
```

Nginx replaces the matching `/api/` prefix with `/`.

Examples:

| Browser Request | API Request |
|---|---|
| `/api/health` | `/health` |
| `/api/db` | `/db` |
| `/api/cache` | `/cache` |

This allows the frontend to use root-relative API URLs:

```javascript
fetch('/api/health');
```

The browser sends the request to the same origin as the frontend.

When the frontend is accessed through:

```text
http://localhost:8080
```

the API request becomes:

```text
http://localhost:8080/api/health
```

Nginx then routes the request internally to the API cluster.

This approach avoids requiring a separate frontend API origin and simplifies CORS configuration.

### Validate and Reload Nginx

Check the configuration:

```bash
docker exec lab-nginx nginx -t
```

Reload Nginx:

```bash
docker exec lab-nginx nginx -s reload
```

Print the complete active configuration:

```bash
docker exec lab-nginx nginx -T
```

## Persistent Storage

Docker containers are ephemeral. Removing a container does not necessarily remove the data stored in its named volumes.

This project uses named volumes for PostgreSQL and Redis.

### PostgreSQL Volume

```text
lab-postgres-data
```

Mount destination:

```text
/var/lib/postgresql/data
```

Inspect the volume:

```bash
docker volume inspect lab-postgres-data
```

### Redis Volume

```text
lab-redis-data
```

Mount destination:

```text
/data
```

Inspect the volume:

```bash
docker volume inspect lab-redis-data
```

### List All Volumes

```bash
docker volume ls
```

### Important

Removing a container does not automatically remove its named volume.

However, removing a volume permanently deletes its stored data.

Be careful with:

```bash
docker volume rm lab-postgres-data
```

Never run destructive volume commands unless the data is backed up or intentionally disposable.

## Database Backup and Restore

Database persistence and database backup solve different problems.

- Persistence protects data against container recreation.
- Backup provides a separate recovery copy.
- Restore verifies that the backup can actually be recovered.

### PostgreSQL Backup

Create a backup directory:

```bash
mkdir -p backups
```

Create a custom-format PostgreSQL backup:

```bash
docker exec lab-postgres \
  pg_dump -U db_user -d db_test -Fc \
  > backups/db_test_backup.dump
```

Inspect the backup:

```bash
ls -lh backups/
file backups/db_test_backup.dump
```

### Create a Restore Database

```bash
docker exec lab-postgres \
  createdb -U db_user db_test_restore
```

### Restore the Backup

```bash
docker exec -i lab-postgres \
  pg_restore -U db_user -d db_test_restore \
  < backups/db_test_backup.dump
```

### Verify Restored Data

Connect to PostgreSQL:

```bash
docker exec -it lab-postgres \
  psql -U db_user -d db_test_restore
```

List tables:

```sql
\dt
```

Query the test table:

```sql
SELECT * FROM docker_persistence_test;
```

Exit:

```sql
\q
```

### Backup Best Practices

- Keep backup files outside the database container.
- Do not commit database credentials or sensitive backups to Git.
- Store production backups outside the Docker host.
- Periodically test restore procedures.
- Consider encryption and retention policies for important data.

## Useful Docker Commands

### Container Management

List running containers:

```bash
docker ps
```

List all containers:

```bash
docker ps -a
```

View container logs:

```bash
docker logs lab-nginx
docker logs lab-frontend
docker logs lab-api-1
```

Follow logs:

```bash
docker logs -f lab-nginx
```

Inspect a container:

```bash
docker inspect lab-nginx
```

Execute a command inside a container:

```bash
docker exec -it lab-nginx sh
```

Stop a container:

```bash
docker stop lab-frontend
```

Start a container:

```bash
docker start lab-frontend
```

Remove a container:

```bash
docker rm -f lab-frontend
```

### Image Management

List images:

```bash
docker images
```

Build an image:

```bash
docker build -t image-name:version .
```

Remove an image:

```bash
docker rmi image-name:version
```

### Network Management

List networks:

```bash
docker network ls
```

Inspect a network:

```bash
docker network inspect lab-infra-network
```

Connect a running container:

```bash
docker network connect lab-infra-network container-name
```

Disconnect a container:

```bash
docker network disconnect lab-infra-network container-name
```

### Volume Management

List volumes:

```bash
docker volume ls
```

Inspect a volume:

```bash
docker volume inspect lab-postgres-data
```

---

## Troubleshooting

### 1. Port Already Allocated

Example:

```text
Bind for 0.0.0.0:3000 failed:
port is already allocated
```

Find the process or container using the port:

```bash
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

Stop or reconfigure the conflicting service before publishing the port again.

### 2. Nginx Returns 502 Bad Gateway

Possible causes:

- The upstream container is stopped.
- The upstream hostname cannot be resolved.
- Containers are not attached to the same Docker network.
- The application is not listening on the expected internal port.

Check:

```bash
docker ps
docker network inspect lab-infra-network
docker logs lab-nginx
```

Validate Nginx:

```bash
docker exec lab-nginx nginx -t
```

### 3. Nginx Returns 404 Not Found

Check:

- The requested URI.
- Nginx `location` configuration.
- The `proxy_pass` trailing slash.
- Whether the request reached the Gateway or the frontend container directly.

Inspect active configuration:

```bash
docker exec lab-nginx nginx -T
```

### 4. Frontend Cannot Connect to API

The frontend uses:

```javascript
fetch('/api/health');
```

This request uses the browser's current origin.

Correct access:

```text
http://localhost:8080
```

Incorrect for the intended Gateway architecture:

```text
http://localhost:8081
```

When accessing the frontend directly through its own published port, requests are sent to that frontend Nginx rather than the Gateway.

### 5. Database Data Is Missing

Check whether the PostgreSQL volume is mounted:

```bash
docker inspect lab-postgres
```

Inspect the volume:

```bash
docker volume inspect lab-postgres-data
```

Do not delete or recreate the volume before confirming where the database data is stored.

---

## Current Project Status

| Component | Status |
|---|---|
| Docker bridge network | Implemented |
| Node.js API container | Implemented |
| Multiple API instances | Implemented |
| Nginx API load balancing | Implemented |
| PostgreSQL container | Implemented |
| Redis container | Implemented |
| PostgreSQL named volume | Implemented |
| Redis named volume with AOF | Implemented |
| PostgreSQL backup and restore | Practiced |
| React frontend container | Implemented |
| Nginx frontend routing | Implemented |
| Single-entry-point Gateway | Implemented and tested |
| Removal of all direct Host port mappings | Pending final verification |
| Docker Compose | Planned |

## Roadmap

The project will continue in the following phases:

### Phase 1 — Docker Fundamentals

- Docker images and containers.
- Docker CLI.
- Container lifecycle.
- Port publishing.
- Docker networking.

### Phase 2 — Application Infrastructure

- Multiple API instances.
- Nginx reverse proxy.
- Round Robin load balancing.
- Frontend containerization.
- Single-entry-point architecture.

### Phase 3 — Persistence and Recovery

- PostgreSQL named volumes.
- Redis persistence and AOF.
- Database backup.
- Database restore.
- Volume migration concepts.

### Phase 4 — Docker Compose

- Convert manual Docker commands into `compose.yaml`.
- Define application services.
- Configure networks and volumes.
- Environment variables and `.env`.
- Service dependencies.
- Health checks.
- Compare manual Docker CLI and Compose workflows.

### Phase 5 — Production-Oriented Infrastructure

- Nginx security and rate limiting.
- Health checks and service recovery.
- Logging and monitoring.
- Prometheus and Grafana.
- Resource limits.
- Secrets management.

### Phase 6 — Automation and Deployment

- Shell automation scripts.
- CI/CD pipeline.
- Automated tests.
- Image versioning.
- Deployment and migration workflows.

---

## Learning Objectives

By completing this project, the goal is to understand:

- How Docker containers use host resources.
- How container networking and internal DNS work.
- The difference between internal container ports and published host ports.
- How reverse proxies and load balancers route traffic.
- How persistent storage works.
- How to back up and restore databases.
- How to design a multi-container application.
- How to transition from manual Docker commands to declarative infrastructure using Docker Compose.

---

**Project:** Docker Infrastructure Lab  
**Approach:** Hands-on, incremental infrastructure engineering  
**Primary Goal:** Build a practical understanding of Docker-based application infrastructure.