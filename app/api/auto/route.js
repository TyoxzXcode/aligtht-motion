// api/auto.js (Vercel Serverless Function)
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 1. Ambil domain dari mail.gw (pengganti mail.tm)
    const domainRes = await fetch('https://api.mail.gw/domains');
    const domainData = await domainRes.json();
    if (!domainData['hydra:member'] || domainData['hydra:member'].length === 0) {
        throw new Error('Gagal dapet domain email dari mail.gw');
    }
    const domain = domainData['hydra:member'][0].domain;

    // 2. Bikin email & password random
    const email = Math.random().toString(36).substring(2, 10) + '@' + domain;
    const pass = 'Password123!';

    // 3. Daftar akun email
    const regRes = await fetch('https://api.mail.gw/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: email, password: pass })
    });
    if (!regRes.ok) throw new Error('Gagal bikin email sementara');

    // 4. Login buat dapet token
    const loginRes = await fetch('https://api.mail.gw/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: email, password: pass })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;

    // 5. Minta magic link ke server Alight Motion
    // (Sesuaikan endpoint ini kalau di repo aslinya beda)
    const amRes = await fetch('https://api.alightmotion.com/v1/auth/magic-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AlightMotion/5.0.0'
      },
      body: JSON.stringify({ email: email })
    });

    if (!amRes.ok) throw new Error('Alight Motion nolak kirim link');

    // 6. Polling nunggu email masuk (maks 20x cek, jeda 3 detik)
    let magicLink = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const msgsRes = await fetch('https://api.mail.gw/messages', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const msgs = await msgsRes.json();
      
      if (msgs['hydra:member'] && msgs['hydra:member'].length > 0) {
        const msgId = msgs['hydra:member'][0].id;
        const msgRes = await fetch('https://api.mail.gw/messages/' + msgId, {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const msgData = await msgRes.json();
        const text = msgData.text || (msgData.html && msgData.html[0]) || '';
        const match = text.match(/https:\/\/[^\s"']+oobCode=[^\s"']+/);
        if (match) {
          magicLink = match[0];
          break;
        }
      }
    }

    if (!magicLink) throw new Error('Link verifikasi gak masuk ke email.');

    // 7. Verifikasi link ke Alight Motion buat dapet Premium
    const verifyRes = await fetch('https://api.alightmotion.com/v1/auth/verify-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link: magicLink })
    });
    
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok) throw new Error('Link expired atau udah dipake.');

    // 8. Balikin data sukses ke web lu
    res.status(200).json({ 
        success: true, 
        data: {
            email: email,
            uid: verifyData.uid || '—',
            orderId: verifyData.orderId || '—',
            status: 'PREMIUM ACTIVE',
            validUntil: 'SELAMANYA'
        } 
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
