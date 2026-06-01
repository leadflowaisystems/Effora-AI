import type { Metadata } from "next";
import { StyleguideClient } from "./styleguide-client";

export const metadata: Metadata = {
  title: "Styleguide — Effora AI Design System",
};

export default function StyleguidePage() {
  return <StyleguideClient />;
}
