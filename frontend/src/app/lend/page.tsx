// app/lend/page.tsx
"use client";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { Button } from "@/components/ui/button";
import { CreditMarket } from "@/components/CreditMarketLend";

export default function LendPage() {
  const { setShowAuthFlow } = useDynamicContext();

  return (
    <div className="container mx-auto w-full max-w-3xl">
      {/* Interfaz de Lending */}
      <div className="mb-10">
        <CreditMarket />
      </div>
    </div>
  );
}
