import { Router } from "express";

export function createRentalRouter(services) {
  const router = Router();

  router.get("/", (req, res) => {
    res.json(services.rentalService.list());
  });

  router.post("/", (req, res) => {
    const rental = services.rentalService.create(req.body || {});
    res.status(201).json(rental);
  });

  router.put("/:id/request-return", (req, res) => {
    const rental = services.rentalService.requestReturn(req.params.id);
    res.json(rental);
  });

  router.put("/:id/inspection-complete", (req, res) => {
    const rental = services.rentalService.completeInspection(
      req.params.id,
      req.body?.outcome || "NoDamage"
    );
    res.json(rental);
  });

  return router;
}
