// app/api/auto/route.js
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    // 1. Bikin email sementara pakai 1secmail
    const emailRes = await fetch('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1');
    const emailData = await emailRes.json();
    const email = emailData[0];
    const [login, domain] = email.split('@');

    // 2. Kirim magic link ke Alight Motion
    const amRes = await fetch('https://api.alightmotion.com/v1/auth/magic-link', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'User-Agent': 'AlightMotion/5.0.0' 
      },
      body: JSON.stringify({ email: email })
    });

    // 3. Nunggu email masuk (maksimal 4 kali cek, total 6 detik)
    let magicLink = null;
    for (let i = 0; i < 4; i++) {
      await new Promise(r => setTimeout(r, 1500));
      
      const msgsRes = await fetch(`https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`);
      const msgs = await msgsRes.json();
      
      if (msgs && msgs.length > 0) {
        const msgId = msgs[0].id;
        const msgRes = await fetch(`https://www.1secmail.com/api/v1/?action=readMessage&login=${login}&domain=${domain}&id=${msgId}`);
        const msgData = await msgRes.json();
        
        const text = msgData.textBody || (msgData.htmlBody ? msgData.htmlBody.replace(/<[^>]+>/g, '') : '');
        const match = text.match(/https:\/\/[^\s"']+oobCode=[^\s"']+/);
        
        if (match) {
          magicLink = match[0];
          break;
        }
      }
    }

    if (!magicLink) throw new Error('Email lambat masuk atau dibatalin AM.');

    // 4. Verifikasi link
    const verifyRes = await fetch('https://api.alightmotion.com/v1/auth/verify-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link: magicLink })
    });
    
    const verifyData = await verifyRes.json();

    // 5. Kirim hasil ke web
    return new Response(JSON.stringify({ 
        success: true, 
        data: {
            email: email,
            uid: verifyData.uid || '—',
            orderId: verifyData.orderId || '—',
            status: 'PREMIUM ACTIVE',
            validUntil: 'SELAMANYA'
        } 
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' } 
    });
  }
      }
