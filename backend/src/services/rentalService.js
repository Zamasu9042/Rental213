import { HttpError } from "../lib/errors.js";
import { makeId } from "../lib/ids.js";
import { ensureValidWindow, formatWindowLabel } from "../lib/time.js";

export function createRentalService(store, equipmentService, paymentService, profileService, workflowService) {
  function list() {
    return [...store.rentals].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function getById(rentalId) {
    const rental = store.rentals.find((item) => item.id === rentalId);
    if (!rental) {
      throw new HttpError(404, "Rental not found.");
    }
    return rental;
  }

  function create({ renterId, equipmentId, startTime, endTime }) {
    const window = ensureValidWindow(startTime, endTime);
    const equipment = equipmentService.assertRentable(equipmentId);

    paymentService.ensureRenterCanRent(renterId);

    const conflictingRental = equipmentService.hasOverlap(
      equipmentId,
      window.start.toISOString(),
      window.end.toISOString()
    );

    if (conflictingRental) {
      throw new HttpError(
        409,
        `Requested time overlaps with existing rental ${conflictingRental.id} (${formatWindowLabel(
          conflictingRental.startTime,
          conflictingRental.endTime
        )}).`
      );
    }

    const ownerProfile = profileService.getPublicProfile(equipment.ownerId);
    const durationHours = Math.max(
      1,
      Math.ceil((window.end.getTime() - window.start.getTime()) / (1000 * 60 * 60))
    );

    const rental = {
      id: makeId("rent"),
      renterId,
      equipmentId,
      ownerId: equipment.ownerId,
      ownerName: ownerProfile.fullName,
      ownerPhone: ownerProfile.phone,
      startTime: window.start.toISOString(),
      endTime: window.end.toISOString(),
      hourlyRate: equipment.hourlyRate,
      pickupLocation: equipment.location,
      status: "PendingPayment",
      paymentStatus: "Pending",
      createdAt: new Date().toISOString(),
      processNotes: [
        "Owner contact came from UserProfile service, not from the equipment record."
      ]
    };

    const workflow = workflowService.startRentalWorkflow({
      rentalId: rental.id,
      renterId,
      equipmentId
    });

    rental.workflowId = workflow.id;

    const payment = paymentService.recordRentalPayment({
      rentalId: rental.id,
      renterId,
      amount: durationHours * equipment.hourlyRate
    });

    rental.paymentId = payment.id;
    rental.paymentStatus = "Completed";
    rental.status = "Confirmed";
    rental.processNotes.push(
      "Workflow started on the server side, so the browser never calls Camunda directly."
    );
    rental.processNotes.push(
      "Availability was decided by time-window overlap, not only by equipment status."
    );

    store.rentals.unshift(rental);
    return rental;
  }

  function requestReturn(rentalId) {
    const rental = getById(rentalId);
    if (rental.status === "Completed") {
      throw new HttpError(409, "Rental is already completed.");
    }
    rental.status = "PendingInspection";
    workflowService.continueWorkflow(rental.id, "ReturnRequested");
    return rental;
  }

  function completeInspection(rentalId, outcome = "NoDamage") {
    const rental = getById(rentalId);

    if (rental.status !== "PendingInspection") {
      throw new HttpError(409, "Rental must be in PendingInspection before completion.");
    }

    if (outcome === "NoDamage") {
      rental.status = "Completed";
      equipmentService.markAvailableIfHealthy(rental.equipmentId);
      workflowService.continueWorkflow(rental.id, "ReturnCompletedNoDamage");
      return rental;
    }

    rental.status = "Completed";
    workflowService.continueWorkflow(rental.id, "ReturnCompletedNeedsClaim");
    return rental;
  }

  return {
    list,
    getById,
    create,
    requestReturn,
    completeInspection
  };
}
