import type { ReactNode } from "react"

export function AppFrame({ children }: { readonly children: ReactNode }) {
  return <div className="app-frame">{children}</div>
}
