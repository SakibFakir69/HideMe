# Developer website + `app-ads.txt`

AdMob only verifies ads for an app when the domain listed under **Website** on the
Play Store listing serves `app-ads.txt` from its **root**:

```
https://sakibfakir69.github.io/app-ads.txt
```

This folder is that site. `app-ads.txt` here is the copy AdMob reads; the copies at
the repository root and in `public/` are for other hosts (any Expo web export
serves `public/app-ads.txt` at `/app-ads.txt`).

The line must stay exactly as Google issued it:

```
google.com, pub-6208140455870067, DIRECT, f08c47fec0942fa0
```

## Publishing to GitHub Pages

GitHub Pages for a `<user>.github.io` repository publishes the default branch root
automatically, so a push is all it needs.

1. On GitHub, create a **public** repository named `SakibFakir69.github.io`
   (exactly that name — it becomes the domain root).
2. Publish this folder as that repository's root:

   ```powershell
   # from the repository root
   $site = Join-Path $env:TEMP "hideme-site"
   Remove-Item $site -Recurse -Force -ErrorAction SilentlyContinue
   Copy-Item website $site -Recurse
   cd $site
   git init
   git add .
   git commit -m "site: app-ads.txt for AdMob"
   git branch -M main
   git remote add origin https://github.com/SakibFakir69/SakibFakir69.github.io.git
   git push -u origin main
   ```

   Copying to a temp folder keeps a second `.git` out of this repository.
3. Wait for the first Pages deploy (Actions tab), then confirm:
   `https://sakibfakir69.github.io/app-ads.txt` returns the line above as
   `text/plain`.
4. In Play Console → the app → **Store settings → Store listing → Website**, enter
   `https://sakibfakir69.github.io` (the bare domain, no path, no trailing slash).
5. In AdMob, open **app-ads.txt** for the app and press **Check for updates**.
   Google crawls at most once a day, so allow ~24 hours.

Keep the domain identical to what Play shows: AdMob strips the listed URL to its
domain and fetches `/app-ads.txt` from there. A path such as
`https://sakibfakir69.github.io/HideMe` would still be crawled at the domain root,
which is why the site lives in its own `<user>.github.io` repository.
