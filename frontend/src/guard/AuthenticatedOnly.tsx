import type { ReactNode } from 'react';

interface AuthenticatedOnlyProps {
  authenticated: boolean;
  children: ReactNode;
}

export function AuthenticatedOnly({ authenticated, children }: AuthenticatedOnlyProps) {
  return authenticated ? children : null;
}
