import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { UserJourneyProvider } from '@/providers/UserJourneyProvider.js'
import { UserProvider } from '@/providers/UserProvider.js'
import './index.css'
import App from './App.jsx'

import 'buffer' 
import { WalletProvider } from '@/providers/WalletProvider.js';
import { MoveModuleProvider } from '@/providers/MoveModuleProvider.js'
import { Toaster } from 'sonner';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <WalletProvider>
        <MoveModuleProvider>
          <UserJourneyProvider>
            <UserProvider>
              <Suspense fallback={null}>
                <App />
              </Suspense>
            </UserProvider>
          </UserJourneyProvider>
          <Toaster richColors position="top-right" />
        </MoveModuleProvider>
      </WalletProvider>
    </BrowserRouter>
  </StrictMode>
)