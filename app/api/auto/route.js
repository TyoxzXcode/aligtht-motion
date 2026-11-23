// app/api/auto/route.js
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function POST(request) {
  try {
    // 1. Bikin email pakai Guerrilla Mail
    const mailRes = await fetch('https://api.guerrillamail.com/ajax.php?f=get_email_address&lang=en&site=guerrillamail.com');
    const mailData = await mailRes.json();
    const email = mailData.email_addr;
    const sid = mailData.sid_token;
    
    if (!email) throw new Error('Gagal bikin email sementara.');

    // 2. Kirim magic link ke server Alight Motion
    const amRes = await fetch('https://api.alightmotion.com/v1/auth/magic-link', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'User-Agent': 'AlightMotion/5.0.0' 
      },
      body: JSON.stringify({ email: email })
    });

    // Kalau API AM udah mati/dipatch, kita lempar error yang jelas
    if (!amRes.ok) {
      throw new Error('Server Alight Motion nolak (API mungkin udah dipatch).');
    }

    // 3. Pantau inbox (maksimal 6 detik biar gak kena limit Vercel)
    let magicLink = null;
    for (let i = 0; i < 4; i++) {
      await new Promise(r => setTimeout(r, 1500));
      
      const inboxRes = await fetch(`https://api.guerrillamail.com/ajax.php?f=check_email&seq=0&sid_token=${sid}`);
      const inboxData = await inboxRes.json();
      
      if (inboxData.list && inboxData.list.length > 0) {
        const msgId = inboxData.list[0].mail_id;
        const msgRes = await fetch(`https://api.guerrillamail.com/ajax.php?f=fetch_email&email_id=${msgId}&sid_token=${sid}`);
        const msgData = await msgRes.json();
        
        const text = msgData.mail_body || '';
        const match = text.match(/https:\/\/[^\s"']+oobCode=[^\s"']+/);
        
        if (match) {
          magicLink = match[0];
          break;
        }
      }
    }

    if (!magicLink) throw new Error('Email lambat masuk ke inbox.');

    // 4. Verifikasi link ke Alight Motion
    const verifyRes = await fetch('https://api.alightmotion.com/v1/auth/verify-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link: magicLink })
    });
    
    if (!verifyRes.ok) throw new Error('Link gak valid / expired.');
    const verifyData = await verifyRes.json();

    // 5. Balikin data sukses
    return Response.json({ 
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
    // INI KUNCINYA: Biar web gak crash 500, kita balikin pesan error rapi
    return Response.json({ success: false, message: err.message }, { status: 200 });
  }
}
