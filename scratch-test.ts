import fetch from 'node-fetch';

async function testFetch() {
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' } });
    const html = await res.text();
    
    // Look for embedded JSON containing viewCount
    const viewMatch = html.match(/"viewCount":"(\d+)"/);
    const likeMatch = html.match(/"likeCount":"(\d+)"/);
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    
    console.log("YouTube Views:", viewMatch ? viewMatch[1] : 'Not found');
    console.log("YouTube Likes:", likeMatch ? likeMatch[1] : 'Not found');
    console.log("YouTube Title:", titleMatch ? titleMatch[1] : 'Not found');
  } catch(e) {
    console.error(e);
  }
}
testFetch();
