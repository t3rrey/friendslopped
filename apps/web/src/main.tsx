import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/lilita-one';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './styles.css';
import './cube.css';
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
