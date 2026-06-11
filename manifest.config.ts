import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'PageLens',
  description: 'AI-powered page insights, summarization, translation, and note-taking with Feishu integration',
  version: '1.0.0',
  permissions: [
    'sidePanel',
    'activeTab',
    'storage',
    'tabs',
    'scripting',
  ],
  host_permissions: [
    'https://*/*',
    'http://*/*',
  ],
  side_panel: {
    default_path: 'index.html',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      js: ['src/content/index.ts'],
      matches: ['https://*/*', 'http://*/*'],
      run_at: 'document_idle',
    },
  ],
  action: {
    default_icon: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    },
    default_title: 'PageLens',
  },
  icons: {
    '16': 'icons/icon-16.png',
    '32': 'icons/icon-32.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png',
  },
});
