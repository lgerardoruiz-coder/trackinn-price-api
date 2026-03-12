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

        // Deep search: find all objects that have both title and prices
        function findProducts(obj, path, results, depth) {
          if (depth > 15 || results.length >= 3) return;
          if (!obj || typeof obj !== 'object') return;
          // Check if this object looks like a product (has title and price info)
          if (obj.title && (obj.prices || obj.promoPrice !== undefined || obj.listPrice !== undefined)) {
            results.push({ path, title: obj.title, prices: obj.prices || { promo: obj.promoPrice, list: obj.listPrice } });
            return;
          }
          if (obj.allMeta && obj.allMeta.title) {
            results.push({ path: path + '.allMeta', title: obj.allMeta.title });
            return;
          }
          if (Array.isArray(obj)) {
            for (let i = 0; i < Math.min(obj.length, 5); i++) {
              findProducts(obj[i], path + '[' + i + ']', results, depth + 1);
            }
          } else {
            for (const key of Object.keys(obj).slice(0, 20)) {
              findProducts(obj[key], path + '.' + key, results, depth + 1);
            }
          }
        }
        const products = [];
        findProducts(nd, 'root', products, 0);
        firstTitle = JSON.stringify({ productsFound: products.length, products: products.slice(0, 3) });
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
