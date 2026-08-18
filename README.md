# Masar Payroll Manager — production deployment

The application uses a server-side PostgreSQL connection. Browser storage is only a local cache; authentication and central state are handled by the Node server.

## Prepare the existing PostgreSQL container

Find its Docker network:

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Networks}}'
```

Using the current PostgreSQL administrator, create an isolated login and schema. Never give the app the `postgres` superuser:

```sql
CREATE ROLE masar_app LOGIN PASSWORD 'A_LONG_RANDOM_PASSWORD'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE SCHEMA masar_payroll AUTHORIZATION masar_app;
REVOKE ALL ON SCHEMA masar_payroll FROM PUBLIC;
GRANT CONNECT ON DATABASE your_database TO masar_app;
```

A separate database is preferred. If other programs share the same database, the dedicated `masar_payroll` schema and login isolate this app from their tables.

## Configure and deploy

```bash
cp .env.example .env
chmod 600 .env
docker compose config
docker compose build --pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 masar-app
```

Set `POSTGRES_DOCKER_NETWORK` to the existing network. In `DATABASE_URL`, use the PostgreSQL container/service name—not `localhost`. Set a unique `ADMIN_PASSWORD` of at least 12 characters. Keep `COOKIE_SECURE=true` behind HTTPS.

The web port is intentionally bound only to `127.0.0.1`. Forward the server's existing HTTPS reverse proxy to `http://127.0.0.1:3000`. Never publish PostgreSQL port 5432 to the internet.

### Cloudflare Tunnel

Merge `deploy/cloudflared-config.yml.example` into the existing tunnel configuration, replace the example hostname, then route DNS and restart the tunnel:

```bash
cloudflared tunnel route dns YOUR_TUNNEL_NAME payroll.example.com
sudo systemctl restart cloudflared
sudo systemctl status cloudflared --no-pager
```

## Backup

```bash
docker exec YOUR_POSTGRES_CONTAINER pg_dump -U YOUR_ADMIN -d YOUR_DATABASE -n masar_payroll -Fc > masar-payroll.dump
```

Test restoration periodically. The runtime container is non-root, read-only, capability-free, resource-limited, and protected with `no-new-privileges`. Sessions are random, hashed, HttpOnly, SameSite cookies with a 12-hour expiry. Login and write endpoints are rate-limited.
