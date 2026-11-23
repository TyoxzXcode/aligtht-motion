// app/api/auto/route.js
import { NextResponse } from 'next/server';
import axios from 'axios';

export const maxDuration = 10; // Batas maksimal Vercel

export async function POST(request) {
  try {
    // 1. Ambil domain dari mail.gw
    const domainRes = await axios.get('https://api.mail.gw/domains');
    const domain = domainRes.data['hydra:member'][0].domain;

    // 2. Bikin email
    const email = Math.random().toString(36).substring(2, 10) + '@' + domain;
    const pass = 'Password123!';

    // 3. Daftar & Login
    await axios.post('https://api.mail.gw/accounts', { address: email, password: pass });
    const loginRes = await axios.post('https://api.mail.gw/token', { address: email, password: pass });
    const token = loginRes.data.token;

    // 4. Kirim magic link ke email
    await axios.post('https://api.alightmotion.com/v1/auth/magic-link', 
      { email: email },
      { headers: { 'Content-Type': 'application/json', 'User-Agent': 'AlightMotion/5.0.0' } }
    );

    // 5. Polling kilat (maksimal 4x cek, jeda 1.5 detik = 6 detik total)
    let magicLink = null;
    for (let i = 0; i < 4; i++) {
      await new Promise(r => setTimeout(r, 1500));
      
      const msgsRes = await axios.get('https://api.mail.gw/messages', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const msgs = msgsRes.data;
      
      if (msgs['hydra:member'] && msgs['hydra:member'].length > 0) {
        const msgId = msgs['hydra:member'][0].id;
        const msgRes = await axios.get('https://api.mail.gw/messages/' + msgId, {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const text = msgRes.data.text || (msgRes.data.html && msgRes.data.html[0]) || '';
        const match = text.match(/https:\/\/[^\s"']+oobCode=[^\s"']+/);
        
        if (match) {
          magicLink = match[0];
          break;
        }
      }
    }

    if (!magicLink) throw new Error('Email lambat masuk, coba klik lagi.');

    // 6. Verifikasi premium
    const verifyRes = await axios.post('https://api.alightmotion.com/v1/auth/verify-link', 
      { link: magicLink },
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    return NextResponse.json({ 
        success: true, 
        data: {
            email: email,
            uid: verifyRes.data.uid || '—',
            orderId: verifyRes.data.orderId || '—',
            status: 'PREMIUM ACTIVE',
            validUntil: 'SELAMANYA'
        } 
    });

  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
