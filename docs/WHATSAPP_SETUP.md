# WhatsApp Cloud API Setup Guide

This guide is for coaches who want to connect WhatsApp Business Cloud API to Effora AI for real-time DM syncing and AI auto-replies.

**Free tier:** First 1,000 conversations/month free. After that, ~₹0.40–1.20/conversation.

---

## Step 1: Create a Meta Business Account

Go to [business.facebook.com](https://business.facebook.com) and create a Business Account if you don't have one.

## Step 2: Create a Meta Developer App

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Click **My Apps → Create App**
3. Select **Business** type
4. Fill in app name (e.g. "My Coaching Bot") and contact email
5. In the app dashboard, click **Add a Product → WhatsApp**

## Step 3: Set Up WhatsApp Business Account (WABA)

1. Under **WhatsApp → Getting Started**, click **Create a WhatsApp Business Account**
2. Complete the Meta Business Verification if prompted (requires business documents)
3. Note your **WhatsApp Business Account ID (WABA ID)** — shown in the dashboard

## Step 4: Add a Phone Number

1. Go to **WhatsApp → Phone Numbers → Add phone number**
2. Use a number that is NOT currently active on WhatsApp or WhatsApp Business App
   - If your number is on WhatsApp Personal: back up chats and delete the account first
3. Verify via SMS code
4. Note the **Phone Number ID** — different from the actual phone number

## Step 5: Get Access Tokens

### Temporary token (for testing):
- In **WhatsApp → API Setup**, copy the temporary access token (valid 24h)

### Permanent token (for production):
1. Go to **Business Settings → System Users → Add**
2. Create a System User (type: Admin)
3. Click **Add Assets → Apps → [Your App]** → grant `Full Control`
4. Click **Generate New Token → [Your App]**
5. Select permissions:
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
6. Copy and store the token securely — it's shown only once

## Step 6: Configure Webhook in Meta

1. In your Meta App dashboard, go to **WhatsApp → Configuration → Webhook**
2. Set:
   - **Callback URL:** `https://your-effora-url.vercel.app/api/webhooks/whatsapp`
   - **Verify Token:** Same string as your `META_WEBHOOK_VERIFY_TOKEN` env var
3. Click **Verify and Save**
4. Under **Webhook Fields**, click **Manage** and subscribe to: `messages`

## Step 7: Enter Credentials in Effora AI

1. Go to your Effora AI workspace → **Settings → WhatsApp**
2. Fill in:
   - **WABA ID** (from Step 3)
   - **Phone Number ID** (from Step 4)
   - **Permanent Access Token** (from Step 5)
3. Click **Connect WhatsApp Cloud API**
4. Effora validates the token instantly — you'll see "Connected: +91 XXXXX XXXXX"

## Step 8: Test

Send a message to your WhatsApp Business number from any WhatsApp account. It should appear in your Effora AI inbox within 3 seconds.

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| "Invalid access token" | Generate a new System User token with the correct permissions |
| "Phone number ID not found" | Double-check you copied the Phone Number ID (not the actual phone number) |
| "Webhook verification failed" | Ensure META_WEBHOOK_VERIFY_TOKEN matches exactly |
| Messages not arriving | Check webhook subscription includes `messages` field |

---

## Template Messages (after 24-hour window)

WhatsApp policy: after 24 hours of no reply from a contact, you can only send pre-approved **Message Templates**, not free-form text.

Template management will be available in Effora AI → Settings → WhatsApp → Templates (coming soon).

For now, sequences (dunning, revival) that trigger after 24h will be skipped for WhatsApp leads.

---

Questions? Email [hello@effora.ai](mailto:hello@effora.ai)
