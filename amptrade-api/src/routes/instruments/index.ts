import express, { Router, Request, Response, NextFunction } from "express";
import norenApiInstrumentsRouter from "./norenApiInstruments";
import kiteConnectApiInstrumentsRouter from "./kiteConnectApiInstruments";
import upstoxApiInstrumentsRouter from "./upstoxApiInstruments";
import { API_ARCHITECTURES } from "../../constants/constants";

/**
 * Instruments Router Module
 * 
 * This module serves as a factory/router that dispatches requests to the appropriate
 * instrument handler based on the broker's API architecture:
 * - NorenAPI - Used by Flattrade, Infinn, Shoonya, Tradesmart, and Zebu
 * - KiteConnectAPI - Used by Zerodha
 * - UpstoxAPI - Used by Upstox
 * 
 * The appropriate handler is selected based on the 'api-architecture' query parameter.
 * The parameter MUST BE explicitly specified:
 * - /instruments?api-architecture=noren-api     // For NorenAPI brokers
 * - /instruments?api-architecture=kite-connect  // For Zerodha
 * - /instruments?api-architecture=upstox-api    // For Upstox
 */

const createRouter = (): Router => {
  const router = express.Router();

  // Main route handler to determine the API architecture
  router.use((req: Request, res: Response, next: NextFunction) => {
    const apiArchitecture = req.query["api-architecture"] as string;

    // Debug logs
    console.log(`Request query parameters:`, req.query);
    console.log(`API architecture value: "${apiArchitecture}"`, typeof apiArchitecture);
    console.log(`Strict equality check kite-connect: ${apiArchitecture === API_ARCHITECTURES.KITE_CONNECT}`);
    console.log(`Strict equality check noren-api: ${apiArchitecture === API_ARCHITECTURES.NOREN_API}`);

    if (!apiArchitecture) {
      res.status(400).json({
        error: "Missing required query parameter: api-architecture",
        validOptions: [API_ARCHITECTURES.NOREN_API, API_ARCHITECTURES.KITE_CONNECT, API_ARCHITECTURES.UPSTOX_API]
      });
      return;
    }

    // Attach the architecture to the request for logging/tracking
    req.app.locals.apiArchitecture = apiArchitecture;

    console.log(`Using ${apiArchitecture} for instruments request`);

    // Forward to appropriate router based on API architecture
    if (apiArchitecture === API_ARCHITECTURES.KITE_CONNECT) {
      console.log("Routing to KiteConnect API instruments handler");
      kiteConnectApiInstrumentsRouter()(req, res, next);
    } else if (apiArchitecture === API_ARCHITECTURES.NOREN_API) {
      console.log("Routing to NorenAPI instruments handler");
      norenApiInstrumentsRouter()(req, res, next);
    } else if (apiArchitecture === API_ARCHITECTURES.UPSTOX_API) {
      console.log("Routing to Upstox API instruments handler");
      upstoxApiInstrumentsRouter()(req, res, next);
    } else {
      // Invalid API architecture specified
      console.log(`Invalid API architecture: "${apiArchitecture}"`);
      res.status(400).json({
        error: "Invalid api-architecture parameter",
        validOptions: [API_ARCHITECTURES.NOREN_API, API_ARCHITECTURES.KITE_CONNECT, API_ARCHITECTURES.UPSTOX_API]
      });
    }
  });

  return router;
};

export default createRouter; 