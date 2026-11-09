import type { Metadata } from "next";
import RulesPage from "../../src/components/RulesPage";

export const metadata: Metadata = {
  title: "Rules | Lorgoshock",
  description: "How to explore, grow companies, and take over the rival in Lorgoshock.",
};

export default function Rules() {
  return <RulesPage />;
}
