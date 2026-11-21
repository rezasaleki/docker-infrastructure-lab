
#!/usr/bin/env bash
set -euo pipefail

for c in lab-api-1 lab-api-2 lab-api-3; do
  echo "Recreating $c ..."

  # Save existing environment variables
  env_file=$(mktemp)

  docker inspect "$c" \
    --format '{{range .Config.Env}}{{println .}}{{end}}' \
    > "$env_file"

  # Remove old container
  docker rm -f "$c"

  # Recreate container without publishing host ports
  docker run -d \
    --name "$c" \
    --network lab-infra-network \
    --restart unless-stopped \
    --env-file "$env_file" \
    api-infrastructure:v1 \
    npm start

  rm -f "$env_file"

  echo "$c recreated successfully."
done
