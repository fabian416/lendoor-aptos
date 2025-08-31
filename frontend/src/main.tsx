import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { DynamicProvider } from '@/components/providers/DynamicProvider'
import { UserJourneyProvider } from '@/components/providers/UserProvider'
import './index.css'
import App from './App.jsx'

import 'buffer' 
import { VLayerProvider } from './components/providers/VLayerProvider.js'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DynamicProvider>
      <UserJourneyProvider>
        <VLayerProvider>
        <BrowserRouter>
          <Suspense fallback={null}>
            <App />
          </Suspense>
        </BrowserRouter>
        </VLayerProvider>
      </UserJourneyProvider>
    </DynamicProvider>
  </StrictMode>
)