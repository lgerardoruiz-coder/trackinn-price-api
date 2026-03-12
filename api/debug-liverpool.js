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
        const pp = nd.props && nd.props.pageProps;
        const data = pp && pp.data;
        const dataKeys = data ? Object.keys(data) : [];

        // Explore data structure deeper
        let dataInfo = {};
        if (data) {
          for (const key of dataKeys.slice(0, 10)) {
            const val = data[key];
            if (val && typeof val === 'object') {
              dataInfo[key] = { type: Array.isArray(val) ? 'array(' + val.length + ')' : 'object', keys: Object.keys(val).slice(0, 10) };
            } else {
              dataInfo[key] = typeof val;
            }
          }
        }

        // Search for product data in the full JSON (look for price-related keywords)
        const fullStr = JSON.stringify(nd);
        const priceMatches = (fullStr.match(/"(promoPrice|listPrice|salePrice|currentPrice)"/g) || []).slice(0, 5);
        const titleMatches = (fullStr.match(/"title":"[^"]{5,50}"/g) || []).slice(0, 5);

        firstTitle = JSON.stringify({
          pagePropsKeys: pp ? Object.keys(pp) : [],
          dataKeys,
          dataInfo,
          priceFieldsFound: priceMatches,
          titleFieldsFound: titleMatches,
          fullJsonLength: fullStr.length,
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
