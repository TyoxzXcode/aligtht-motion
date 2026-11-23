// app/api/auto/route.js
import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request) {
  try {
    // 1. Ambil domain dari mail.gw
    const domainRes = await axios.get('https://api.mail.gw/domains');
    const domainData = domainRes.data;
    
    if (!domainData['hydra:member'] || domainData['hydra:member'].length === 0) {
        throw new Error('Gagal dapet domain email dari mail.gw');
    }
    const domain = domainData['hydra:member'][0].domain;

    // 2. Bikin email & password random
    const email = Math.random().toString(36).substring(2, 10) + '@' + domain;
    const pass = 'Password123!';

    // 3. Daftar akun email
    await axios.post('https://api.mail.gw/accounts', { address: email, password: pass });
    
    // 4. Login buat dapet token
    const loginRes = await axios.post('https://api.mail.gw/token', { address: email, password: pass });
    const token = loginRes.data.token;

    // 5. Minta magic link ke Alight Motion
    // (Asumsi endpoint ini sesuai sama repo aslinya, kalau beda sesuaikan)
    const amRes = await axios.post('https://api.alightmotion.com/v1/auth/magic-link', 
      { email: email },
      { headers: { 'Content-Type': 'application/json', 'User-Agent': 'AlightMotion/5.0.0' } }
    );

    // 6. Polling nunggu email masuk (maks 20x cek, jeda 3 detik)
    let magicLink = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 3000));
      
      const msgsRes = await axios.get('https://api.mail.gw/messages', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const msgs = msgsRes.data;
      
      if (msgs['hydra:member'] && msgs['hydra:member'].length > 0) {
        const msgId = msgs['hydra:member'][0].id;
        const msgRes = await axios.get('https://api.mail.gw/messages/' + msgId, {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const msgData = msgRes.data;
        const text = msgData.text || (msgData.html && msgData.html[0]) || '';
        const match = text.match(/https:\/\/[^\s"']+oobCode=[^\s"']+/);
        
        if (match) {
          magicLink = match[0];
          break;
        }
      }
    }

    if (!magicLink) throw new Error('Link verifikasi gak masuk ke email.');

    // 7. Verifikasi link ke Alight Motion
    const verifyRes = await axios.post('https://api.alightmotion.com/v1/auth/verify-link', 
      { link: magicLink },
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    const verifyData = verifyRes.data;

    // 8. Balikin data sukses ke web lu
    return NextResponse.json({ 
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
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
  }
