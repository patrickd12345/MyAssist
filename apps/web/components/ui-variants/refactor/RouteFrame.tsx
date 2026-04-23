import type { ReactNode } from "react";

export function RefactorRouteFrame({ children }: { children: ReactNode }) {
  return (
    <div data-ui-variant-shell="refactor" className="ui-variant-refactor-shell">
      {children}
    </div>
  );
}

