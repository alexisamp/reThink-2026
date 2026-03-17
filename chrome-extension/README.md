# reThink Outreach — Chrome Extension

Right-click any LinkedIn profile link → **"Add to reThink Outreach"** to save the contact directly to your reThink outreach log without visiting the profile page.

## Installation (Developer Mode)

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **"Load unpacked"**
4. Select this `chrome-extension/` folder
5. The extension icon will appear in your Chrome toolbar

## Connecting to reThink

1. Open the **reThink** desktop app
2. Go to **Settings** (gear icon or ⌘,)
3. Under **Integrations → Chrome Extension**, click **"Copy connect code"**
4. Click the reThink Outreach extension icon in Chrome
5. Paste the code into the text area and click **Connect**
6. You should see "Connected ✓" — you're ready to go

The connect code encodes your session tokens and expires when your session expires. If the extension stops working, repeat the connection steps to refresh it.

## Usage

1. Go to any LinkedIn page (search results, feed, connections list, etc.)
2. **Right-click** on a person's profile link
3. Select **"Add to reThink Outreach"** from the context menu
4. A notification will confirm the contact was saved

The contact is saved with:
- **Name**: extracted from the LinkedIn page element
- **LinkedIn URL**: cleaned (no tracking params, just `/in/{slug}`)
- **Type**: `networking`
- **Status**: `CONTACTED`
- **Date**: today

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Not connected" notification | Open the popup and re-paste your connect code from reThink Settings |
| "Not a LinkedIn profile URL" | Only works on `/in/` profile links, not company or other pages |
| Name shows as "Unknown" | The extension couldn't parse the name from the page; you can edit it in reThink |
| Menu item doesn't appear | Make sure you're on `linkedin.com` and right-clicking directly on a profile link |

## File Structure

```
chrome-extension/
├── manifest.json   — Extension config (Manifest V3)
├── background.js   — Service worker: context menu + Supabase API calls
├── content.js      — Injected into LinkedIn pages: extracts name from DOM
├── popup.html      — Extension popup UI
├── popup.js        — Popup logic: connect/disconnect
└── README.md       — This file
```
