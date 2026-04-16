import { createWeb3Modal } from '@web3modal/wagmi/react';
import { defaultWagmiConfig } from '@web3modal/wagmi/react/config';
import { WagmiProvider, useAccount, useDisconnect } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { useUpsertUser, useGetMe } from '@workspace/api-client-react';

const projectId = 'b56e18a13c9a1b59cf6f6ee2765e3591';

const metadata = {
  name: 'Web3Hub',
  description: 'Web3 Project Demand Publishing Platform',
  url: 'https://web3hub.com',
  icons: ['https://avatars.githubusercontent.com/u/37784886']
};

const chains = [mainnet, sepolia] as const;
export const config = defaultWagmiConfig({
  chains,
  projectId,
  metadata,
});

createWeb3Modal({
  wagmiConfig: config,
  projectId,
  enableAnalytics: true,
  enableOnramp: true,
  themeMode: 'light',
  themeVariables: {
    '--w3m-accent': '#FF69B4',
    '--w3m-border-radius-master': '1px'
  },
  featuredWalletIds: [
    'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
    '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b6c7107bd4c6b44cc95b1a11', // Trust Wallet
    'a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393', // Phantom
    '971e689d0a5be527bac79629b4ee9b925e82208e5168b733496a09c0faed0709', // OKX Wallet
    'fd20dc426fb37566d803205b19bbc1d4096b248ac04548695',                 // Coinbase Wallet
    '7674bb4e353bf52886768a3ddc2a4562ce2f4191c80831291218ebd90f5f5e26', // Rabby Wallet
  ],
});

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AuthWrapper>
          {children}
        </AuthWrapper>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

// Wrapper to sync wagmi state with our backend User state
function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const upsertMutation = useUpsertUser();
  
  useEffect(() => {
    if (isConnected && address) {
      upsertMutation.mutate({ data: { wallet: address } });
    }
  }, [address, isConnected]);

  return <>{children}</>;
}

export function useWeb3Auth() {
  const { address, isConnected, connector } = useAccount();
  const { disconnect } = useDisconnect();
  
  // Fetch full user profile from backend if connected
  const { data: user, isLoading } = useGetMe(
    { wallet: address as string }, 
    { query: { enabled: !!address && isConnected, retry: false } }
  );

  const handleDisconnect = () => {
    disconnect({ connector });
    // Clear any WalletConnect / wagmi residual storage
    try {
      Object.keys(localStorage).forEach((key) => {
        if (
          key.startsWith("wc@") ||
          key.startsWith("wagmi") ||
          key.startsWith("W3M") ||
          key.startsWith("@w3m")
        ) {
          localStorage.removeItem(key);
        }
      });
    } catch { /* ignore */ }
  };

  return {
    address,
    isConnected,
    user,
    isLoading,
    disconnect: handleDisconnect,
  };
}
