import type { ReactNode } from "react";
import { ClassicRouteFrame } from "@/components/ui-variants/classic/RouteFrame";
import { RefactorRouteFrame } from "@/components/ui-variants/refactor/RouteFrame";
import type { UiVariant } from "@/lib/uiVariant";

export function UiVariantFrame({
  variant,
  children,
}: {
  variant: UiVariant;
  children: ReactNode;
}) {
  if (variant === "refactor") {
    return <RefactorRouteFrame>{children}</RefactorRouteFrame>;
  }
  return <ClassicRouteFrame>{children}</ClassicRouteFrame>;
}

