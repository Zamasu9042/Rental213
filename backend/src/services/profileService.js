import { HttpError } from "../lib/errors.js";

export function createProfileService(store) {
  function getPublicProfile(userId) {
    const profile = store.profiles.find((item) => item.id === userId);
    if (!profile) {
      throw new HttpError(404, "Profile not found.");
    }
    return {
      userId: profile.id,
      fullName: profile.fullName,
      phone: profile.phone,
      role: profile.role
    };
  }

  return {
    getPublicProfile
  };
}
