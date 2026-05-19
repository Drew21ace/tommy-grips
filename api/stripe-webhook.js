import Stripe from 'stripe';
import crypto from 'crypto';
import { Resend } from 'resend';

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function mailchimpAuth() {
  const API_KEY = process.env.MAILCHIMP_API_KEY;
  const AUDIENCE_ID = process.env.MAILCHIMP_AUDIENCE_ID;
  if (!API_KEY || !AUDIENCE_ID) return null;
  const DC = API_KEY.split('-')[1] || 'us9';
  return {
    AUDIENCE_ID,
    DC,
    authHeader: `Basic ${Buffer.from(`anystring:${API_KEY}`).toString('base64')}`,
  };
}

function emailHash(email) {
  return crypto.createHash('md5').update(email.toLowerCase()).digest('hex');
}

async function hasPaidTag(email) {
  if (!email) return false;
  const mc = mailchimpAuth();
  if (!mc) return false;
  const hash = emailHash(email);
  try {
    const r = await fetch(
      `https://${mc.DC}.api.mailchimp.com/3.0/lists/${mc.AUDIENCE_ID}/members/${hash}/tags`,
      { headers: { Authorization: mc.authHeader } }
    );
    if (!r.ok) return false;
    const data = await r.json();
    return Array.isArray(data.tags) && data.tags.some(t => t.name === 'paid');
  } catch (err) {
    console.error('Mailchimp tag check error:', err);
    return false;
  }
}

async function updateMailchimpTags(email) {
  if (!email) return;
  const mc = mailchimpAuth();
  if (!mc) return;
  const hash = emailHash(email);
  try {
    const r = await fetch(
      `https://${mc.DC}.api.mailchimp.com/3.0/lists/${mc.AUDIENCE_ID}/members/${hash}/tags`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: mc.authHeader,
        },
        body: JSON.stringify({
          tags: [
            { name: 'preorder', status: 'inactive' },
            { name: 'paid', status: 'active' },
          ],
        }),
      }
    );
    if (!r.ok) {
      const text = await r.text();
      console.error('Mailchimp tag update failed:', r.status, text);
    }
  } catch (err) {
    console.error('Mailchimp tag update error:', err);
  }
}

function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatAddress(details) {
  if (!details) return '—';
  const a = details.address || {};
  const cityLine = [a.city, a.state, a.postal_code].filter(Boolean).join(', ');
  const lines = [details.name, a.line1, a.line2, cityLine, a.country]
    .filter(Boolean)
    .map(escapeHtml);
  return lines.length ? lines.join('<br>') : '—';
}

async function sendOrderEmail({ session, size, color, quantity, email, phone }) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  const ANNA_EMAIL = process.env.ANNA_EMAIL;
  const FROM = process.env.SHOP_FROM_EMAIL || 'orders@daltongangracing.com';
  if (!RESEND_KEY || !ANNA_EMAIL) {
    console.error('Missing RESEND_API_KEY or ANNA_EMAIL — skipping order email');
    return;
  }

  const resend = new Resend(RESEND_KEY);
  const totalDollars = session.amount_total != null
    ? `$${(session.amount_total / 100).toFixed(2)}`
    : '—';
  const shipping = session.shipping_details || session.shipping || null;
  const customer = session.customer_details || {};
  const customerName = shipping?.name || customer.name || '—';

  const cell = 'padding:6px 10px;border:1px solid #ddd;';
  const headCell = `${cell}background:#f9f9f9;`;

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#333;max-width:700px;">
      <p>New paid order — ready to ship.</p>
      <table style="border-collapse:collapse;width:100%;margin:1rem 0;">
        <tr><td style="${headCell}"><strong>Customer</strong></td><td style="${cell}">${escapeHtml(customerName)}</td></tr>
        <tr><td style="${headCell}"><strong>Email</strong></td><td style="${cell}">${escapeHtml(email || '—')}</td></tr>
        <tr><td style="${headCell}"><strong>Phone</strong></td><td style="${cell}">${escapeHtml(phone || '—')}</td></tr>
        <tr><td style="${headCell}"><strong>Ship to</strong></td><td style="${cell}">${formatAddress(shipping)}</td></tr>
        <tr><td style="${headCell}"><strong>Product</strong></td><td style="${cell}">Tommy Grips — ${escapeHtml(size)} / ${escapeHtml(color)}</td></tr>
        <tr><td style="${headCell}"><strong>Quantity</strong></td><td style="${cell}">${escapeHtml(quantity)}</td></tr>
        <tr><td style="${headCell}"><strong>Total paid</strong></td><td style="${cell}"><strong>${totalDollars}</strong></td></tr>
        <tr><td style="${headCell}"><strong>Stripe session</strong></td><td style="${cell}font-family:monospace;font-size:12px;">${escapeHtml(session.id)}</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #eee;">
      <p style="font-size:12px;color:#999;">Tommy Grips — automated order notification</p>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: `Tommy Grips Orders <${FROM}>`,
      to: ANNA_EMAIL,
      subject: `New order to ship — ${size}/${color} ×${quantity}`,
      html,
    });
    if (result?.error) {
      console.error('Resend returned error:', result.error);
    }
  } catch (err) {
    console.error('Resend send error:', err);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  if (!STRIPE_KEY || !WEBHOOK_SECRET) {
    console.error('Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    return res.status(500).end();
  }

  const stripe = new Stripe(STRIPE_KEY);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;
  const email = session.customer_details?.email || session.customer_email || '';
  const phone = session.customer_details?.phone || '';
  const metadata = session.metadata || {};
  const size = metadata.size || '';
  const color = metadata.color || '';
  const quantity = metadata.quantity || '';

  try {
    if (email && (await hasPaidTag(email))) {
      console.log(`Skipping duplicate webhook for ${email} (already paid)`);
      return res.status(200).json({ received: true, skipped: 'already_paid' });
    }

    await updateMailchimpTags(email);
    await sendOrderEmail({ session, size, color, quantity, email, phone });
  } catch (err) {
    console.error('Webhook processing error:', err);
  }

  return res.status(200).json({ received: true });
}
