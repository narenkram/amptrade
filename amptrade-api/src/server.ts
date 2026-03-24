import dotenv from "dotenv";
import path from "path";

// Load environment variables before any other imports
const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

// Now we can import other modules that depend on environment variables
import express from "express";
import cors from "cors";
import { StoredCredentials } from "./types/types";
// Unified NorenAPI broker routes
import { NOREN_BROKERS } from "./config/norenBrokerConfig";
import { createNorenBrokerRouter } from "./routes/norenBrokerRoutes";
// Non-NorenAPI broker routes (different API architecture)
import zerodhaRouter from "./routes/zerodha";
import upstoxRouter from "./routes/upstox";
// Other routes
import instrumentsRouter from "./routes/instruments/index";
import healthRouter from "./routes/health";

const app = express();
const port = process.env.PORT;
const frontendUrl = process.env.FRONTEND_URL;

// Create a shared credentials object with user-specific storage
const storedCredentials: StoredCredentials = {};

// Move CORS middleware to the very top of middleware chain
app.use(
  cors({
    origin: frontendUrl,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Health endpoint with custom secret for admin
app.use("/health", healthRouter);

// No authentication middleware – AmpTrade is free and open

// Protected routes - NorenAPI brokers (configuration-driven)
for (const [brokerId, config] of Object.entries(NOREN_BROKERS)) {
  app.use(`/${brokerId}`, createNorenBrokerRouter(config, storedCredentials));
}

// Protected routes - Non-NorenAPI brokers (different API architecture)
app.use("/zerodha", zerodhaRouter(storedCredentials));
app.use("/Zerodha", zerodhaRouter(storedCredentials)); // Capitalized for broker.type compatibility
app.use("/upstox", upstoxRouter(storedCredentials));
app.use("/Upstox", upstoxRouter(storedCredentials)); // Capitalized for broker.type compatibility

// Other protected routes
app.use("/instruments", instrumentsRouter());

// Start server with error handling
const startServer = () => {
  try {
    app.listen(port, () => {
      console.log(
        `Server is running on port ${port} in ${process.env.NODE_ENV || "development"
        } mode`
      );
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Add debug logging
console.log("Environment variables loaded:", {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  FRONTEND_URL: process.env.FRONTEND_URL,
});

startServer();
