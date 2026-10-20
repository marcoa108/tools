# tools

Public, static applications only. The private source and company database remain in the separate, private `marcoa108/network-relationship-mgmt` repository.

## Network Compass

**Public site:** https://marcoa108.github.io/tools/network-compass/

Only these eight assets are copied from the private project's `network-compass/` folder:
`index.html`, `style.css`, `app.js`, `contacts.js`, `company-import.js`,
`message-import.js`, `private-company-loader.js` and `zip-reader.js`.

Company data, user contacts, workspace backups and messages **must not be committed here**. The private-company loader intentionally receives a missing-file response on the public site. Personal data imported through the web app is saved locally in the visitor's browser.

To enable publication once, visit **Settings → Pages → Build and deployment → Source: GitHub Actions**. The `Deploy Network Compass to GitHub Pages` workflow deploys the allowlisted folder on changes to `main`.
