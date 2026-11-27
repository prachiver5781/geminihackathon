import React from 'react';
import { createRoot } from 'react-dom/client';
import KendraMapAndSplit from './modules/KendraMapAndSplit.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><KendraMapAndSplit /></React.StrictMode>,
);
