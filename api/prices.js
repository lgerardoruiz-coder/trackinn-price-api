const cheerio = require('cheerio');

// ============ STORE SEARCHERS ============

// 1. MARTI — VTEX public API (no key needed)
async function searchMarti(query) {
  try {
    const url = `https://www.marti.mx/api/catalog_system/pub/products/search?ft=${encodeURIComponent(query)}&_from=0&_to=4`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.length) return null;

    const product = data[0];
    const sku = product.items && product.items[0];
    const seller = sku && sku.sellers && sku.sellers[0];
    const price = seller && seller.commertialOffer && seller.commertialOffer.Price;
    const listPrice = seller && seller.commertialOffer && seller.commertialOffer.ListPrice;

    return {
      store: 'Marti',
      name: product.productName || '',
      price: price || 0,
      listPrice: listPrice || 0,
      url: product.link || `https://www.marti.mx/${product.linkText}/p`,
      image: product.items && product.items[0] && product.items[0].images && product.items[0].images[0] && product.items[0].images[0].imageUrl || ''
    };
  } catch (e) {
    return { store: 'Marti', error: e.message };
  }
}

// 2. PALACIO DE HIERRO — Constructor.io
async function searchPalacio(query) {
  try {
    const url = `https://ac.cnstrc.com/search/${encodeURIComponent(query)}?key=key_5fTaaMhNEscECxIa&num_results_per_page=3&page=1`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();

    const results = data.response && data.response.results;
    if (!results || !results.length) return null;

    const item = results[0];
    const meta = item.data || {};

    return {
      store: 'Palacio de Hierro',
      name: item.value || meta.product_name || '',
      price: meta.price || 0,
      listPrice: meta.listPrice || meta.price || 0,
      url: meta.url ? (meta.url.startsWith('http') ? meta.url : `https://www.elpalaciodehierro.com${meta.url}`) : '',
      image: meta.image_url || (meta.images && meta.images[0]) || ''
    };
  } catch (e) {
    return { store: 'Palacio de Hierro', error: e.message };
  }
}

// 3. NIKE MX — api.nike.com
async function searchNike(query) {
  try {
    const endpoint = `/product_feed/rollup_threads/v2?filter=marketplace(MX)&filter=language(es)&filter=channelId(d9a5bc42-4b9c-4976-858a-f159cf99c647)&filter=searchTerms(${encodeURIComponent(query)})&anchor=0&count=3&consumerChannelId=d9a5bc42-4b9c-4976-858a-f159cf99c647`;
    const url = `https://api.nike.com/cic/browse/v2?queryid=products&anonymousId=trackinn&country=mx&language=es&endpoint=${encodeURIComponent(endpoint)}`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();

    const products = data.data && data.data.products && data.data.products.products;
    if (!products || !products.length) return null;

    const p = products[0];
    const price = p.price && p.price.currentPrice;
    const listPrice = p.price && (p.price.fullPrice || p.price.currentPrice);

    return {
      store: 'Nike',
      name: p.title || '',
      price: price || 0,
      listPrice: listPrice || 0,
      url: p.url ? `https://www.nike.com.mx${p.url}` : '',
      image: p.images && p.images.squarishURL || ''
    };
  } catch (e) {
    return { store: 'Nike', error: e.message };
  }
}

// 4. LIVERPOOL — scrape search page
async function searchLiverpool(query) {
  try {
    const url = `https://www.liverpool.com.mx/tienda/buscar?s=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-MX,es;q=0.9'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);

    // Try JSON-LD
    let price = 0, name = '', productUrl = '', image = '', listPrice = 0;
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const json = JSON.parse($(el).html());
        if (json['@type'] === 'Product' || (json.itemListElement && json.itemListElement[0])) {
          const item = json['@type'] === 'Product' ? json : json.itemListElement && json.itemListElement[0] && json.itemListElement[0].item;
          if (item) {
            name = item.name || '';
            const offer = item.offers || (item.offers && item.offers[0]);
            if (offer) {
              price = parseFloat(offer.price || offer.lowPrice) || 0;
              listPrice = parseFloat(offer.highPrice || offer.price) || 0;
            }
            image = item.image || '';
            productUrl = item.url || '';
          }
        }
      } catch (e) {}
    });

    // Fallback: try meta tags or product cards
    if (!price) {
      const card = $('[data-price], .product-card, .plp-card').first();
      const priceText = card.find('[class*="price"], [class*="Price"]').first().text();
      const match = priceText && priceText.match(/[\d,]+\.?\d*/);
      if (match) price = parseFloat(match[0].replace(/,/g, ''));
      name = name || card.find('[class*="name"], [class*="title"]').first().text().trim();
    }

    if (!price) return null;

    return {
      store: 'Liverpool',
      name: name,
      price: price,
      listPrice: listPrice || price,
      url: productUrl || url,
      image: image
    };
  } catch (e) {
    return { store: 'Liverpool', error: e.message };
  }
}

// 5. AMAZON MX — scrape search page
async function searchAmazon(query) {
  try {
    const url = `https://www.amazon.com.mx/s?k=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-MX,es;q=0.9'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);

    const result = $('[data-component-type="s-search-result"]').first();
    if (!result.length) return null;

    const priceWhole = result.find('.a-price .a-price-whole').first().text().replace(/[,.\s]/g, '');
    const priceFraction = result.find('.a-price .a-price-fraction').first().text() || '00';
    const price = parseFloat(priceWhole + '.' + priceFraction) || 0;
    const name = result.find('h2 a span, h2 span').first().text().trim();
    const link = result.find('h2 a').first().attr('href');
    const img = result.find('img.s-image').first().attr('src');

    // Original price (strikethrough)
    const origText = result.find('.a-price.a-text-price .a-offscreen').first().text();
    const origMatch = origText && origText.match(/[\d,]+\.?\d*/);
    const listPrice = origMatch ? parseFloat(origMatch[0].replace(/,/g, '')) : price;

    if (!price) return null;

    return {
      store: 'Amazon',
      name: name,
      price: price,
      listPrice: listPrice,
      url: link ? `https://www.amazon.com.mx${link}` : url,
      image: img || ''
    };
  } catch (e) {
    return { store: 'Amazon', error: e.message };
  }
}

