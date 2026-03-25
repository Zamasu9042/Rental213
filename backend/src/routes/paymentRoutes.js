import { Router } from "express";

export function createPaymentRouter(services) {
  const router = Router();

  router.get("/unpaid-fees", (req, res) => {
    const renterId = req.query.renterId;
    res.json({
      renterId,
      unpaidFees: services.paymentService.listUnpaidFees(renterId)
    });
  });

  return router;
}
