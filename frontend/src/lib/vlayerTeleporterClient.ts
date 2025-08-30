import { createVlayerClient } from "@vlayer/sdk";

export const vlayerClient = createVlayerClient({
  url: process.env.VITE_PUBLIC_VLAYER_PROVER_URL!,
  token: process.env.VITE_PUBLIC_VLAYER_API_TOKEN!,
});