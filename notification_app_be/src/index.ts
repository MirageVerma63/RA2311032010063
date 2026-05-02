import express from "express";
import cors from "cors";
import { config } from "./config/config";
import { initAuth } from "./middleware/auth.middleware";
import { Log } from "logging_middleware";
import notificationRoutes from "./routes/notification.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/notifications", notificationRoutes);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

async function startServer() {
  await Log("backend", "info", "service", "Starting notification backend service");

  // get auth token before opening any routes
  await initAuth();

  app.listen(config.port, () => {
    Log("backend", "info", "service", `Server running on port ${config.port}`);
    console.log(`Server up at http://localhost:${config.port}`);
  });
}

startServer();
