import cors from "cors";
import express from "express";
import { createStore } from "./lib/store.js";
import { HttpError } from "./lib/errors.js";
import { createProfileService } from "./services/profileService.js";
import { createPaymentService } from "./services/paymentService.js";
import { createEquipmentService } from "./services/equipmentService.js";
import { createWorkflowService } from "./services/workflowService.js";
import { createRentalService } from "./services/rentalService.js";
import { createDamageClaimsService } from "./services/damageClaimsService.js";
import { createEquipmentRouter } from "./routes/equipmentRoutes.js";
import { createProfileRouter } from "./routes/profileRoutes.js";
import { createRentalRouter } from "./routes/rentalRoutes.js";
import { createDamageClaimRouter } from "./routes/damageClaimRoutes.js";
import { createPaymentRouter } from "./routes/paymentRoutes.js";

export function createApp() {
  const store = createStore();

  const profileService = createProfileService(store);
  const paymentService = createPaymentService(store);
  const equipmentService = createEquipmentService(store, profileService);
  const workflowService = createWorkflowService(store);
  const rentalService = createRentalService(
    store,
    equipmentService,
    paymentService,
    profileService,
    workflowService
  );
  const damageClaimsService = createDamageClaimsService(
    store,
    rentalService,
    equipmentService,
    paymentService
  );

  const services = {
    profileService,
    paymentService,
    equipmentService,
    workflowService,
    rentalService,
    damageClaimsService
  };

  const app = express();
  app.use(
    cors({
      origin: true,
      credentials: true
    })
  );
  app.use(express.json());

  app.get("/health", (req, res) => {
    res.json({
      ok: true,
      mode: "reference-backend",
      fixes: [
        "Added UserProfile service",
        "Kept Camunda behind backend",
        "Added overlap check by time window"
      ]
    });
  });

  app.get("/api/system/assumptions", (req, res) => {
    res.json({
      assumptions: [
        "This backend is a runnable reference implementation for the three fixes and should be ported into OutSystems services.",
        "Equipment status represents physical readiness; schedule conflicts are enforced by rental time-window overlap.",
        "Camunda is represented by a server-side workflow adapter in mock mode, so the browser never calls workflow endpoints directly.",
        "Data is stored in memory and resets whenever the backend restarts."
      ]
    });
  });

  app.use("/api/equipment", createEquipmentRouter(services));
  app.use("/api/profiles", createProfileRouter(services));
  app.use("/api/rentals", createRentalRouter(services));
  app.use("/api/damage-claims", createDamageClaimRouter(services));
  app.use("/api/payments", createPaymentRouter(services));

  app.use((req, res) => {
    res.status(404).json({
      error: "NotFound",
      message: `No route matched ${req.method} ${req.originalUrl}`
    });
  });

  app.use((error, req, res, next) => {
    if (error instanceof HttpError) {
      return res.status(error.status).json({
        error: error.name,
        message: error.message,
        details: error.details
      });
    }

    console.error(error);
    return res.status(500).json({
      error: "InternalServerError",
      message: "Unexpected server error."
    });
  });

  return app;
}
