import { HttpError } from "../lib/errors.js";
import { overlaps } from "../lib/time.js";

const blockingRentalStatuses = new Set([
  "Created",
  "PendingPayment",
  "Confirmed",
  "InUse",
  "ReturnRequested",
  "PendingInspection",
  "Late"
]);

export function createEquipmentService(store, profileService) {
  function getById(equipmentId) {
    const equipment = store.equipment.find((item) => item.id === equipmentId);
    if (!equipment) {
      throw new HttpError(404, "Equipment not found.");
    }
    return equipment;
  }

  function getActiveReservations(equipmentId) {
    return store.rentals
      .filter(
        (rental) =>
          rental.equipmentId === equipmentId && blockingRentalStatuses.has(rental.status)
      )
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  }

  function getDerivedStatus(equipmentId) {
    const equipment = getById(equipmentId);
    if (equipment.status === "UnderRepair" || equipment.status === "Unavailable") {
      return equipment.status;
    }

    const now = Date.now();
    const activeNow = getActiveReservations(equipmentId).some((rental) => {
      const start = new Date(rental.startTime).getTime();
      const end = new Date(rental.endTime).getTime();
      return start <= now && end > now;
    });

    return activeNow ? "Rented" : "Available";
  }

  function hasOverlap(equipmentId, startTime, endTime, excludeRentalId = null) {
    return getActiveReservations(equipmentId).find((rental) => {
      if (excludeRentalId && rental.id === excludeRentalId) {
        return false;
      }
      return overlaps(rental.startTime, rental.endTime, startTime, endTime);
    });
  }

  function assertRentable(equipmentId) {
    const equipment = getById(equipmentId);
    if (equipment.status === "UnderRepair" || equipment.status === "Unavailable") {
      throw new HttpError(
        409,
        `Equipment ${equipment.id} cannot be rented because it is ${equipment.status}.`
      );
    }
    return equipment;
  }

  function list() {
    return store.equipment.map((item) => {
      const ownerProfile = profileService.getPublicProfile(item.ownerId);
      const reservations = getActiveReservations(item.id).map((rental) => ({
        rentalId: rental.id,
        startTime: rental.startTime,
        endTime: rental.endTime,
        status: rental.status
      }));

      return {
        ...item,
        status: getDerivedStatus(item.id),
        ownerName: ownerProfile.fullName,
        ownerPhone: ownerProfile.phone,
        reservedWindows: reservations
      };
    });
  }

  function markUnderRepair(equipmentId) {
    const equipment = getById(equipmentId);
    equipment.status = "UnderRepair";
    return equipment;
  }

  function markAvailableIfHealthy(equipmentId) {
    const equipment = getById(equipmentId);
    if (equipment.status !== "UnderRepair" && equipment.status !== "Unavailable") {
      equipment.status = "Available";
    }
    return equipment;
  }

  return {
    getById,
    list,
    hasOverlap,
    assertRentable,
    getDerivedStatus,
    markUnderRepair,
    markAvailableIfHealthy
  };
}
