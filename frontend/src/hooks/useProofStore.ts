import { create } from 'zustand';

type ProofStore = {
  emailProof: any | null;
  timeTravelProof: any | null;
  teleportProof: any | null;
  identityHash: string | null;
  identityProof: any | null; // ⬅️ nuevo agregado

  setEmailProof: (proof: any) => void;
  setTimeTravelProof: (proof: any) => void;
  setTeleportProof: (proof: any) => void;
  setIdentityHash: (hash: string) => void;
  setIdentityProof: (proof: any) => void; // ⬅️ nuevo setter

  resetAll: () => void;
};

export const useProofStore = create<ProofStore>((set) => ({
  emailProof: null,
  timeTravelProof: null,
  teleportProof: null,
  identityHash: null,
  identityProof: null, // ⬅️ inicializa como null

  setEmailProof: (proof) => set({ emailProof: proof }),
  setTimeTravelProof: (proof) => set({ timeTravelProof: proof }),
  setTeleportProof: (proof) => set({ teleportProof: proof }),
  setIdentityHash: (hash) => set({ identityHash: hash }),
  setIdentityProof: (proof) => set({ identityProof: proof }), // ⬅️ nuevo setter

  resetAll: () =>
    set({
      emailProof: null,
      timeTravelProof: null,
      teleportProof: null,
      identityHash: null,
      identityProof: null, // ⬅️ resetea también
    }),
}));