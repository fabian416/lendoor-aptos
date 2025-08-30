// app/lend/page.tsx
"use client";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { Button } from "@/components/ui/button";
import { CreditMarket } from "@/components/borrow/BorrowMarket";

export default function LendPage() {
  const { setShowAuthFlow } = useDynamicContext();

  return (
    <div className="container mx-auto w-full max-w-3xl">
        <CreditMarket />
    </div>
  );
}
