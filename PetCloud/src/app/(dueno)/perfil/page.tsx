import type { Metadata } from "next";

import {
  checkMatchingPetsAction,
  getPendingAccessRequestsAction,
} from "@/features/owner/actions/pet-access-request-actions";
import { ProfileView } from "@/features/owner/components/profile/profile-view";
import {
  listMyPendingPetInvites,
  listMySharedAccess,
} from "@/features/owner/data/owner-queries";

export const metadata: Metadata = { title: "Perfil" };

export default async function PerfilPage() {
  // allSettled: the access-request calls are optional extras. If one of them
  // throws, the page must still render shared access and invitations, which
  // keep their previous behavior (a failure there still fails the page).
  const [sharedAccess, invitaciones, matchingPets, accessRequests] =
    await Promise.allSettled([
      listMySharedAccess(),
      listMyPendingPetInvites(),
      checkMatchingPetsAction(),
      getPendingAccessRequestsAction(),
    ]);

  if (sharedAccess.status === "rejected") throw sharedAccess.reason;
  if (invitaciones.status === "rejected") throw invitaciones.reason;

  const matchingPetsCount =
    matchingPets.status === "fulfilled" && matchingPets.value.success
      ? matchingPets.value.count
      : 0;
  const pendingRequests =
    accessRequests.status === "fulfilled" && accessRequests.value.success
      ? accessRequests.value.requests
      : [];

  return (
    <ProfileView
      sharedAccess={sharedAccess.value}
      invitaciones={invitaciones.value}
      matchingPetsCount={matchingPetsCount}
      accessRequests={pendingRequests}
    />
  );
}
