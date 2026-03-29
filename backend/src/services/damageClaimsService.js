import { HttpError } from "../lib/errors.js";
import { makeId } from "../lib/ids.js";

export function createDamageClaimsService(store, rentalService, equipmentService, paymentService) {
  function list() {
    return [...store.claims].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function create({ rentalId, damageType, notes }) {
    if (!damageType) {
      throw new HttpError(400, "damageType is required.");
    }

    const rental = rentalService.getById(rentalId);
    const estimateAmount = 15;

    const claim = {
      id: makeId("claim"),
      rentalId,
      damageType,
      notes: notes || "",
      status: "Verified",
      severity: "medium",
      confidence: 0.88,
      estimateAmount,
      createdAt: new Date().toISOString()
    };

    paymentService.recordDamageClaimPayment({
      rentalId,
      renterId: rental.renterId,
      amount: estimateAmount
    });

    equipmentService.markUnderRepair(rental.equipmentId);
    store.claims.unshift(claim);
    return claim;
  }

  return {
    list,
    create
  };
}
