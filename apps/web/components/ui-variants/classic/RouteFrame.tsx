import type { ReactNode } from "react";

export function ClassicRouteFrame({ children }: { children: ReactNode }) {
  return <div data-ui-variant-shell="classic">{children}</div>;
}

