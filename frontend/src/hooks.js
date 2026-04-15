import { useCallback } from "react";
import { ethers } from "ethers";
import { contractAbi, contractAddress } from "./contract";

export const useWeb3 = () => {
  const getEthereum = useCallback(async () => {
    if (!window.ethereum) {
      throw new Error("MetaMask topilmadi. O'rnatish kerak.");
    }
    if (!contractAddress) {
      throw new Error("Shartnoma manzili topilmadi.");
    }
    return window.ethereum;
  }, []);

  const getContract = useCallback(
    async (withSigner = false) => {
      const ethereum = await getEthereum();
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = withSigner ? await provider.getSigner() : null;
      return new ethers.Contract(
        contractAddress,
        contractAbi,
        withSigner ? signer : provider
      );
    },
    [getEthereum]
  );

  return { getEthereum, getContract };
};

export const formatEther = (wei) => {
  try {
    return ethers.formatEther(wei);
  } catch {
    return "0";
  }
};

export const formatAddress = (address) => {
  if (!address) return "Ulangan emas";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export const formatTimestamp = (timestamp) => {
  return new Date(Number(timestamp) * 1000).toLocaleString("uz-UZ");
};
