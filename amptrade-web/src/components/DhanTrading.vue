<template>
  <div class="dhan-trading">
    <div class="trading-header">
      <h2>Dhan Trading</h2>
      <div class="connection-status" :class="{ connected: isConnected }">
        <span class="status-dot"></span>
        {{ isConnected ? 'Connected' : 'Not Connected' }}
      </div>
    </div>

    <div v-if="!isConnected" class="not-connected">
      <p>Connect your Dhan account first to start trading</p>
    </div>

    <div v-else class="trading-container">
      <!-- Margins Display -->
      <div class="margins-section">
        <h3>Account Margins</h3>
        <div class="margins-grid">
          <div class="margin-card">
            <span class="label">Available</span>
            <span class="value">{{ formatCurrency(margins.available_balance) }}</span>
          </div>
          <div class="margin-card">
            <span class="label">Utilised</span>
            <span class="value">{{ formatCurrency(margins.utilised_amount) }}</span>
          </div>
          <div class="margin-card">
            <span class="label">Equity</span>
            <span class="value">{{ formatCurrency(margins.equity_amount) }}</span>
          </div>
        </div>
      </div>

      <!-- Order Placement Form -->
      <div class="order-form-section">
        <h3>Place New Order</h3>
        <form @submit.prevent="handlePlaceOrder" class="order-form">
          <div class="form-row">
            <div class="form-group">
              <label>Security ID</label>
              <input
                v-model="order.security_id"
                type="text"
                placeholder="e.g., 12345"
                required
              />
            </div>
            <div class="form-group">
              <label>Exchange</label>
              <select v-model="order.exchange_segment" required>
                <option value="NSE">NSE</option>
                <option value="BSE">BSE</option>
                <option value="NFO">NFO</option>
                <option value="BFO">BFO</option>
                <option value="MCX">MCX</option>
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Transaction Type</label>
              <select v-model="order.transaction_type" required>
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </div>
            <div class="form-group">
              <label>Quantity</label>
              <input
                v-model.number="order.quantity"
                type="number"
                min="1"
                placeholder="1"
                required
              />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Order Type</label>
              <select v-model="order.order_type" required>
                <option value="MARKET">MARKET</option>
                <option value="LIMIT">LIMIT</option>
                <option value="STOP_LOSS">STOP_LOSS</option>
                <option value="STOP_LOSS_MARKET">STOP_LOSS_MARKET</option>
              </select>
            </div>
            <div class="form-group">
              <label>Product Type</label>
              <select v-model="order.product_type" required>
                <option value="CNC">CNC</option>
                <option value="INTRA">INTRA</option>
                <option value="MARGIN">MARGIN</option>
                <option value="CO">CO</option>
                <option value="BO">BO</option>
              </select>
            </div>
          </div>

          <div class="form-row">
            <div v-if="order.order_type !== 'MARKET'" class="form-group">
              <label>Price</label>
              <input
                v-model.number="order.price"
                type="number"
                step="0.01"
                placeholder="0.00"
              />
            </div>
            <div v-if="['STOP_LOSS', 'STOP_LOSS_MARKET'].includes(order.order_type)" class="form-group">
              <label>Trigger Price</label>
              <input
                v-model.number="order.trigger_price"
                type="number"
                step="0.01"
                placeholder="0.00"
              />
            </div>
            <div class="form-group">
              <label>Validity</label>
              <select v-model="order.validity" required>
                <option value="DAY">DAY</option>
                <option value="IOC">IOC</option>
              </select>
            </div>
          </div>

          <!-- Messages -->
          <div v-if="errorMessage" class="error-message">
            ⚠️ {{ errorMessage }}
          </div>
          <div v-if="successMessage" class="success-message">
            ✓ {{ successMessage }}
          </div>

          <!-- Submit Button -->
          <button type="submit" class="btn-submit" :disabled="isLoadingOrder">
            {{ isLoadingOrder ? 'Placing Order...' : 'Place Order' }}
          </button>
        </form>
      </div>

      <!-- Orders Display -->
      <div class="orders-section">
        <h3>Recent Orders</h3>
        <div v-if="orders.length === 0" class="empty-state">
          No orders yet
        </div>
        <table v-else class="orders-table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Status</th>
              <th>Symbol</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Type</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in orders" :key="o.order_id" :class="o.order_status.toLowerCase()">
              <td>{{ o.order_id }}</td>
              <td><span class="badge" :class="o.order_status.toLowerCase()">{{ o.order_status }}</span></td>
              <td>{{ o.exchange_segment }}</td>
              <td>{{ o.quantity }}</td>
              <td>{{ o.price || 'MKT' }}</td>
              <td>{{ o.transaction_type }}</td>
              <td>{{ formatTime(o.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';

const API_BASE = 'http://localhost:3089';

const isConnected = ref(false);
const margins = ref({ available_balance: 0, utilised_amount: 0, equity_amount: 0 });
const orders = ref<any[]>([]);
const errorMessage = ref('');
const successMessage = ref('');
const isLoadingOrder = ref(false);

const order = ref({
  security_id: '',
  exchange_segment: 'NSE',
  transaction_type: 'BUY',
  quantity: 1,
  order_type: 'MARKET',
  product_type: 'INTRA',
  price: undefined,
  trigger_price: undefined,
  validity: 'DAY'
});

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0
  }).format(value);
};

