const cheerio = require('cheerio');

// ============ STORE SEARCHERS ============

// 1. DPORTENIS — HCL Commerce REST API (direct, no auth)
async function searchDportenis(query) {
  try {
    const url = `https://www.dportenis.mx/search/resources/store/1/productview/bySearchTerm/${encodeURIComponent(query)}?pageSize=5`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.catalogEntryView || !data.catalogEntryView.length) return null;

    const p = data.catalogEntryView[0];
    const priceObj = p.price || [];
    let price = 0, listPrice = 0;
    for (const pr of priceObj) {
      if (pr.usage === 'Offer' || pr.description === 'I') price = parseFloat(pr.value) || 0;
      if (pr.usage === 'Display' || pr.description === 'L') listPrice = parseFloat(pr.value) || 0;
    }
    if (!price && priceObj.length > 0) price = parseFloat(priceObj[0].value) || 0;
    if (!listPrice) listPrice = price;

    const thumb = p.thumbnail || '';
    const image = thumb.startsWith('http') ? thumb : (thumb ? `https://www.dportenis.mx${thumb}` : '');
    const seo = p.seo && p.seo.href ? p.seo.href : '';
    const productUrl = seo ? `https://www.dportenis.mx${seo}` : '';

    return {
      store: 'Dportenis',
      name: p.name || '',
      price: price,
      listPrice: listPrice,
      url: productUrl,
      image: image
    };
  } catch (e) {
    return { store: 'Dportenis', error: e.message };
  }
}

// 2. MARTI — VTEX Intelligent Search API
async function searchMarti(query) {
  try {
    const url = `https://www.marti.mx/api/io/_v/api/intelligent-search/product_search/${encodeURIComponent(query)}?page=1&count=5&locale=es-MX`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.products || !data.products.length) return null;

    const product = data.products[0];
    let lowestPrice = Infinity, highestList = 0;
    if (product.items) {
      for (const item of product.items) {
        if (!item.sellers) continue;
        for (const seller of item.sellers) {
          const offer = seller.commertialOffer;
          if (!offer || offer.Price <= 0) continue;
          if (offer.Price < lowestPrice) lowestPrice = offer.Price;
          if (offer.ListPrice > highestList) highestList = offer.ListPrice;
        }
      }
    }
    if (lowestPrice === Infinity && product.priceRange) {
      lowestPrice = product.priceRange.sellingPrice.lowPrice || 0;
      highestList = product.priceRange.listPrice.highPrice || 0;
    }
    if (lowestPrice === Infinity || lowestPrice <= 0) return null;

    const link = product.link || product.linkText || '';
    const productUrl = link.startsWith('http') ? link : `https://www.marti.mx${link}/p`;
    const image = product.items && product.items[0] && product.items[0].images && product.items[0].images[0] && product.items[0].images[0].imageUrl || '';

    return {
      store: 'Martí',
      name: product.productName || '',
      price: lowestPrice,
      listPrice: highestList || lowestPrice,
      url: productUrl,
      image: image
    };
  } catch (e) {
    return { store: 'Martí', error: e.message };
  }
}

