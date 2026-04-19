const apiKey = 'AIzaSyBogkDbzmrI0h_sAwtUZyTmvMnH2P2PZkw';
fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [
      {
        parts: [
          { text: 'Say hi in valid JSON like { "hello": "world" }' },
          { inline_data: { mime_type: 'image/jpeg', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' } }
        ]
      }
    ],
    generationConfig: { responseMimeType: 'application/json' }
  })
}).then(async r => {
  console.log('Status:', r.status);
  console.log(await r.text());
}).catch(console.error);
