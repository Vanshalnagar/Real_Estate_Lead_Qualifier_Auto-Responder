import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { ChatProvider } from './lib/chat';
import { AccountPage, AuthPage } from './site/pages/Auth';
import { Home } from './site/pages/Home';
import { Listing } from './site/pages/Listing';
import { PropertyDetail } from './site/pages/PropertyDetail';
import { SiteLayout } from './site/SiteLayout';
import './styles/tokens.css';
import './styles/base.css';
import './styles/site.css';
import './styles/enhance.css';
import './styles/auth.css';
import './styles/live.css';

const AdminApp = lazy(() => import('./admin/AdminApp'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<div className="admin-loading">Loading admin…</div>}>
              <AdminApp />
            </Suspense>
          }
        />
        <Route
          element={
            <AuthProvider>
              <ChatProvider>
                <SiteLayout />
              </ChatProvider>
            </AuthProvider>
          }
        >
          <Route index element={<Home />} />
          <Route path="buy" element={<Listing key="buy" mode="buy" />} />
          <Route path="rent" element={<Listing key="rent" mode="rent" />} />
          <Route path="invest" element={<Listing key="invest" mode="invest" />} />
          <Route path="property/:slug" element={<PropertyDetail />} />
          <Route path="login" element={<AuthPage key="login" mode="login" />} />
          <Route path="register" element={<AuthPage key="register" mode="register" />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
