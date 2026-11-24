import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) return NextResponse.json({ error: 'URL kosong' }, { status: 400 });

  try {
    const res = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    // Ambil sebagai teks dulu
    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        // Kalau API balikin HTML (misal error 502), lempar teksnya biar web lu bisa baca
        return NextResponse.json({ error: 'API Balikin HTML', detail: text.substring(0, 50) }, { status: 500 });
    }
    
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
