# Tommy Grips - Landing Page

Preorder landing page for Tommy Grips — Pressure Point Performance.

## Project Structure

```
tommy-grips/
  public/index.html    — Landing page (static)
  api/subscribe.js     — Vercel serverless function (Mailchimp integration)
  vercel.json          — Vercel routing config
  .env.example         — Environment variables template
```

## Deploy to Vercel

### 1. Push to GitHub
```bash
cd tommy-grips
git init
git add .
git commit -m "Initial launch"
git remote add origin https://github.com/YOUR_USERNAME/tommy-grips.git
git push -u origin main
```

### 2. Connect to Vercel
- Go to https://vercel.com and sign in with GitHub
- Click "New Project" and import the tommy-grips repo
- Before deploying, add environment variables:

### 3. Set Environment Variables (IMPORTANT)
In Vercel Dashboard > Settings > Environment Variables, add:
- `MAILCHIMP_API_KEY` = your Mailchimp API key
- `MAILCHIMP_AUDIENCE_ID` = your Mailchimp audience ID

### 4. Connect Custom Domain
- In Vercel Dashboard > Settings > Domains
- Add `daltongangracing.com`
- Vercel will give you DNS records to add at your domain registrar
- Point your domain's nameservers or add the CNAME/A records as instructed

### 5. Mailchimp Setup
Before launch, add these merge fields in Mailchimp (Audience > Settings > Merge fields):
- PHONE (Phone Number)
- MMERGE6 (Size)
- MMERGE7 (Color)
- MMERGE8 (Quantity)
- MMERGE9 (Total)

Then set up a welcome email automation:
- Go to Automations > Create Automation
- Trigger: "When someone subscribes to audience"
- Design your welcome email confirming their preorder

### 6. Google Analytics (Optional)
- Create a GA4 property at https://analytics.google.com
- Uncomment the GA script block in index.html
- Replace `GA_MEASUREMENT_ID` with your actual measurement ID

## QR Code
Once the site is live at daltongangracing.com, generate a QR code pointing to:
`https://daltongangracing.com?utm_source=qr&utm_medium=print&utm_campaign=race`

This UTM-tagged URL will let you track QR code scans separately in Google Analytics.

## IMPORTANT: API Key Security
Never commit your actual API key to GitHub. Always use environment variables through Vercel's dashboard. After deployment, regenerate your Mailchimp API key if it was ever shared in plain text.
