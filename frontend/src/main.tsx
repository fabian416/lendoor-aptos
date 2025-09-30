import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { UserJourneyProvider } from '@/components/providers/UserProvider'
import './index.css'
import App from './App.jsx'

import 'buffer' 
import { WalletProvider } from '@/components/providers/WalletProvider'
import { Toaster } from 'sonner';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WalletProvider>
      <UserJourneyProvider>
        <BrowserRouter>
          <Suspense fallback={null}>
            <App />
          </Suspense>
        </BrowserRouter>
      </UserJourneyProvider>
      <Toaster richColors position="top-right" />
    </WalletProvider>
  </StrictMode>
)