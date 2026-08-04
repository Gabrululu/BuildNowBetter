import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { coinbaseWallet, metaMaskWallet, rainbowWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { http } from "viem";
import { createConfig } from "wagmi";
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

// Curated wallet list instead of RainbowKit's getDefaultConfig/getDefaultWallets: their default
// list includes the "Base Account" connector, which pulls in @coinbase/cdp-sdk (Solana + x402
// payment support we never use) and its unresolvable optional @x402/* peer deps — that breaks
// both the webpack and Turbopack dev compilers. coinbaseWallet here is the lightweight classic
// Coinbase Wallet connector, unrelated to that SDK.
const connectors = connectorsForWallets(
  [
    {
      groupName: "Recomendadas",
      wallets: [metaMaskWallet, walletConnectWallet, rainbowWallet, coinbaseWallet],
    },
  ],
  {
    appName: "BuildNowBetter",
    projectId: projectId || "00000000000000000000000000000000",
  },
);

export const wagmiConfig = createConfig({
  connectors,
  chains: [bscTestnet],
  transports: {
    [bscTestnet.id]: http(),
  },
  ssr: true,
});