// 6. ADIDAS MX — scrape search page
async function searchAdidas(query) {
  try {
    const url = `https://www.adidas.mx/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-MX,es;q=0.9'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);

    // Try JSON-LD
    let price = 0, name = '', productUrl = '', image = '', listPrice = 0;
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const json = JSON.parse($(el).html());
        const items = json.itemListElement || json['@graph'];
        if (items && items[0]) {
          const item = items[0].item || items[0];
          name = item.name || '';
          const offer = item.offers || {};
          price = parseFloat(offer.price || offer.lowPrice) || 0;
          listPrice = parseFloat(offer.highPrice || offer.price) || 0;
          image = item.image || '';
          productUrl = item.url || '';
        }
      } catch (e) {}
    });

    // Fallback: product card
    if (!price) {
      const card = $('[class*="product-card"], [class*="plp-card"]').first();
      const priceText = card.find('[class*="price"]').first().text();
      const match = priceText && priceText.match(/[\d,]+\.?\d*/);
      if (match) price = parseFloat(match[0].replace(/,/g, ''));
      name = name || card.find('[class*="name"], [class*="title"]').first().text().trim();
    }

    if (!price) return null;

    return {
      store: 'Adidas',
      name: name,
      price: price,
      listPrice: listPrice || price,
      url: productUrl || url,
      image: image
    };
  } catch (e) {
    return { store: 'Adidas', error: e.message };
  }
}

// 7. DEPORTENIS — scrape search page
async function searchDeportenis(query) {
  try {
    const url = `https://www.dportenis.mx/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-MX,es;q=0.9'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);

    // Try JSON-LD
    let price = 0, name = '', productUrl = '', image = '', listPrice = 0;
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const json = JSON.parse($(el).html());
        if (json['@type'] === 'Product') {
          name = json.name || '';
          const offer = json.offers || {};
          price = parseFloat(offer.price || offer.lowPrice) || 0;
          listPrice = parseFloat(offer.highPrice || offer.price) || 0;
          image = json.image || '';
          productUrl = json.url || '';
        }
      } catch (e) {}
    });

    // Fallback: product card
    if (!price) {
      const card = $('[class*="product"], [class*="card"]').first();
      const priceText = card.find('[class*="price"]').first().text();
      const match = priceText && priceText.match(/[\d,]+\.?\d*/);
      if (match) price = parseFloat(match[0].replace(/,/g, ''));
      name = name || card.find('[class*="name"], [class*="title"]').first().text().trim();
    }

    if (!price) return null;

    return {
      store: 'Deportenis',
      name: name,
      price: price,
      listPrice: listPrice || price,
      url: productUrl || url,
      image: image
    };
  } catch (e) {
    return { store: 'Deportenis', error: e.message };
  }
}

// ============ MAIN HANDLER ============
module.exports = async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const { q, estilo } = req.query;
  const query = estilo || q;

  if (!query) {
    return res.status(400).json({ error: 'Falta parametro: ?q=nombre+producto o ?estilo=ABC123' });
  }

  // Search all stores in parallel
  const results = await Promise.allSettled([
    searchMarti(query),
    searchPalacio(query),
    searchNike(query),
    searchLiverpool(query),
    searchAmazon(query),
    searchAdidas(query),
    searchDeportenis(query)
  ]);

  const prices = results
    .map(r => r.status === 'fulfilled' ? r.value : null)
    .filter(Boolean);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  return res.status(200).json({
    query: query,
    timestamp: new Date().toISOString(),
    results: prices
  });
};
