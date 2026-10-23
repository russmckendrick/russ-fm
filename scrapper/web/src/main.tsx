import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { Layout } from './components/Layout'
import { EmptyState } from './components/ui'
import './index.css'
import { JobsProvider } from './lib/jobs'
import { AddPage } from './pages/Add'
import { ArtistPage } from './pages/Artist'
import { ArtistsPage } from './pages/Artists'
import { BoxsetsPage } from './pages/Boxsets'
import { Dashboard } from './pages/Dashboard'
import { DatabasePage } from './pages/Database'
import { HealthPage } from './pages/Health'
import { JobsPage } from './pages/Jobs'
import { LibraryPage } from './pages/Library'
import { ReleasePage } from './pages/Release'
import { ServicesPage } from './pages/Services'
import { ToolsPage } from './pages/Tools'

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
})

const router = createBrowserRouter([
  {
    element: (
      <JobsProvider>
        <Layout />
      </JobsProvider>
    ),
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/library', element: <LibraryPage /> },
      { path: '/release/:slug', element: <ReleasePage /> },
      { path: '/artists', element: <ArtistsPage /> },
      { path: '/artist/:slug', element: <ArtistPage /> },
      { path: '/jobs', element: <JobsPage /> },
      { path: '/jobs/:id', element: <JobsPage /> },
      { path: '/services', element: <ServicesPage /> },
      { path: '/add', element: <AddPage /> },
      { path: '/boxsets', element: <BoxsetsPage /> },
      { path: '/tools/*', element: <ToolsPage /> },
      { path: '/database', element: <DatabasePage /> },
      { path: '/health', element: <HealthPage /> },
      { path: '*', element: <EmptyState title="Page not found" /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
