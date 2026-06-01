# Meta App Setup Guide

Follow these steps after the Instagram DM integration lands in production.
The integration won't work end-to-end until Meta approves your app (1–3 weeks).
Until then, you can use your own Instagram account for development testing.

---

## Step 1: Create a Meta App

1. Go to https://developers.facebook.com/
2. Click **My Apps → Create App**
3. Choose **Business** as the app type
4. Fill in App Name (e.g. "CoachOS"), Contact Email, Business Account
5. Click **Create App**

---

## Step 2: Add Products

In your new app's dashboard, add these products:

- **Instagram** → click **Set Up** on "Instagram Graph API" + "Instagram Messaging"
- **Webhooks** → click **Set Up**
- **Facebook Login** (needed for OAuth) → click **Set Up**

---

## Step 3: Configure Webhooks

1. Go to **Webhooks** product → **Edit Subscription** for **Page**
2. Set:
   - **Callback URL**: `https://coachos-pi.vercel.app/api/webhooks/meta/instagram`
   - **Verify Token**: _(value from your `META_WEBHOOK_VERIFY_TOKEN` env var)_
3. Click **Verify and Save**
4. Subscribe to these fields:
   - `messages`
   - `messaging_postbacks`
   - `message_reads`

---

## Step 4: Configure Facebook Login (OAuth)

1. Go to **Facebook Login → Settings**
2. Add to **Valid OAuth Redirect URIs**:
   ```
   https://coachos-pi.vercel.app/api/auth/meta/callback
   ```
3. Save changes

---

## Step 5: Get App Credentials

1. Go to **Settings → Basic**
2. Copy **App ID** → set as `META_APP_ID` and `NEXT_PUBLIC_META_APP_ID` in Vercel env vars
3. Click **Show** next to App Secret → copy → set as `META_APP_SECRET`
4. Generate a random verify token:
   ```bash
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```
   Set as `META_WEBHOOK_VERIFY_TOKEN`

---

## Step 6: Submit for App Review

1. Go to **App Review → Permissions and Features**
2. Request these permissions:
   - `pages_show_list` — to list connected Facebook Pages
   - `pages_messaging` — to send/receive messages via Pages
   - `instagram_basic` — to read IG account info
   - `instagram_manage_messages` — to manage IG DMs
   - `business_management` — to access Business account info
3. For each permission, provide:
   - **Demo video** showing the integration flow (coach connects IG, receives a DM, CoachOS replies)
   - **Description**: _"CoachOS helps coaches manage Instagram DMs by syncing conversations into a unified inbox. Coaches can reply manually or enable AI-assisted replies in their voice. Requires explicit OAuth consent from each user."_
4. Fill in:
   - **Privacy Policy URL**: `https://coachos-pi.vercel.app/privacy`
   - **Terms of Service URL**: `https://coachos-pi.vercel.app/terms`
5. Submit for review

**Expected wait**: 1–3 weeks.

---

## Step 7: Test in Development Mode

While waiting for approval, switch your app to **Live** mode and test with your own Instagram account only:

1. In Meta Developer Console: toggle **App Mode** from Development → Live
2. Your own Facebook/Instagram account can now connect
3. Go to `https://coachos-pi.vercel.app/org/YOUR_SLUG/settings/channel/instagram`
4. Click **Connect Instagram** and go through OAuth
5. Send yourself a DM from another account to test the webhook

---

## Coach Requirements

For coaches to connect their Instagram:
- Must have an **Instagram Business** account (not Personal)
- The Instagram Business account must be **linked to a Facebook Page**
- Must be an **admin** of that Facebook Page

---

## Token Expiry & Auto-refresh

- Access tokens expire after **60 days**
- CoachOS runs a daily cron at 4 AM that auto-refreshes tokens expiring within 7 days
- If refresh fails (e.g. user revoked access), the integration is flagged in `/settings/channel/instagram`
- Coaches can reconnect at any time by clicking **Connect Instagram** again

---

## Rate Limits

Meta allows **200 messages/second per page** — well above typical coaching volumes.

---

## ManyChat Handoff Endpoint

For coaches using ManyChat to capture leads, the handoff endpoint is:

```
POST https://coachos-pi.vercel.app/api/webhooks/manychat-handoff/{orgId}
```

Coaches find this URL + their webhook token in **Settings → Channels → ManyChat → Guide D**.

Body fields:
```json
{
  "ig_user_id":      "{{subscriber id}}",
  "ig_username":     "{{instagram username}}",
  "name":            "{{full name}}",
  "trigger_keyword": "KEYWORD",
  "initial_message": "{{last input text}}"
}
```