const formatTime = (dateString: string) => {
  return new Date(dateString).toLocaleTimeString();
};

const fetchMargins = async () => {
  try {
    const response = await axios.get(`${API_BASE}/dhan/fundLimit`);
    if (response.data.success) {
      margins.value = response.data.data;
    }
  } catch (error) {
    console.error('Error fetching margins:', error);
  }
};

const fetchOrders = async () => {
  try {
    const response = await axios.get(`${API_BASE}/dhan/getOrdersAndTrades`);
    if (response.data.success) {
      orders.value = response.data.data.orderBook || [];
    }
  } catch (error) {
    console.error('Error fetching orders:', error);
  }
};

const handlePlaceOrder = async () => {
  errorMessage.value = '';
  successMessage.value = '';
  isLoadingOrder.value = true;

  try {
    const orderPayload = { ...order.value };
    // Remove undefined fields
    Object.keys(orderPayload).forEach(key => {
      if ((orderPayload as any)[key] === undefined) {
        delete (orderPayload as any)[key];
      }
    });

    const response = await axios.post(`${API_BASE}/dhan/placeOrder`, orderPayload);

    if (response.data.success) {
      successMessage.value = `Order placed successfully! Order ID: ${response.data.data.order_id}`;
      // Reset form
      order.value = {
        security_id: '',
        exchange_segment: 'NSE',
        transaction_type: 'BUY',
        quantity: 1,
        order_type: 'MARKET',
        product_type: 'INTRA',
        price: undefined,
        trigger_price: undefined,
        validity: 'DAY'
      };
      // Refresh orders and margins
      await fetchOrders();
      await fetchMargins();
    }
  } catch (error: any) {
    errorMessage.value = error.response?.data?.message || 'Failed to place order';
  } finally {
    isLoadingOrder.value = false;
  }
};

onMounted(() => {
  // Check if Dhan is connected
  const checkConnection = async () => {
    try {
      await axios.get(`${API_BASE}/dhan/fundLimit`);
      isConnected.value = true;
      await fetchMargins();
      await fetchOrders();
    } catch (error) {
      isConnected.value = false;
    }
  };

  checkConnection();
  // Listen for connection event
  window.addEventListener('dhanConnected', () => {
    isConnected.value = true;
    fetchMargins();
    fetchOrders();
  });
});
</script>

<style scoped>
.dhan-trading {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.trading-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid #e0e0e0;
}

.trading-header h2 {
  margin: 0;
  font-size: 28px;
  color: #333;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #ffe6e6;
  color: #cc3333;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
}

.connection-status.connected {
  background: #e6ffe6;
  color: #33cc33;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #cc3333;
  display: inline-block;
  animation: pulse 2s infinite;
}

.connection-status.connected .status-dot {
  background: #33cc33;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.not-connected {
  text-align: center;
  padding: 60px 20px;
  color: #666;
  font-size: 16px;
}

.trading-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
}

.margins-section,
.order-form-section,
.orders-section {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.orders-section {
  grid-column: 1 / -1;
}

h3 {
  margin: 0 0 20px 0;
  font-size: 18px;
  color: #333;
  font-weight: 600;
}

.margins-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
}

.margin-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 15px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.margin-card .label {
  font-size: 12px;
  opacity: 0.9;
  font-weight: 500;
}

.margin-card .value {
  font-size: 20px;
  font-weight: 700;
}

.order-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 15px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 13px;
  font-weight: 600;
  color: #333;
}

.form-group input,
.form-group select {
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.3s;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.error-message,
.success-message {
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 13px;
}

.error-message {
  background: #fee;
  color: #c33;
  border: 1px solid #fcc;
}

.success-message {
  background: #efe;
  color: #3c3;
  border: 1px solid #cfc;
}

.btn-submit {
  padding: 12px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s;
}

.btn-submit:hover:not(:disabled) {
  transform: translateY(-2px);
}

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #999;
  font-size: 14px;
}

.orders-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.orders-table thead {
  background: #f5f5f5;
  border-bottom: 2px solid #ddd;
}

.orders-table th {
  padding: 12px 10px;
  text-align: left;
  font-weight: 600;
  color: #333;
}

.orders-table td {
  padding: 12px 10px;
  border-bottom: 1px solid #eee;
}

.orders-table tbody tr:hover {
  background: #fafafa;
}

.badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  background: #eee;
  color: #666;
}

.badge.pending {
  background: #ffeaa7;
  color: #d63031;
}

.badge.open {
  background: #a8e6cf;
  color: #00b894;
}

.badge.cancelled {
  background: #ffcccc;
  color: #d63031;
}

@media (max-width: 768px) {
  .trading-container {
    grid-template-columns: 1fr;
  }

  .margins-grid {
    grid-template-columns: 1fr;
  }

  .form-row {
    grid-template-columns: 1fr;
  }
}
</style>
