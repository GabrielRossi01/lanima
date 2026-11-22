import type { Metadata } from "next";
import { HomeView } from "./home-view";

export const metadata: Metadata = { title: "Início" };

export default function Page() {
  return <HomeView />;
}
