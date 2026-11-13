# Docker Infrastructure Lab

A hands-on Docker learning project built to understand container infrastructure from an infrastructure-engineering perspective.

The lab is intentionally configured with **individual `docker` commands first**. Docker Compose will be introduced later, after the services, networking, storage, and operational behavior have been understood and tested independently.

## Table of Contents

- [Project Goals](#project-goals)
- [Current Architecture](#current-architecture)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Docker Network](#docker-network)
- [Services](#services)
  - [Redis](#redis)
  - [PostgreSQL](#postgresql)
  - [Node.js API](#nodejs-api)
  - [Nginx](#nginx)
- [Useful Docker Commands](#useful-docker-commands)
- [Verification and Testing](#verification-and-testing)
- [Troubleshooting Notes](#troubleshooting-notes)
- [Next Learning Steps](#next-learning-steps)

---

## Project Goals

This lab is designed to practice:

- Docker images and containers
- Container lifecycle and runtime inspection
- User-defined bridge networks and Docker DNS
- Communication between containers
- Persistent storage with Docker volumes
- Nginx as a reverse proxy
- Container logs, health checks, and operational troubleshooting
- Resource limits and container security
- Rebuilding the same architecture with Docker Compose at a later stage

## Current Architecture

```text
                         Host machine
                       http://localhost:8080
                                |
                                v
                     +--------------------+
                     |   Nginx Container  |
                     |      lab-nginx     |
                     |      Port 80       |
                     +--------------------+
                                |
                      Docker bridge network
                         infra-lab-net
                                |
                                v
                     +--------------------+
                     |    Node.js API     |
                     |      lab-api       |
                     |      Port 3000     |
                     +--------------------+
                          |           |
                          |           |
                          v           v
                 +-------------+  +-------------+
                 | PostgreSQL  |  |    Redis    |
                 | lab-postgres|  |  lab-redis  |
                 |   Port 5432 |  |   Port 6379 |
                 +-------------+  +-------------+
```

All application containers communicate over the user-defined Docker network `infra-lab-net`.

Nginx is exposed to the host on port `8080`. The API may also have a host port mapping from earlier testing; the intended final architecture is to expose the application through Nginx only.

## Project Structure

The relevant project files are organized as follows:

```text
docker-infrastructure-lab/
├── README.md
├── app/
│   ├── Dockerfile
│   ├── package.json
│   ├── package-lock.json
│   └── server.js
└── nginx/
    └── default.conf
```

Other files, such as `.prettierrc.json`, `.prettierignore`, and `.vscode/settings.json`, may be present depending on the local formatting setup.

## Prerequisites

The lab was developed and tested with the following tools:

- Ubuntu Linux
- Docker Engine
- Docker CLI
- Docker Compose plugin (installed, but intentionally not used in the initial manual setup)
- Node.js and npm for application development

Check installed versions:

```bash
docker --version
docker compose version
docker info
node --version
npm --version
```

## Docker Network

Create the user-defined bridge network:

```bash
docker network create infra-lab-net
```

Inspect the network:

```bash
docker network ls
docker network inspect infra-lab-net
```

A user-defined bridge network provides:

- Container-to-container communication
- Automatic DNS resolution by container name
- Network isolation from containers outside the network

For example, the API can reach Redis by using `lab-redis` as its hostname, and Nginx can reach the API using `lab-api`.

Connect an existing container to the network when necessary:

```bash
docker network connect infra-lab-net <container-name>
```

## Services

> The commands below reflect the manual, standalone Docker workflow. Check existing containers before creating new ones to avoid name conflicts.

### Redis

Pull the image:

```bash
docker pull redis:alpine
```

Run Redis:

```bash
docker run -d \
  --name lab-redis \
  --network infra-lab-net \
  --restart unless-stopped \
  redis:alpine
```

Check the container and logs:

```bash
docker ps
docker logs lab-redis
```

Check Redis from inside the container:

```bash
docker exec lab-redis redis-cli ping
```

Expected response:

```text
PONG
```

The API connects to Redis through the Docker network, using the container name as the hostname:

```text
redis://lab-redis:6379
```

### PostgreSQL

Pull the image:

```bash
docker pull postgres:16-alpine
```

Create a named volume for persistent database files:

```bash
docker volume create lab-postgres-data
```

Run PostgreSQL:

```bash
docker run -d \
  --name lab-postgres \
  --network infra-lab-net \
  -e POSTGRES_DB=db_test \
  -e POSTGRES_USER=db_user \
  -e POSTGRES_PASSWORD=labpass \
  -v lab-postgres-data:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16-alpine
```

**Important:** `labpass` is a lab-only example password. Do not use it in production. Use a secure secret-management approach for real deployments.

Check container status and logs:

```bash
docker ps
docker logs lab-postgres
```

Check database readiness:

```bash
docker exec lab-postgres pg_isready -U db_user -d db_test
```

Open a PostgreSQL shell:

```bash
docker exec -it lab-postgres psql -U db_user -d db_test
```

Useful SQL commands:

```sql
SELECT version();
SELECT current_database();
SELECT current_user;
\l
\dt
\q
```

The database is intended to be accessed by the API over `infra-lab-net`; a host port mapping is not required for this setup.

### Node.js API

The API is located in the `app/` directory and uses:

- Node.js built-in `http` module
- `pg` for PostgreSQL connectivity
- `redis` for Redis connectivity

The API provides these endpoints:

| Endpoint | Purpose |
|---|---|
| `/health` | Basic application health response |
| `/db` | Runs a query against PostgreSQL |
| `/cache` | Writes and reads a test value in Redis |
| `/` | Returns basic application information |

The application reads its configuration from environment variables. The relevant values used in this lab are:

| Variable | Example value | Purpose |
|---|---|---|
| `PORT` | `3000` | API listening port |
| `DB_HOST` | `lab-postgres` or `postgres` | PostgreSQL hostname; must match the actual container/network alias |
| `DB_NAME` | `db_test` | Database name |
| `DB_USER` | `db_user` | Database username |
| `DB_PASSWORD` | Lab-specific secret | Database password |
| `REDIS_HOST` | `lab-redis` | Redis hostname |

Make sure `DB_HOST` matches the PostgreSQL container name or its network alias. The API and database must share a Docker network.

Build the API image from the application directory (adjust the image tag to match the version you are building):

```bash
docker build -t infrastructure-api:v2 ./app
```

Run the API on the Docker network:

```bash
docker run -d \
  --name lab-api \
  --network infra-lab-net \
  -e PORT=3000 \
  -e DB_HOST=lab-postgres \
  -e DB_NAME=db_test \
  -e DB_USER=db_user \
  -e DB_PASSWORD=labpass \
  -e REDIS_HOST=lab-redis \
  -p 3000:3000 \
  --restart unless-stopped \
  infrastructure-api:v2
```

The `-p 3000:3000` mapping is useful for direct host-side testing. In the intended final reverse-proxy-only setup, recreate the API container without this host port mapping so external requests enter through Nginx.

Check the API:

```bash
docker ps
docker logs lab-api
docker inspect lab-api
```

### Nginx

Nginx acts as a reverse proxy. It accepts HTTP requests from the host and forwards them to the API over the Docker network.

The Nginx configuration is stored at:

```text
nginx/default.conf
```

Example configuration:

```nginx
server {
    listen 80;

    server_name _;

    location / {
        proxy_pass http://lab-api:3000;

        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

The upstream uses `lab-api`, not a hard-coded container IP. Docker's embedded DNS resolves the container name on the shared user-defined network.

Pull the image:

```bash
docker pull nginx:alpine
```

Validate the configuration syntax:

```bash
docker run --rm \
  --mount type=bind,source="$(pwd)/nginx/default.conf",target=/etc/nginx/conf.d/default.conf,readonly \
  nginx:alpine nginx -t
```

This command checks Nginx configuration syntax. It does not, by itself, guarantee that the API hostname can be resolved: the temporary validation container is not attached to `infra-lab-net`.

Run Nginx:

```bash
docker run -d \
  --name lab-nginx \
  --network infra-lab-net \
  -p 8080:80 \
  --mount type=bind,source="$(pwd)/nginx/default.conf",target=/etc/nginx/conf.d/default.conf,readonly \
  --restart unless-stopped \
  nginx:alpine
```

Check Nginx:

```bash
docker ps
docker logs lab-nginx
docker exec lab-nginx nginx -t
docker exec lab-nginx nginx -T
docker exec lab-nginx getent hosts lab-api
```

`nginx -t` validates the active configuration. `nginx -T` prints the full configuration loaded by Nginx.

## Useful Docker Commands

### Containers

```bash
docker ps
docker ps -a
docker run
docker start <container-name>
docker stop <container-name>
docker restart <container-name>
docker rm <container-name>
docker rm -f <container-name>
docker inspect <container-name>
docker logs <container-name>
docker logs -f <container-name>
docker logs --tail 100 <container-name>
docker exec -it <container-name> sh
docker top <container-name>
docker stats
```

### Images

```bash
docker images
docker pull <image>
docker build -t <image-name>:<tag> <build-context>
docker image inspect <image>
docker image history <image>
docker rmi <image>
```

### Networks

```bash
docker network ls
docker network inspect infra-lab-net
docker network create <network-name>
docker network connect <network-name> <container-name>
docker network disconnect <network-name> <container-name>
docker network rm <network-name>
```

### Volumes

```bash
docker volume ls
docker volume inspect lab-postgres-data
docker volume create <volume-name>
docker volume rm <volume-name>
```

Do not remove a volume containing data you need. Removing a database container does not normally remove its separately managed named volume.

### Resource and Runtime Inspection

```bash
docker stats
docker inspect <container-name>
docker top <container-name>
docker info
docker events
```

These commands help inspect resource usage, container configuration, running processes, daemon configuration, and Docker events.

## Verification and Testing

Run the following checks after all required containers are up.

### 1. Check container status

```bash
docker ps
```

Confirm that the expected containers are running:

- `lab-nginx`
- `lab-api`
- `lab-redis`
- `lab-postgres`

### 2. Check network membership

```bash
docker network inspect infra-lab-net
```

Confirm that the required containers are listed under the network's `Containers` section.

### 3. Check service readiness

```bash
docker exec lab-redis redis-cli ping
docker exec lab-postgres pg_isready -U db_user -d db_test
docker exec lab-nginx nginx -t
```

### 4. Test through Nginx

Health endpoint:

```bash
curl -i http://127.0.0.1:8080/health
```

Expected response body:

```json
{"status":"ok"}
```

Redis endpoint:

```bash
curl -i http://127.0.0.1:8080/cache
```

Expected response body:

```json
{"cache":"connected","value":"Redis is working"}
```

PostgreSQL endpoint:

```bash
curl -i http://127.0.0.1:8080/db
```

The response should indicate that the database is connected and include the query timestamp.

### 5. Test Docker DNS from Nginx

```bash
docker exec lab-nginx getent hosts lab-api
```

The command should return the API container's IP address on `infra-lab-net`.

## Troubleshooting Notes

### Nginx returns `404 Not Found`

If the response contains:

```text
Server: nginx
404 Not Found
```

check whether Nginx loaded the intended reverse-proxy configuration:

```bash
docker exec lab-nginx nginx -T
```

If the output contains the default document-root configuration, such as:

```nginx
location / {
    root /usr/share/nginx/html;
    index index.html index.htm;
}
```

then the custom `default.conf` was not mounted at the expected path or was not loaded.

Inspect the host file:

```bash
pwd
cat nginx/default.conf
```

Inspect the container mount:

```bash
docker inspect lab-nginx --format '{{json .Mounts}}'
```

### Nginx reports `host not found in upstream "lab-api"`

This usually means the Nginx container cannot resolve the API container name.

Check:

```bash
docker ps -a
docker network inspect infra-lab-net
docker exec lab-nginx getent hosts lab-api
```

Make sure both containers are running and connected to the same user-defined network.

A temporary Nginx container used only for syntax validation is not automatically connected to the application network. Therefore, an upstream DNS resolution error during an isolated `nginx -t` test does not necessarily mean the real Nginx container will have the same problem.

### API is unreachable from outside the container

The Node.js server must listen on all container interfaces:

```javascript
server.listen(PORT, "0.0.0.0");
```

Binding to `localhost` or `127.0.0.1` inside the container makes the service listen only on the container's loopback interface. Other containers and Docker port publishing will not be able to reach it through the container network interface.

### API cannot resolve PostgreSQL

An error such as:

```text
getaddrinfo EAI_AGAIN postgres
```

indicates a hostname-resolution problem. Check the configured `DB_HOST`, the actual PostgreSQL container name or network alias, and network membership:

```bash
docker inspect lab-api
docker inspect lab-postgres
docker network inspect infra-lab-net
```

### Inspect logs

```bash
docker logs --tail 100 lab-api
docker logs --tail 100 lab-nginx
docker logs --tail 100 lab-redis
docker logs --tail 100 lab-postgres
```

## Next Learning Steps

The lab will progress in the following order:

1. Complete and verify each service using standalone Docker commands.
2. Review container-to-container networking and Docker DNS.
3. Explore Docker volumes and database persistence.
4. Practice container health checks, restart policies, resource limits, and operational inspection.
5. Review image tagging and registry workflows.
6. Apply basic container security practices.
7. Recreate the verified architecture using Docker Compose.
8. Compare the manual Docker workflow with the Compose-based workflow.

---

## Important Notes

- This is a learning environment, not a production deployment.
- Do not use example credentials in production.
- Avoid publishing database and cache ports to the host unless there is a specific operational need.
- Prefer service names on a user-defined Docker network over fixed container IP addresses.
- Keep configuration files in version control, but do not commit real passwords, tokens, or other secrets.
- Before deleting Docker volumes, verify whether they contain data that must be retained.
