import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { bscTestnet } from "wagmi/chains";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

// getDefaultConfig throws synchronously without a real WalletConnect Cloud projectId, which
// would otherwise crash the whole app during local dev before one is configured. Fall back to a
// placeholder so the rest of the UI stays usable — WalletConnect's mobile QR flow just won't
// work until a real id is set in apps/frontend/.env.local.
if (!projectId) {
  console.warn(
    "[wagmiConfig] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set — get a free one at " +
      "https://cloud.walletconnect.com and add it to apps/frontend/.env.local. The WalletConnect " +
      "QR flow will not work until then.",
  );
}

export const wagmiConfig = getDefaultConfig({
  appName: "BuildNowBetter",
  projectId: projectId || "00000000000000000000000000000000",
  chains: [bscTestnet],
  ssr: true,
});
