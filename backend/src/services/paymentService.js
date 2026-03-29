import { makeId } from "../lib/ids.js";
import { HttpError } from "../lib/errors.js";

export function createPaymentService(store) {
  function listUnpaidFees(renterId) {
    return store.payments.filter(
      (item) => item.renterId === renterId && item.status === "unpaid"
    );
  }

  function ensureRenterCanRent(renterId) {
    const unpaid = listUnpaidFees(renterId);
    if (unpaid.length > 0) {
      const total = unpaid.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      throw new HttpError(
        409,
        `Renter ${renterId} has outstanding unpaid fees totaling $${total.toFixed(2)}.`
      );
    }
  }

  function recordRentalPayment({ rentalId, renterId, amount }) {
    const payment = {
      id: makeId("pay"),
      renterId,
      rentalId,
      amount,
      type: "rental",
      status: "completed",
      createdAt: new Date().toISOString()
    };
    store.payments.unshift(payment);
    return payment;
  }

  function recordDamageClaimPayment({ rentalId, renterId, amount }) {
    const payment = {
      id: makeId("pay"),
      renterId,
      rentalId,
      amount,
      type: "damage_claim",
      status: "completed",
      createdAt: new Date().toISOString()
    };
    store.payments.unshift(payment);
    return payment;
  }

  return {
    listUnpaidFees,
    ensureRenterCanRent,
    recordRentalPayment,
    recordDamageClaimPayment
  };
}
