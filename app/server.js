const http = require("http");
const { Pool } = require("pg");
const { createClient } = require("redis");

const PORT = process.env?.PORT || 3000;

const db = new Pool({
  host: process.env.DB_HOST || "postgres",
  port: 5432,
  database: process.env.DB_NAME || "db_test",
  user: process.env.DB_USER || "db_user",
  password: process.env.DB_PASSWORD,
});

const redis = createClient({
  url: `redis://${process.env.REDIS_HOST || "redis"}:6379`,
});

redis.on("error", (error) => console.log("Redis Error : ", error.message));

async function bootstrap() {
  await redis.connect();

  const server = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");

    try {
      const { url, method } = req;

      if (url === "/health") {
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      if (url === "/db") {
        const result = await db.query("SELECT NOW() as time");
        res.end(
          JSON.stringify({
            database: "connected",
            time: result.rows[0].time,
          }),
        );
        return;
      }

      if (url === "/cache") {
        const key = "docker-cache";
        await redis.set(key, "Redis is working");
        const value = await redis.get(key);

        res.end(
          JSON.stringify({
            cache: "connected",
            value,
          }),
        );
        return;
      }

      res.end(
        JSON.stringify({
          application: "Docker Infrastructure Lab Development !",
          hostname: require("os").hostname(),
          status: "running",
        }),
      );
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: error.message }));
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`API running on port ${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("Application startup failed:", error);
  process.exit(1);
});
