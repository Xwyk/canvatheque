import { z } from "zod";

// Sans compilation à la volée : Zod sonderait `new Function`, ce que la CSP interdit
// (violation signalée dans la console). Tous les schémas importent `z` d'ici.
z.config({ jitless: true });

export { z };
