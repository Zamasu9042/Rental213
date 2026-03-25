import { Router } from "express";

export function createDamageClaimRouter(services) {
  const router = Router();

  router.get("/", (req, res) => {
    res.json(services.damageClaimsService.list());
  });

  router.post("/", (req, res) => {
    const claim = services.damageClaimsService.create(req.body || {});
    res.status(201).json(claim);
  });

  return router;
}
