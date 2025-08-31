import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}



  const isLocal = typeof window !== 'undefined' && window.location.hostname === 'localhost';
  const baseImageUrl = isLocal ? 'http://localhost:3000' : 'https://zk-loans.aichallenge.fun';

  export const evmNetworks = [/*
  {
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
    chainId: 11155111,
    chainName: 'Ethereum Sepolia',
    iconUrls: [`${baseImageUrl}/eth_logo.png`],
    name: 'Sepolia Testnet',
    nativeCurrency: {
      decimals: 18,
      name: 'Sepolia Ether',
      symbol: 'SEP',
      iconUrl: `${baseImageUrl}/eth_logo.png`,
    },
    networkId: 11155111,
    rpcUrls: ['https://eth-sepolia.g.alchemy.com/v2/N3g083ohb92Bs8eNHAlR7'],
    vanityName: 'Ethereum Sepolia',
  },*/
  {
    blockExplorerUrls: ['https://basescan.org'],
    chainId: 8453,
    chainName: 'Base',
    iconUrls: [`${baseImageUrl}/base_logo.svg`],
    name: 'Base Mainnet',
    nativeCurrency: {
      decimals: 18,
      name: 'Ether',
      symbol: 'ETH',
      iconUrl: `${baseImageUrl}/base_logo.svg`,
    },
    networkId: 8453,
    rpcUrls: ['https://mainnet.base.org'],
    vanityName: 'Base',
  },/*
  {
    blockExplorerUrls: ['https://sepolia.basescan.org'],
    chainId: 84532,
    chainName: 'Base Sepolia',
    iconUrls: [`${baseImageUrl}/base_logo.svg`],
    name: 'Base Sepolia Testnet',
    nativeCurrency: {
      decimals: 18,
      name: 'Ether',
      symbol: 'ETH',
      iconUrl: `${baseImageUrl}/base_logo.svg`,
    },
    networkId: 84532,
    rpcUrls: ['https://sepolia.base.org'],
    vanityName: 'Base Sepolia',
  },*/
];


export const tokensToCheckTeleporter = [
  /*
  {
    addr: "0xE69711C55f6E87F4c39321D3aDeCc4C2CAddc471",
    chainId: 11155111,
    blockNumber: 8442172,
    balance: 0,
  },
  {
    addr: "0x92A08a34488Fcc8772Af2269186e015Eca494Baa",
    chainId: 11155420,
    blockNumber: 28421349,
    balance: 0,
  },
  {
    addr: "0x7B4707070b8851F82B5339aaC7F6759d8e737E88",
    chainId: 84532,
    blockNumber: 26438476,
    balance: 0,
  },*/
];


