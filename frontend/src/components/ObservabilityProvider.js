"use client";

import { useEffect } from "react";
import { initFrontendObservability } from "@/lib/observability";

export default function ObservabilityProvider({ children, configuration }) {
  useEffect(() => initFrontendObservability(configuration), [configuration]);
  return children;
}
