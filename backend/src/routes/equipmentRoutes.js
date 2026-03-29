import { Router } from "express";

export function createEquipmentRouter(services) {
  const router = Router();

  router.get("/", (req, res) => {
    res.json(services.equipmentService.list());
  });

  return router;
}
