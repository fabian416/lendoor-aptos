import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ArrowRight, Terminal, Database } from "lucide-react"
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen">
      <main className="max-w-3xl mx-auto px-6 relative z-10">
        <section className="py-10 md:py-15 text-center">
          <div className="mb-16">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-primary mono-text mb-6 tracking-tight glitch-effect">
              THE REPUTATION-BASED MONEY MARKET
            </h1>
            <p className="text-lg md:text-xl text-primary mono-text mb-8 tracking-wide">
              EARN BY LENDING. BORROW BANK-FREE ACROSS LATAM.
            </p>

            <Button
              size="lg"
              className="cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-8 py-4 mono-text text-lg tracking-wide border border-primary/50"
            >
               ENTER APP
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>

            <div className="mt-12 grid grid-cols-3 gap-2 max-w-md mx-auto text-xs mono-text">
              <div className="rounded-md border border-primary/20 bg-background/70 px-3 py-2 text-center">
                <div className="text-muted-foreground">Liquidity</div>
                <div className="font-bold text-primary">$50.2M</div>
              </div>
              <div className="rounded-md border border-primary/20 bg-background/70 px-3 py-2 text-center">
                <div className="text-muted-foreground">Lenders APY</div>
                <div className="font-bold">15.2%</div>
              </div>
              <div className="rounded-md border border-primary/20 bg-background/70 px-3 py-2 text-center">
                <div className="text-muted-foreground">Borrowers</div>
                <div className="font-bold">1,284</div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 mb-20">
          <div className="grid md:grid-cols-2 gap-8">

             <Link href="/borrow" className="block group focus:outline-none">
              <Card className="data-card p-8 terminal-hover">
                <div className="flex items-center mb-6">
                  <Database className="w-6 h-6 text-primary mr-3" />
                  <h3 className="text-xl font-bold text-foreground mono-text">BORROWERS</h3>
                </div>
                <p className="text-muted-foreground mono-text mb-6 text-sm leading-relaxed">
                  Access instant credit based on your reputation without traditional collateral requirements.
                </p>
                <div className="space-y-2 text-xs mono-text">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">RATE:</span>
                    <span className="text-terminal-yellow">8.5%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">LIMIT:</span>
                    <span className="text-primary">$500</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SPEED:</span>
                    <span className="text-terminal-green">INSTANT</span>
                  </div>
                </div>
              </Card>
            </Link>

            <Link href="/lend" className="block group focus:outline-none">
              <Card className="data-card p-8 terminal-hover">
                <div className="flex items-center mb-6">
                  <Terminal className="w-6 h-6 text-primary mr-3" />
                  <h3 className="text-xl font-bold text-foreground mono-text">LENDERS</h3>
                </div>
                <p className="text-muted-foreground mono-text mb-6 text-sm leading-relaxed">
                  Supply liquidity to earn competitive yields while powering the future of decentralized credit markets.
                </p>
                <div className="space-y-2 text-xs mono-text">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">APY:</span>
                    <span className="text-terminal-green">15.2%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">TVL:</span>
                    <span className="text-primary">$50.2M</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">STATUS:</span>
                    <span className="text-terminal-green">ACTIVE</span>
                  </div>
                </div>
              </Card>
            </Link>
           
          </div>
        </section>
      </main>
    </div>
  )
}