// 3. LIVERPOOL — SSR scraping with __NEXT_DATA__ and JSON-LD fallback
async function searchLiverpool(query) {
  try {
    const url = `https://www.liverpool.com.mx/tienda/search?s=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-MX,es;q=0.9'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Strategy 1: Parse __NEXT_DATA__ for rich product data
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        // Navigate to search results
        const mainContent = nextData.props && nextData.props.pageProps &&
          nextData.props.pageProps.initialData && nextData.props.pageProps.initialData.mainContent;
        const records = mainContent && mainContent.records;
        if (records && records.length > 0) {
          const r = records[0];
          const meta = r.allMeta || r.attributes || r;
          const variants = meta.variants || [];
          let price = 0, listPrice = 0, image = '';
          if (variants.length > 0) {
            const v = variants[0];
            const prices = v.prices || {};
            price = prices.promoPrice || prices.salePrice || prices.listPrice || 0;
            listPrice = prices.listPrice || price;
            image = v.largeImage || v.smallImage || '';
          }
          const name = meta.title || '';
          const productUrl = meta.productId ? `https://www.liverpool.com.mx/tienda/pdp/${meta.productId}` : '';
          if (price > 0) {
            return {
              store: 'Liverpool',
              name: name,
              price: price,
              listPrice: listPrice,
              url: productUrl,
              image: image
            };
          }
        }
      } catch (e) {}
    }

    // Strategy 2: JSON-LD fallback
    const $ = cheerio.load(html);
    let price = 0, name = '', productUrl = '', image = '', listPrice = 0;
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const json = JSON.parse($(el).html());
        if (json['@type'] === 'Product' || (json.itemListElement && json.itemListElement[0])) {
          const item = json['@type'] === 'Product' ? json : json.itemListElement[0].item;
          if (item) {
            name = item.name || '';
            const offer = item.offers || {};
            price = parseFloat(offer.price || offer.lowPrice) || 0;
            listPrice = parseFloat(offer.highPrice || offer.price) || 0;
            image = item.image || '';
            productUrl = item.url || '';
          }
        }
      } catch (e) {}
    });

    if (!price) return null;
    return { store: 'Liverpool', name, price, listPrice: listPrice || price, url: productUrl, image };
  } catch (e) {
    return { store: 'Liverpool', error: e.message };
  }
}

// 4. NIKE MX — api.nike.com
async function searchNike(query) {
  try {
    const endpoint = `/product_feed/rollup_threads/v2?filter=marketplace(MX)&filter=language(es)&filter=channelId(d9a5bc42-4b9c-4976-858a-f159cf99c647)&filter=searchTerms(${encodeURIComponent(query)})&anchor=0&count=5&consumerChannelId=d9a5bc42-4b9c-4976-858a-f159cf99c647`;
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

// ============ MAIN HANDLER ============
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const { q, estilo, name, brand } = req.query;
  const searchName = name || q || '';
  const searchEstilo = estilo || '';
  const searchBrand = (brand || '').toLowerCase();

  if (!searchName && !searchEstilo) {
    return res.status(400).json({ error: 'Falta parametro: ?name=marca+producto o ?estilo=ABC123' });
  }

  // Build smart search queries
  const estiloBase = searchEstilo ? searchEstilo.split('-')[0] : '';
  const nameWords = searchName ? searchName.toLowerCase().split(/\s+/).filter(w => w.length >= 3) : [];

  // Validate result relevance
  function isRelevant(result) {
    if (!result || !result.name || !nameWords.length) return true;
    const rn = result.name.toLowerCase();
    // Must contain brand
    if (searchBrand && searchBrand.length > 2 && !rn.includes(searchBrand)) return false;
    // Must contain at least one keyword
    const otherWords = nameWords.filter(w => w !== searchBrand);
    if (otherWords.length > 0) {
      const matchCount = otherWords.filter(w => rn.includes(w)).length;
      if (matchCount === 0) return false;
    }
    return true;
  }

  // Search with estilo first, then name fallback
  async function searchWithFallback(searchFn, storeName) {
    try {
      // Try estilo first
      if (searchEstilo) {
        const result = await searchFn(searchEstilo);
        if (result && result.price > 0 && !result.error) return result;
      }
      // Try estilo base (without color code)
      if (estiloBase && estiloBase !== searchEstilo) {
        const result = await searchFn(estiloBase);
        if (result && result.price > 0 && !result.error && isRelevant(result)) return result;
      }
      // Try name
      if (searchName) {
        const result = await searchFn(searchName);
        if (result && result.price > 0 && !result.error && isRelevant(result)) return result;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // Search all 4 stores in parallel
  const results = await Promise.allSettled([
    searchWithFallback(searchDportenis, 'Dportenis'),
    searchWithFallback(searchMarti, 'Martí'),
    searchWithFallback(searchLiverpool, 'Liverpool'),
    searchWithFallback(searchNike, 'Nike')
  ]);

  const prices = results
    .map(r => r.status === 'fulfilled' ? r.value : null)
    .filter(r => r && r.price > 0 && !r.error);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  return res.status(200).json({
    query: searchName,
    estilo: searchEstilo,
    brand: searchBrand,
    timestamp: new Date().toISOString(),
    count: prices.length,
    results: prices
  });
};
