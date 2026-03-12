module.exports = async function handler(req, res) {
  const query = req.query.q || 'DV5457';
  const url = `https://www.liverpool.com.mx/tienda/search?s=${encodeURIComponent(query)}`;

  try {
    const start = Date.now();
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-MX,es;q=0.9'
      }
    });
    const elapsed = Date.now() - start;
    const html = await response.text();

    const hasNextData = html.includes('__NEXT_DATA__');
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    let recordCount = 0;
    let firstTitle = '';
    let variantTitles = [];

    if (nextDataMatch) {
      try {
        const nd = JSON.parse(nextDataMatch[1]);
        // Explore the structure to find where products are
        const pp = nd.props && nd.props.pageProps;
        const keys1 = pp ? Object.keys(pp) : [];
        const id = pp && pp.initialData;
        const keys2 = id ? Object.keys(id) : [];
        const mc = id && id.mainContent;
        const keys3 = mc ? Object.keys(mc) : [];
        const records = mc && mc.records;
        recordCount = records ? records.length : 0;

        // Also try alternative paths
        let altProducts = [];
        // Check if products are in a different location
        const str = JSON.stringify(nd).substring(0, 5000);
        const productIds = (str.match(/"productId":"(\d+)"/g) || []).slice(0, 5);

        firstTitle = JSON.stringify({
          pagePropsKeys: keys1,
          initialDataKeys: keys2,
          mainContentKeys: keys3,
          recordCount,
          productIdsFound: productIds,
        });
      } catch (e) {
        firstTitle = 'PARSE_ERROR: ' + e.message;
      }
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({
      query,
      fetchUrl: url,
      status: response.status,
      elapsed: elapsed + 'ms',
      htmlLength: html.length,
      hasNextData,
      recordCount,
      firstTitle,
      variantTitles
    });
  } catch (e) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ query, error: e.message });
  }
};
