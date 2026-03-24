# Google OAuth for n8n (Gmail + Google Calendar)

This cannot be fixed from code or this repo alone. Google requires the **exact** redirect URL n8n uses to be registered on the **same** OAuth client whose Client ID and secret are in n8n.

## Local n8n (default port 5678)

1. In n8n, open the credential and copy **OAuth Redirect URL**. It must match:

   `http://localhost:5678/rest/oauth2-credential/callback`

2. In [Google Cloud Console](https://console.cloud.google.com/) go to **APIs & Services** -> **Credentials**.

3. Open the **OAuth 2.0 Client ID** that matches the Client ID pasted in n8n (type **Web application**).

4. Under **Authorized redirect URIs**, click **Add URI** and paste **exactly**:

   `http://localhost:5678/rest/oauth2-credential/callback`

5. **Save**. Wait 1-2 minutes, then retry **Sign in with Google** in n8n.

## Error 400: redirect_uri_mismatch

- **Cause:** The URI in step 4 is missing, wrong, or belongs to a different OAuth client than the one in n8n.
- **Fix:** Same project, same client, exact string (scheme `http`, port `5678`, path `/rest/oauth2-credential/callback`, no trailing slash unless you added one everywhere consistently).

## Same Google project checklist

- **Google Calendar API** enabled (Calendar node).
- **Gmail API** enabled (Gmail node).
- **OAuth consent screen** configured; if app is in **Testing**, add the Google account as a **Test user**.

## n8n Cloud (different host)

If credentials are used on `*.app.n8n.cloud`, the redirect URL in n8n will be **different** (n8n shows it in the credential). Add **that** URL in Google Cloud, not only `localhost`.

## After it works

Treat Client ID and secret as secrets. Rotate if they were ever pasted into chat or committed to git.
