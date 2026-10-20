"use client";

import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// Formulaires d'inscription et de connexion hors du JavaScript initial de chaque page :
// chargés à la première ouverture de la modale.
const AuthGateDialog = lazy(() => import("@/components/auth/auth-gate-dialog"));

export type GateReason = "download" | "favorite" | "publish" | "report" | "comment";

export type GateState = { reason: GateReason; redirectTo: string; tab: "signUp" | "signIn" };

type AuthGate = {
  signedIn: boolean;
  /** Ouvre la modale visiteur ; après inscription ou connexion, retour sur `redirectTo`. */
  open: (reason: GateReason, redirectTo: string) => void;
};

const AuthGateContext = createContext<AuthGate>({ signedIn: false, open: () => {} });

export const useAuthGate = () => useContext(AuthGateContext);

/**
 * Modale visiteur (planche Connexion) partagée par toute l'application : téléchargement,
 * favoris, publication, signalement, commentaire. Focus piégé et Échap gérés par Radix Dialog.
 */
export function AuthGateProvider({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: ReactNode;
}) {
  const [state, setState] = useState<GateState | null>(null);
  // Une fois chargée, la modale reste montée (animation de fermeture, réouverture immédiate).
  const [loaded, setLoaded] = useState(false);
  const open = useCallback((reason: GateReason, redirectTo: string) => {
    setLoaded(true);
    setState({ reason, redirectTo, tab: "signUp" });
  }, []);
  const value = useMemo(() => ({ signedIn, open }), [signedIn, open]);
  return (
    <AuthGateContext.Provider value={value}>
      {children}
      {/* Fermée d'elle-même dès que la session existe (retour après redirection). */}
      {loaded && (
        <Suspense fallback={null}>
          <AuthGateDialog
            state={signedIn ? null : state}
            onTab={(tab) => setState((current) => current && { ...current, tab })}
            onClose={() => setState(null)}
          />
        </Suspense>
      )}
    </AuthGateContext.Provider>
  );
}
