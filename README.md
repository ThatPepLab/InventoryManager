# That Pep Lab Inventory Manager

Mobile-friendly private controls for the existing `ThatPepLab/InStock` inventory data.

## Included

- Search by product, strength, or SKU
- One-tap **−1 Sold** and **+1 Restock**
- Custom positive or negative adjustments
- Add and edit inventory items
- **More on the way** with incoming quantity and expected arrival date
- **Receive Shipment** adds incoming stock and clears the incoming tag
- Low-stock, out-of-stock, and incoming filters
- Timestamped adjustment history
- Undo the latest eligible quantity change
- Public-friendly states: **In Stock**, **Only 1 Left**, and **Out of Stock**

The manager writes to the existing `InStock/inventory.json`; optional metadata is added to each item without changing the `product`, `strength`, and `quantity` fields used by Retail and Wholesale.

## Security model

The browser never contains a GitHub write token. A small Cloudflare Worker verifies the manager password and stores the GitHub token as an encrypted secret. The password is held only in the browser session and is removed when **Lock** is tapped.

## One-time API connection

1. Create a Cloudflare Worker and upload the contents of `worker/src/index.js`.
2. Copy `worker/wrangler.toml.example` to `worker/wrangler.toml` if deploying with Wrangler.
3. Create a fine-grained GitHub token limited to `ThatPepLab/InStock` with **Contents: Read and write**.
4. Add encrypted Worker secrets named `GITHUB_TOKEN` and `MANAGER_PASSWORD`.
5. Deploy the Worker.
6. Paste its URL into `config.js` as `window.INVENTORY_API_URL`.

Do not commit either secret to this repository.

## Website

GitHub Actions deploys the manager to GitHub Pages after Pages is configured to use **GitHub Actions** in repository settings.
