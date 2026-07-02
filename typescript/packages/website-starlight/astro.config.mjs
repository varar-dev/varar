// @ts-check

import starlight from '@astrojs/starlight'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

// https://astro.build/config
export default defineConfig({
  site: 'https://var.oselvar.com',
  integrations: [
    starlight({
      title: 'Vár',
      customCss: [
        './src/styles/tailwind.css',
        './src/styles/custom.css',
        './src/styles/themes/fjord.css',
      ],
      components: {
        ThemeSelect: './src/components/ThemeSelect.astro',
      },
      head: [
        {
          // Apply the stored palette before first paint (Jord is the
          // attribute-less default; only Fjord needs marking).
          tag: 'script',
          content:
            "try{if(localStorage.getItem('var-palette')==='fjord')document.documentElement.dataset.palette='fjord'}catch(e){}",
        },
      ],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/oselvar/var' }],
      sidebar: [
        {
          label: 'Start here',
          items: ['tutorials/try-in-browser', 'tutorials/get-started', 'tutorials/first-spec'],
        },
        {
          label: 'How-to guides',
          items: [
            'how-to/tables-and-doc-strings',
            'how-to/run-with-vitest',
            'how-to/agent-instructions',
            'how-to/drive-a-feature-with-an-agent',
          ],
        },
        {
          label: 'Understanding Vár',
          items: ['explanation/thin-steps', 'explanation/var-for-cucumber-users'],
        },
      ],
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },
})
