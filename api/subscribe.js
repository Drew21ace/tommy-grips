export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, phone, size, color, quantity, total } = req.body;

  if (!name || !email || !size || !color) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const API_KEY = process.env.MAILCHIMP_API_KEY;
  const AUDIENCE_ID = process.env.MAILCHIMP_AUDIENCE_ID;
  const DC = API_KEY?.split('-')[1] || 'us9';

  if (!API_KEY || !AUDIENCE_ID) {
    console.error('Missing Mailchimp environment variables');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const nameParts = name.trim().split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  try {
    const response = await fetch(
      `https://${DC}.api.mailchimp.com/3.0/lists/${AUDIENCE_ID}/members`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(`anystring:${API_KEY}`).toString('base64')}`,
        },
        body: JSON.stringify({
          email_address: email,
          status: 'subscribed',
          merge_fields: {
            FNAME: firstName,
            LNAME: lastName,
            PHONE: phone || '',
            MMERGE6: size,
            MMERGE7: color,
            MMERGE8: quantity,
            MMERGE9: total,
          },
          tags: ['preorder', 'website'],
        }),
      }
    );

    const data = await response.json();

    if (response.ok) {
      return res.status(200).json({ success: true, message: 'Preorder received!' });
    }

    // Handle "already subscribed"
    if (data.title === 'Member Exists') {
      return res.status(200).json({ success: true, message: 'You\'re already on the list! We\'ll be in touch.' });
    }

    console.error('Mailchimp error:', data);
    return res.status(400).json({ error: data.detail || 'Subscription failed' });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error — please try again' });
  }
}
