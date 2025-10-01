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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

function toAddr(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  const s = (v as any)?.toString?.();
  return typeof s === "string" ? s : "";
}

export function WalletSelector(walletSortingOptions: WalletSortingOptions) {
  const { account, connected, disconnect, wallet } = useWallet();

  // 1) Local, latched address + connected flag to avoid flicker
  const [addrUI, setAddrUI] = useState<string>("");
  const latchedConnected = useRef(false);

  // Normalize adapter’s current address
  const liveAddr = useMemo(() => toAddr((account as any)?.address), [account]);
  const addr = addrUI || liveAddr; // prefer latched if present
  const label = addr ? truncateAddress(addr) : "Connect a Wallet";

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Open from anywhere
  useEffect(() => {
    const h = () => setIsDialogOpen(true);
    window.addEventListener("open-wallet-selector", h);
    return () => window.removeEventListener("open-wallet-selector", h);
  }, []);

  // 2) Sync local state from adapter changes (and latch)
  useEffect(() => {
    if (liveAddr) {
      setAddrUI(liveAddr);
      latchedConnected.current = true;
    }
  }, [liveAddr]);

  // 3) Listen to adapter events to close dialog and latch
  useEffect(() => {
    const adapter = (wallet as any)?.adapter as
      | { on?: (ev: string, fn: (...args: any[]) => void) => void; off?: (ev: string, fn: (...args: any[]) => void) => void }
      | undefined;

    if (!adapter?.on) return;

    const onConnect = () => {
      const a = toAddr((account as any)?.address);
      if (a) setAddrUI(a);
      latchedConnected.current = true;
      setIsDialogOpen(false);
    };

    const onAccountChange = (next?: unknown) => {
      const a = toAddr(next ?? (account as any)?.address);
      if (a) setAddrUI(a);
      latchedConnected.current = true;
      setIsDialogOpen(false);
    };

    const onDisconnect = () => {
      latchedConnected.current = false;
      setAddrUI("");
    };

    adapter.on("connect", onConnect);
    adapter.on("accountChange", onAccountChange);
    adapter.on?.("disconnect", onDisconnect);

    return () => {
      adapter.off?.("connect", onConnect);
      adapter.off?.("accountChange", onAccountChange);
      adapter.off?.("disconnect", onDisconnect);
    };
  }, [wallet, account]);

  // 4) Also close dialog when the adapter’s `connected` flips true (extra safety)
  useEffect(() => {
    if (connected && isDialogOpen) setIsDialogOpen(false);
  }, [connected, isDialogOpen]);

  const copyAddress = useCallback(async () => {
    if (!addr) return;
    try {
      await navigator.clipboard.writeText(addr);
      toast.success("Copied wallet address");
    } catch {
      toast.error("Failed to copy wallet address");
    }
  }, [addr]);

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect();
    } finally {
      // ensure UI clears even if adapter is slow to emit
      latchedConnected.current = false;
      setAddrUI("");
    }
  }, [disconnect]);

  const uiConnected = latchedConnected.current || connected || !!addr;

  return uiConnected ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Re-mount label when addr changes */}
        <Button key={addr || "no-addr"} variant="outline" size="sm" className="cursor-pointer">
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
        <DropdownMenuItem onSelect={handleDisconnect} className="gap-2 text-red-600 focus:text-red-600 cursor-pointer">
          <LogOut className="h-4 w-4" /> Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="cursor-pointer">
          Connect a Wallet
        </Button>
      </DialogTrigger>
      <ConnectWalletDialog close={() => setIsDialogOpen(false)} {...walletSortingOptions} />
    </Dialog>
  );
}

/* ---------- Rest of the file stays the same ---------- */

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
    <WalletItem wallet={wallet} onConnect={onConnect} className="flex items-center justify-between px-4 py-3 gap-4 border rounded-md cursor-pointer">
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
        <Button size="lg" variant="outline" className="w-full gap-4 cursor-pointer">
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
