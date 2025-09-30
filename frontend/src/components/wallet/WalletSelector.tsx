"use client";

import {
  APTOS_CONNECT_ACCOUNT_URL,
  AboutAptosConnect,
  AboutAptosConnectEducationScreen,
  AdapterNotDetectedWallet,
  AdapterWallet,
  WalletItem,
  WalletSortingOptions,
  groupAndSortWallets,
  isAptosConnectWallet,
  isInstallRequired,
  truncateAddress,
  useWallet,
} from "@aptos-labs/wallet-adapter-react";
import { ArrowLeft, ArrowRight, ChevronDown, Copy, LogOut, User } from "lucide-react";
import { useCallback, useState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function WalletSelector(walletSortingOptions: WalletSortingOptions) {
  const { account, connected, disconnect, wallet } = useWallet();

  function addrToString(a: unknown) {
    if (!a) return "";
    if (typeof a === "string") return a;
    const s = (a as any)?.toString?.();
    return typeof s === "string" ? s : "";
  }

  const addr = addrToString(account?.address);
  const label = account?.ansName ?? (addr ? truncateAddress(addr) : "Connect Wallet");

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Allow opening this dialog from anywhere (e.g., panels) via a global event
  // `window.dispatchEvent(new Event('open-wallet-selector'))`
  useEffect(() => {
    const h = () => setIsDialogOpen(true);
    window.addEventListener("open-wallet-selector", h);
    return () => window.removeEventListener("open-wallet-selector", h);
  }, []);

  const closeDialog = useCallback(() => setIsDialogOpen(false), []);

  const copyAddress = useCallback(async () => {
    const safe = addrToString(account?.address);
    if (!safe) return;
    try {
      await navigator.clipboard.writeText(safe);
      toast.success("Copied wallet address");
    } catch {
      toast.error("Failed to copy wallet address");
    }
  }, [account?.address]);

  return connected ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="cursor-pointer">
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={copyAddress} className="gap-2 cursor-pointer">
          <Copy className="h-4 w-4" /> Copy address
        </DropdownMenuItem>
        {wallet && isAptosConnectWallet(wallet) && (
          <DropdownMenuItem asChild>
            <a
              href={APTOS_CONNECT_ACCOUNT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-2 cursor-pointer hover:underline"
            >
              <User className="h-4 w-4" /> Account
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={disconnect} className="gap-2 text-red-600 focus:text-red-600 cursor-pointer">
          <LogOut className="h-4 w-4" /> Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="cursor-pointer"
        >
          Connect a Wallet
        </Button>
      </DialogTrigger>
      <ConnectWalletDialog close={closeDialog} {...walletSortingOptions} />
    </Dialog>
  );
}

interface ConnectWalletDialogProps extends WalletSortingOptions {
  close: () => void;
}

function ConnectWalletDialog({ close, ...walletSortingOptions }: ConnectWalletDialogProps) {
  const { wallets = [], notDetectedWallets = [] } = useWallet();
  const { aptosConnectWallets, availableWallets, installableWallets } =
    groupAndSortWallets([...wallets, ...notDetectedWallets], walletSortingOptions);

  const hasAptosConnectWallets = !!aptosConnectWallets.length;

  return (
    <DialogContent className="max-h-screen overflow-auto">
      <AboutAptosConnect renderEducationScreen={renderEducationScreen}>
        <DialogHeader>
          <DialogTitle className="flex flex-col text-center leading-snug">
            {hasAptosConnectWallets ? (
              <>
                <span>Log in or sign up</span>
                <span>with Social + Aptos Connect</span>
              </>
            ) : (
              "Connect Wallet"
            )}
          </DialogTitle>
        </DialogHeader>

        {hasAptosConnectWallets && (
          <div className="flex flex-col gap-2 pt-3">
            {aptosConnectWallets.map((wallet) => (
              <AptosConnectWalletRow key={wallet.name} wallet={wallet} onConnect={close} />
            ))}
            <p className="flex gap-1 justify-center items-center text-muted-foreground text-sm">
              Learn more about{" "}
              <AboutAptosConnect.Trigger className="flex gap-1 py-3 items-center text-foreground cursor-pointer hover:underline">
                Aptos Connect <ArrowRight size={16} />
              </AboutAptosConnect.Trigger>
            </p>
            {/* Disclaimer + Powered by */}
            <div className="flex flex-col items-center py-1">
              <p className="text-xs leading-5 text-muted-foreground">
                By continuing, you agree to Aptos Labs’ Privacy Policy.
              </p>
              <span className="text-xs leading-5 text-muted-foreground">Powered by Aptos Labs</span>
            </div>
            <div className="flex items-center gap-3 pt-4 text-muted-foreground">
              <div className="h-px w-full bg-secondary" />
              Or
              <div className="h-px w-full bg-secondary" />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 pt-3">
          {availableWallets.map((wallet) => (
            <WalletRow key={wallet.name} wallet={wallet} onConnect={close} />
          ))}
          {!!installableWallets.length && (
            <Collapsible className="flex flex-col gap-3">
              <CollapsibleTrigger asChild>
                <Button size="sm" variant="ghost" className="gap-2">
                  More wallets <ChevronDown />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col gap-3">
                {installableWallets.map((wallet) => (
                  <WalletRow key={wallet.name} wallet={wallet} onConnect={close} />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </AboutAptosConnect>
    </DialogContent>
  );
}

interface WalletRowProps {
  wallet: AdapterWallet | AdapterNotDetectedWallet;
  onConnect?: () => void;
}

function WalletRow({ wallet, onConnect }: WalletRowProps) {
  return (
    <WalletItem
      wallet={wallet}
      onConnect={onConnect}
      className="flex items-center justify-between px-4 py-3 gap-4 border rounded-md cursor-pointer"
    >
      <div className="flex items-center gap-4">
        <WalletItem.Icon className="h-6 w-6" />
        <WalletItem.Name className="text-base font-normal" />
      </div>
      {isInstallRequired(wallet) ? (
        <Button size="sm" variant="ghost" asChild className="cursor-pointer">
          <WalletItem.InstallLink />
        </Button>
      ) : (
        <WalletItem.ConnectButton asChild>
          <Button size="sm" className="cursor-pointer">Connect</Button>
        </WalletItem.ConnectButton>
      )}
    </WalletItem>
  );
}

function AptosConnectWalletRow({ wallet, onConnect }: WalletRowProps) {
  return (
    <WalletItem wallet={wallet} onConnect={onConnect} className="cursor-pointer">
      <WalletItem.ConnectButton asChild>
        <Button
          size="lg"
          variant="outline"
          className="w-full gap-4 cursor-pointer"
        >
          <WalletItem.Icon className="h-5 w-5" />
          <WalletItem.Name className="text-base font-normal" />
        </Button>
      </WalletItem.ConnectButton>
    </WalletItem>
  );
}

function renderEducationScreen(screen: AboutAptosConnectEducationScreen) {
  return (
    <>
      <DialogHeader className="grid grid-cols-[1fr_4fr_1fr] items-center space-y-0">
        <Button variant="ghost" size="icon" onClick={screen.cancel}>
          <ArrowLeft />
        </Button>
        <DialogTitle className="leading-snug text-base text-center">About Aptos Connect</DialogTitle>
      </DialogHeader>

      <div className="flex h-[162px] pb-3 items-end justify-center">
        <screen.Graphic />
      </div>
      <div className="flex flex-col gap-2 text-center pb-4">
        <screen.Title className="text-xl" />
        <screen.Description className="text-sm text-muted-foreground [&>a]:underline [&>a]:underline-offset-4 [&>a]:text-foreground" />
      </div>

      <div className="grid grid-cols-3 items-center">
        <Button size="sm" variant="ghost" onClick={screen.back} className="justify-self-start">
          Back
        </Button>
        <div className="flex items-center gap-2 place-self-center">
          {screen.screenIndicators.map((ScreenIndicator, i) => (
            <ScreenIndicator key={i} className="py-4">
              <div className="h-0.5 w-6 transition-colors bg-muted [[data-active]>&]:bg-foreground" />
            </ScreenIndicator>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={screen.next} className="gap-2 justify-self-end">
          {screen.screenIndex === screen.totalScreens - 1 ? "Finish" : "Next"}
          <ArrowRight size={16} />
        </Button>
      </div>
    </>
  );
}