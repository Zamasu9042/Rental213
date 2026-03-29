import { Router } from "express";

export function createProfileRouter(services) {
  const router = Router();

  router.get("/:userId", (req, res) => {
    res.json(services.profileService.getPublicProfile(req.params.userId));
  });

  return router;
}
