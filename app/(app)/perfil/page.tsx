import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ProfileView } from "@/features/profile/profile-view";

export const metadata: Metadata = { title: "Perfil" };

export default function Page() {
  return (
    <>
      <PageHeader title="Perfil e configurações" subtitle="Sua foto e seu nome aparecem para as amigas do grupo" />
      <ProfileView />
    </>
  );
}
