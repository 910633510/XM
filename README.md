# XM LLC Website

A static English product website at https://www.xmaillc.com, hosted by GitHub Pages from the root of `main`. No build step or dependencies are required.

The homepage contains the six-app collection, company and support details, and the original legal text inside native disclosures. `products.html` forwards existing visitors to the homepage collection. Each app has a focused detail page; Nine Grid Select has a privacy link only.

## Local preview

```sh
python3 -m http.server 8766 --bind 127.0.0.1
```

Open http://127.0.0.1:8766. Marketing pages use `assets/css/marketing.css`; the homepage also retains the original stylesheet and font for its unchanged legal sections. `assets/js/marketing.js` opens legal disclosures for direct, repeated and history-based anchor navigation. With JavaScript disabled, disclosures remain manually operable.

## Verify before publishing

```sh
python3 scripts/verify-site.py
```

The checker compares all 12 privacy documents, the original homepage privacy/terms blocks, shared styles and VPN download/update resources byte-for-byte against the approved baseline. It also checks local links, fragment targets, the product collection and marketing metadata. Browser verification should cover mobile/tablet/desktop layouts, keyboard navigation, legal deep links, back/forward navigation, and privacy screenshots.

Privacy documents and `assets/css/style.css` are intentionally protected from this marketing redesign. Keep new marketing styles opt-in and out of the original legal content. The VPN page, release links, artwork and `xsimple-appcast.xml` also remain unchanged.

Push reviewed and verified changes to `main` to publish through the existing GitHub Pages configuration. Verify the live homepage, old product address, privacy links, VPN downloads and update feed after deployment.
