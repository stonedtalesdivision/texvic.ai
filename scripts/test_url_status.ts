async function checkUrl(url: string) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    console.log(url, 'Status:', res.status);
    return res.status === 200;
  } catch (e: any) {
    console.log(url, 'Error:', e?.message);
    return false;
  }
}

async function main() {
  // Test our account's real reels
  await checkUrl('https://www.instagram.com/reel/DeLxA9QCtKo/');
  await checkUrl('https://www.instagram.com/reel/DeLo7kriAt2/');
  await checkUrl('https://www.instagram.com/reel/DeLhXjLlGRa/');
  await checkUrl('https://www.instagram.com/reel/DeLgkH4jUtb/');
  await checkUrl('https://www.instagram.com/reel/DeLcjrpjk9f/');

  // Test placeholder URLs that failed
  await checkUrl('https://www.instagram.com/reel/C8qV7X0sL9A/');
}

main().catch(console.error);
