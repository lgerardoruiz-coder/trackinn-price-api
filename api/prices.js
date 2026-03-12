const cheerio = require('cheerio');

// ============ HELPER: Check if estilo matches a reference string ============
function estiloMatches(estilo, reference) {
  if (!estilo || !reference) return false;
  const e = estilo.toUpperCase().trim();
  const r = reference.toUpperCase().trim();
  // Exact match
  if (r.includes(e)) return true;
  // Try base estilo (without color code, e.g., FD6033 from FD6033-108)
  const eBase = e.split('-')[0];
  if (eBase.length >= 5 && r.includes(eBase)) return true;
  return false;
}

// ============ STORE SEARCHERS ============

// 1. DPORTENIS — HCL Commerce REST API (direct, no auth)
// Validates via `keyword` field which contains manufacturer style codes
async function searchDportenis(query, estilo) {
  try {
    const url = `https://www.dportenis.mx/search/resources/store/1/productview/bySearchTerm/${encodeURIComponent(query)}?pageSize=10`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.catalogEntryView || !data.catalogEntryView.length) return null;

    // Find the product whose keyword field contains our estilo
    let matched = null;
    for (const p of data.catalogEntryView) {
      const keyword = (p.keyword || '').toUpperCase();
      if (estilo && estiloMatches(estilo, keyword)) {
        matched = p;
        break;
      }
    }
    // No match found — don't return a random product
    if (!matched) return null;

    const p = matched;
    const priceObj = p.price || [];
    let price = 0, listPrice = 0;
    for (const pr of priceObj) {
      if (pr.usage === 'Offer' || pr.description === 'I') price = parseFloat(pr.value) || 0;
      if (pr.usage === 'Display' || pr.description === 'L') listPrice = parseFloat(pr.value) || 0;
    }
    if (!price && priceObj.length > 0) price = parseFloat(priceObj[0].value) || 0;
    if (!listPrice) listPrice = price;
    if (!price) return null;

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
    return null;
  }
}

// 2. MARTI — VTEX Intelligent Search API
// Validates via `productReference` field which contains manufacturer style code
async function searchMarti(query, estilo) {
  try {
    const url = `https://www.marti.mx/api/io/_v/api/intelligent-search/product_search/?query=${encodeURIComponent(query)}&page=1&count=10&locale=es-MX`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.products || !data.products.length) return null;

    // Find the product whose productReference matches our estilo
    let matched = null;
    for (const product of data.products) {
      const ref = (product.productReference || '').toUpperCase();
      if (estilo && estiloMatches(estilo, ref)) {
        matched = product;
        break;
      }
      // Also check in items' referenceId
      if (product.items) {
        for (const item of product.items) {
          const itemRef = (item.referenceId && item.referenceId[0] && item.referenceId[0].Value || '').toUpperCase();
          if (estilo && estiloMatches(estilo, itemRef)) {
            matched = product;
            break;
          }
        }
        if (matched) break;
      }
    }
    // No match found — don't return a random product
    if (!matched) return null;

    const product = matched;
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
    return null;
  }
}

