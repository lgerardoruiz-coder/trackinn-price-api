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
        const fullStr = JSON.stringify(nd);

        // Find the path to products by looking for promoPrice context
        // Extract a chunk around the first promoPrice to see the structure
        const idx = fullStr.indexOf('"promoPrice"');
        const chunk = idx >= 0 ? fullStr.substring(Math.max(0, idx - 500), idx + 200) : 'NOT_FOUND';

        // Try to find records/products array
        const recordsIdx = fullStr.indexOf('"records"');
        const recordsChunk = recordsIdx >= 0 ? fullStr.substring(recordsIdx, recordsIdx + 200) : 'NOT_FOUND';

        // Try body structure
        const pp = nd.props && nd.props.pageProps;
        const body = pp && pp.body;
        const bodyType = body ? (typeof body === 'string' ? 'string(' + body.length + ')' : (Array.isArray(body) ? 'array(' + body.length + ')' : 'object:' + Object.keys(body).slice(0,5).join(','))) : 'null';

        firstTitle = JSON.stringify({
          bodyType,
          priceContext: chunk.substring(0, 500),
          recordsContext: recordsChunk.substring(0, 300),
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
