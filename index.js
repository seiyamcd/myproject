// CommonJS 版（package.json に "type": "module" が不要）
require('dotenv').config();
const axios = require('axios');

const token = process.env.BEARER_TOKEN;
if (!token) {
  console.error('BEARER_TOKEN が .env に設定されていません');
  process.exit(1);
}

async function main() {
  const url = 'https://api.twitter.com/2/tweets/search/recent';
  const params = new URLSearchParams({
    query: 'from:twitterdev',
    max_results: '10',
  });

  const res = await axios.get(`${url}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  console.log(JSON.stringify(res.data, null, 2));
}

main().catch((e) => {
  if (e.response) {
    console.error('HTTP Error', e.response.status, e.response.data);
  } else {
    console.error(e);
  }
});
