import { createApp } from '@aihu/app/client'
import './components/theme-badge.aihu'

// Boot the SPA. On a `output: 'static'` build the prerendered per-route HTML is
// already in the document; createApp hydrates and ADOPTS it in place rather
// than re-rendering (progressive enhancement).
createApp()
