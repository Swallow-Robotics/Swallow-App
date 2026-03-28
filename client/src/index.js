import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { Ion } from 'cesium';
import { configureMaplibreWorker } from './utils/maplibreWorker';

if (process.env.REACT_APP_CESIUM_ION_TOKEN) {
  Ion.defaultAccessToken = process.env.REACT_APP_CESIUM_ION_TOKEN;
}

configureMaplibreWorker();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${process.env.PUBLIC_URL}/tile-cache-sw.js`)
      .catch(() => {});
  });
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
