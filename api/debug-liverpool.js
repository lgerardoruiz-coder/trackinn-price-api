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
        const mc = nd.props && nd.props.pageProps && nd.props.pageProps.initialData && nd.props.pageProps.initialData.mainContent;
        const records = mc && mc.records;
        recordCount = records ? records.length : 0;
        if (records && records[0]) {
          const meta = records[0].allMeta || records[0];
          firstTitle = meta.title || 'N/A';
          variantTitles = (meta.variants || []).slice(0, 3).map(v => v.title || 'N/A');
        }
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
