import type { Metadata } from "next";
import { AuthScreen } from "@/features/auth/auth-screen";

export const metadata: Metadata = { title: "Entrar" };

export default function Page() {
  return <AuthScreen mode="entrar" />;
}
