import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { LicenseGate } from './components/LicenseGate';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

const container = document.getElementById('root');
if (!container) throw new Error('Wurzelelement nicht gefunden');

createRoot(container).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <LicenseGate>
        <App />
      </LicenseGate>
    </QueryClientProvider>
  </React.StrictMode>,
);