// 3. LIVERPOOL — SSR scraping with __NEXT_DATA__ and JSON-LD fallback
// Validates by checking product title/SKU/model against estilo
async function searchLiverpool(query, estilo) {
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
        // Liverpool changed structure: try new path first, then old path
        const mainContent =
          (nextData.query && nextData.query.data && nextData.query.data.mainContent) ||
          (nextData.props && nextData.props.pageProps && nextData.props.pageProps.initialData && nextData.props.pageProps.initialData.mainContent);
        const records = mainContent && mainContent.records;
        if (records && records.length > 0) {
          // Search through ALL records for a match, not just the first one
          for (const r of records) {
            const meta = r.allMeta || r.attributes || r;
            // Check if estilo appears in title, sku, model, variant titles, or any identifier field
            const variantTitles = (meta.variants || []).map(v => v.title || '').join(' ');
            const searchFields = [
              meta.title || '',
              meta.sku || '',
              meta.model || '',
              meta.productId || '',
              meta.manufacturer_style || '',
              meta.partNumber || '',
              variantTitles,
              JSON.stringify(meta.child_sku_ids || '')
            ].join(' ').toUpperCase();

            if (estilo && !estiloMatches(estilo, searchFields)) continue;

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
        }
      } catch (e) {}
    }

    // Strategy 2: JSON-LD fallback — only if estilo found in product data
    const $ = cheerio.load(html);
    let price = 0, name = '', productUrl = '', image = '', listPrice = 0;
    let found = false;
    $('script[type="application/ld+json"]').each((i, el) => {
      if (found) return;
      try {
        const json = JSON.parse($(el).html());
        if (json['@type'] === 'Product' || (json.itemListElement && json.itemListElement[0])) {
          const item = json['@type'] === 'Product' ? json : json.itemListElement[0].item;
          if (item) {
            // Validate estilo match
            const itemFields = [item.name || '', item.sku || '', item.model || '', item.mpn || ''].join(' ').toUpperCase();
            if (estilo && !estiloMatches(estilo, itemFields)) return;
            found = true;
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

    if (!price || !found) return null;
    return { store: 'Liverpool', name, price, listPrice: listPrice || price, url: productUrl, image };
  } catch (e) {
    return null;
  }
}

// 4. NIKE MX — nike.com.mx search page scraping
// Validates via product title/URL containing the estilo
async function searchNike(query, estilo) {
  try {
    // Try the product detail page directly by style code
    const styleForUrl = (estilo || query).toUpperCase();
    const searchUrl = `https://www.nike.com/mx/w?q=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-MX,es;q=0.9'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Look for JSON-LD product data
    const $ = cheerio.load(html);
    let matched = null;
    $('script[type="application/ld+json"]').each((i, el) => {
      if (matched) return;
      try {
        const json = JSON.parse($(el).html());
        const items = json['@type'] === 'ItemList' ? (json.itemListElement || []) : [json];
        for (const entry of items) {
          const item = entry.item || entry;
          if (item['@type'] !== 'Product') continue;
          const fields = [item.name || '', item.sku || '', item.model || '', item.mpn || '', item.url || ''].join(' ').toUpperCase();
          if (estilo && estiloMatches(estilo, fields)) {
            const offer = item.offers || {};
            const price = parseFloat(offer.price || offer.lowPrice) || 0;
            if (price > 0) {
              matched = {
                store: 'Nike',
                name: item.name || '',
                price: price,
                listPrice: parseFloat(offer.highPrice || offer.price) || price,
                url: item.url || searchUrl,
                image: (typeof item.image === 'string' ? item.image : (item.image && item.image[0])) || ''
              };
            }
          }
        }
      } catch (e) {}
    });

    // Fallback: search in __NEXT_DATA__ if present
    if (!matched) {
      const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (nextMatch) {
        try {
          const nd = JSON.parse(nextMatch[1]);
          // Try to find products in the data structure
          const str = JSON.stringify(nd);
          // Check if our estilo appears anywhere in the data
          if (estilo && str.toUpperCase().includes(estilo.toUpperCase().split('-')[0])) {
            // Extract price and product info from nearby context
            const priceMatch = str.match(/"currentPrice":(\d+\.?\d*)/);
            const titleMatch = str.match(/"title":"([^"]+)"/);
            const urlMatch = str.match(/"pdpUrl":"([^"]+)"/);
            const imgMatch = str.match(/"squarishURL":"([^"]+)"/);
            const styleMatch = str.match(/"styleColor":"([^"]+)"/);
            if (priceMatch && styleMatch && estilo && estiloMatches(estilo, styleMatch[1])) {
              matched = {
                store: 'Nike',
                name: titleMatch ? titleMatch[1] : '',
                price: parseFloat(priceMatch[1]) || 0,
                listPrice: parseFloat((str.match(/"fullPrice":(\d+\.?\d*)/) || [])[1]) || parseFloat(priceMatch[1]) || 0,
                url: urlMatch ? `https://www.nike.com/mx${urlMatch[1]}` : searchUrl,
                image: imgMatch ? imgMatch[1] : ''
              };
            }
          }
        } catch (e) {}
      }
    }

    return matched;
  } catch (e) {
    return null;
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

  // Build search queries — only use estilo-based searches for accuracy
  const estiloBase = searchEstilo ? searchEstilo.split('-')[0] : '';

  // Search with estilo first, then estilo base — NO name fallback (causes wrong matches)
  async function searchWithFallback(searchFn, storeName) {
    try {
      // Try full estilo (e.g., FD6033-108)
      if (searchEstilo) {
        const result = await searchFn(searchEstilo, searchEstilo);
        if (result && result.price > 0) return result;
      }
      // Try estilo base (e.g., FD6033) — still validates against full estilo
      if (estiloBase && estiloBase !== searchEstilo) {
        const result = await searchFn(estiloBase, searchEstilo);
        if (result && result.price > 0) return result;
      }
      // Try name as search query but STILL validate against estilo
      if (searchName && searchEstilo) {
        const result = await searchFn(searchName, searchEstilo);
        if (result && result.price > 0) return result;
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
    .filter(r => r && r.price > 0);

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
