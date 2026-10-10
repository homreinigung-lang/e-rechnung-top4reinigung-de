import { lazy } from "react";

export const KalkulationAnalytics = lazy(() =>
  import("@/components/KalkulationAnalytics").then((module) => ({
    default: module.KalkulationAnalytics,
  })),
);
