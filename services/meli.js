const axios = require('axios');

const BASE_URL = 'https://api.mercadolibre.com';
const AUTH_URL = 'https://auth.mercadolivre.com.br'; // Brasil (MLB)
// Para outros países mude o domínio (ex: auth.mercadolibre.com.ar)

class MeliClient {
  constructor(accessToken, refreshToken = null) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  get headers() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
  }

  async get(url, params = {}) {
    const res = await axios.get(`${BASE_URL}${url}`, {
      headers: this.headers,
      params
    });
    return res.data;
  }

  async put(url, data) {
    const res = await axios.put(`${BASE_URL}${url}`, data, {
      headers: this.headers
    });
    return res.data;
  }

  // Dados do usuário autenticado
  async getMe() {
    return this.get('/users/me');
  }

  // Lista itens do vendedor (paginado)
  async searchItems(userId, options = {}) {
    const params = {
      status: options.status || 'active',
      limit: options.limit || 50,
      offset: options.offset || 0,
      orders: options.orders || 'start_time_desc'
    };
    return this.get(`/users/${userId}/items/search`, params);
  }

  // Detalhes de um item
  async getItem(itemId) {
    return this.get(`/items/${itemId}`);
  }

  // Descrição do item
  async getDescription(itemId) {
    try {
      return await this.get(`/items/${itemId}/description`);
    } catch {
      return null;
    }
  }

  // Visitas totais (últimos ~2 anos)
  async getVisits(itemIds) {
    // Aceita string ou array
    const ids = Array.isArray(itemIds) ? itemIds.join(',') : itemIds;
    return this.get('/visits/items', { ids });
  }

  // Visitas em período
  async getVisitsRange(itemId, dateFrom, dateTo) {
    return this.get('/items/visits', {
      ids: itemId,
      date_from: dateFrom,
      date_to: dateTo
    });
  }

  // Busca anúncios semelhantes no marketplace
  async searchMarketplace(query, options = {}) {
    return this.get(`/sites/${options.siteId || 'MLB'}/search`, {
      q: query,
      limit: options.limit || 10
    });
  }

  // Pedidos recentes do vendedor para estimar vendas por anúncio no período
  async getRecentSalesByItems(userId, dateFrom, dateTo, maxOrders = 500) {
    const counts = {};
    let offset = 0;
    const limit = 50;
    while (offset < maxOrders) {
      const data = await this.get('/orders/search', {
        seller: userId,
        'order.status': 'paid',
        'order.date_created.from': dateFrom,
        'order.date_created.to': dateTo,
        limit, offset, sort: 'date_desc'
      });
      const orders = data.results || [];
      for (const order of orders) {
        for (const row of (order.order_items || [])) {
          const id = row.item?.id;
          if (id) counts[id] = (counts[id] || 0) + Number(row.quantity || 1);
        }
      }
      if (orders.length < limit) break;
      offset += limit;
    }
    return counts;
  }

  // Atualiza item (título, preço, etc.)
  async updateItem(itemId, data) {
    return this.put(`/items/${itemId}`, data);
  }

  // Atualiza descrição
  async updateDescription(itemId, plainText) {
    // A API de description aceita plain_text
    return this.put(`/items/${itemId}/description`, {
      plain_text: plainText
    });
  }
}

// ==================== OAuth Helpers ====================

function getAuthUrl(appId, redirectUri, state = 'meli-auto') {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: appId,
    redirect_uri: redirectUri,
    state
  });
  return `${AUTH_URL}/authorization?${params.toString()}`;
}

async function exchangeCode(code, appId, clientSecret, redirectUri) {
  const res = await axios.post(
    `${BASE_URL}/oauth/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: appId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data; // { access_token, refresh_token, expires_in, user_id, ... }
}

async function refreshAccessToken(refreshToken, appId, clientSecret) {
  const res = await axios.post(
    `${BASE_URL}/oauth/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: appId,
      client_secret: clientSecret,
      refresh_token: refreshToken
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data;
}

module.exports = {
  MeliClient,
  getAuthUrl,
  exchangeCode,
  refreshAccessToken
};
