import type { ReactNode } from "react";

import "./od-home.css";

type Props = {
  children: ReactNode;
};

/** Section title with the green vertical bar (matches the OD reference). */
export function ODSectionTitle({ children }: Props) {
  return <div className="od-section-title">{children}</div>;
}
