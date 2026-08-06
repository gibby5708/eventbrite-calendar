# GitHub Pages Eventbrite Calendar

This is the mobile-safe GitHub version of the calendar.

## How it works

- GitHub Actions uses your private Eventbrite token from GitHub Secrets.
- It fetches your live/current/future Eventbrite events.
- It saves the public event data into `events.json`.
- GitHub Pages hosts `index.html`.
- GoHighLevel embeds the GitHub Pages calendar URL in an iframe.

Your Eventbrite token is never placed in GoHighLevel or public website code.

## GitHub setup

1. Create a new GitHub repository.
2. Upload everything inside this `github-pages` folder.
3. In GitHub, go to **Settings > Secrets and variables > Actions**.
4. Add a repository secret:

   - Name: `EVENTBRITE_TOKEN`
   - Secret: your Eventbrite private token

5. Optional: add this secret only if needed:

   - Name: `EVENTBRITE_ORGANIZATION_ID`
   - Secret: your Eventbrite organization ID

   If you do not add it, the script auto-detects the first Eventbrite organization available to the token.

6. Go to **Settings > Pages**.
7. Set **Build and deployment** source to **GitHub Actions**.
8. Go to the **Actions** tab.
9. Run **Update Eventbrite events and deploy calendar** manually once.

After the first successful run, GitHub will give you a Pages URL.

## GoHighLevel code

After GitHub Pages is live, paste this into GoHighLevel and replace the URL with your GitHub Pages URL:

```html
<iframe
  src="https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPOSITORY-NAME/"
  title="iNET Media & Events Calendar"
  style="width: 100%; min-height: 900px; border: 0; display: block;"
  loading="lazy"
></iframe>
```

## Auto updates

The GitHub Action checks Eventbrite on a schedule and republishes the calendar. It can also be run manually from the Actions tab whenever you want an immediate update.
