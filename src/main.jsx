import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { formatTabTitle } from './utils/tabTitle.js'

fetch('/api/settings/site/public')
  .then((r) => r.json())
  .then((d) => {
    if (d && typeof d.storeName === 'string' && d.storeName.trim()) {
      document.title = formatTabTitle(d.storeName)
    } else {
      document.title = 'NovaMart'
    }
  })
  .catch(() => {
    document.title = 'NovaMart'
  })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
