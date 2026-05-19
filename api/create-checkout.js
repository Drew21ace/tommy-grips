import Stripe from 'stripe';

const ALLOWED_SIZES = ['adult', 'kids'];
const ALLOWED_COLORS = ['red', 'orange', 'yellow', 'blue', 'green', 'pink', 'purple', 'glow'];
const BASE_PRICE_CENTS = 3000;
const GLOW_UPCHARGE_CENTS = 200;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { size, color, quantity } = req.body || {};

  if (!ALLOWED_SIZES.includes(size)) {
    return res.status(400).json({ error: 'Invalid size' });
  }
  if (!ALLOWED_COLORS.includes(color)) {
    return res.status(400).json({ error: 'Invalid color' });
  }

  const qty = parseInt(quantity, 10);
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
    return res.status(400).json({ error: 'Invalid quantity' });
  }

  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_KEY) {
    console.error('Missing STRIPE_SECRET_KEY');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const stripe = new Stripe(STRIPE_KEY);
  const unitPrice = color === 'glow'
    ? BASE_PRICE_CENTS + GLOW_UPCHARGE_CENTS
    : BASE_PRICE_CENTS;

  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = `${protocol}://${host}`;

  const metadata = { size, color, quantity: String(qty) };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Tommy Grips — ${size} / ${color}`,
            },
            unit_amount: unitPrice,
          },
          quantity: qty,
        },
      ],
      metadata,
      payment_intent_data: { metadata },
      shipping_address_collection: { allowed_countries: ['US'] },
      phone_number_collection: { enabled: true },
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/#preorder`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: 'Could not create checkout session' });
  }
}
