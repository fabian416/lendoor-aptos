import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { UserJourneyProvider } from '@/components/providers/UserProvider'
import './index.css'
import App from './App.jsx'

import 'buffer' 
import { WalletProvider } from '@/components/providers/WalletProvider';
import { MoveModuleProvider } from '@/components/providers/MoveModuleProvider.js'
import { Toaster } from 'sonner';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WalletProvider>
      <MoveModuleProvider>
        <UserJourneyProvider>
          <BrowserRouter>
            <Suspense fallback={null}>
              <App />
            </Suspense>
          </BrowserRouter>
        </UserJourneyProvider>
        <Toaster richColors position="top-right" />
      </MoveModuleProvider>
    </WalletProvider>
  </StrictMode>
)