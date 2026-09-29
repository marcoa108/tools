# Network Compass

A private, browser-based workspace for exploring LinkedIn connections, understanding communication history, and planning useful engagement. It is a static web app: no server, account, API key, or build step is required.

## Use your own copy

1. Open the hosted app, or run the files locally with a small web server:

   ```sh
   python3 -m http.server 8000
   ```

   Then visit `http://localhost:8000`. Keep `index.html`, `app.js`, and `style.css` together.
2. Export your LinkedIn connections and import `Connections.csv` using **Import connections**. You can start with **Explore sample data** to try the interface first.
3. Optionally export your LinkedIn messages and import `Messages.csv` using **Import messages**. Enter your name or LinkedIn profile URL as it appears in the export so the app can identify your side of conversations.
4. Filter by role, company, connection date, relationship circle, theme, fit, and warmth. Review individual records, save priority groups, and write an objective and next step for each group.
5. Use **Download backup** to save your annotations and communication summaries as JSON. Import that backup to restore this browser workspace or move it to another device.

LinkedIn may change the names and columns of its exports. The app currently expects connection names and message columns including `FROM`, `TO`, `DATE`, and `CONTENT`.

## Communication signals

After importing messages, the app shows outgoing and incoming counts, the latest exchange, recent activity, whether a contact replied, and communication frequency. It excludes unclear and group conversations. A **Vistage** match means an outgoing message contains both `board` and `peer advisory`; a one-phrase match is marked for review. Phrase matches are clues, not a claim about the person's interest or consent.

The raw message bodies are read in memory for analysis and are not saved in the workspace or backup. The backup contains connection information, your annotations, and derived communication summaries; treat it as sensitive.

## Privacy and sharing

The app stores imported data in IndexedDB in the browser that opens it. Its Content Security Policy blocks network connections. This repository contains only application code and fictional sample entries; it contains no LinkedIn export, personal workspace, or Sites hosting configuration. There is no sync between devices or between users, even if they open the same hosted URL. Private browsing or clearing site data can erase the local workspace, so download backups regularly.

Anyone can host this static code, including someone using Claude rather than ChatGPT. For GitHub Pages, open the repository's **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, and save. Then open the `network-compass/` path under the generated Pages URL. Each visitor's imported data still remains in their own browser. The original Sites deployment is separate and remains under its own access settings.

This tool does not send messages, post content, or access LinkedIn automatically. It works from files you choose to import.

## Development

Edit the three files directly. No dependencies or build command are needed. The app uses modern browser APIs such as IndexedDB, `<dialog>`, and `structuredClone`.

## License

MIT. See [LICENSE](LICENSE).
