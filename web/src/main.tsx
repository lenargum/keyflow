import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Home } from './pages/Home.js';
import { OrderStatus } from './pages/OrderStatus.js';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/orders/:id" element={<OrderStatus />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
