<template>
  <div class="dhan-login-container">
    <div class="login-card">
      <h2>Connect Dhan Account</h2>
      <p class="subtitle">Securely connect your Dhan trading account to AmpTrade</p>

      <form @submit.prevent="handleLogin" class="login-form">
        <!-- Client ID Input -->
        <div class="form-group">
          <label for="clientId">Client ID</label>
          <input
            id="clientId"
            v-model="form.clientId"
            type="text"
            placeholder="e.g., DC123456"
            required
            :disabled="isLoading"
          />
          <small>Find this in your Dhan API settings</small>
        </div>

        <!-- Access Token Input -->
        <div class="form-group">
          <label for="accessToken">Access Token</label>
          <textarea
            id="accessToken"
            v-model="form.accessToken"
            placeholder="Paste your Dhan access token here"
            rows="4"
            required
            :disabled="isLoading"
          />
          <small>This token will be securely stored and never exposed</small>
        </div>

        <!-- Error Message -->
        <div v-if="errorMessage" class="error-message">
          <i class="icon-error">⚠️</i>
          {{ errorMessage }}
        </div>

        <!-- Success Message -->
        <div v-if="successMessage" class="success-message">
          <i class="icon-success">✓</i>
          {{ successMessage }}
        </div>

        <!-- Submit Button -->
        <button
          type="submit"
          class="btn-submit"
          :disabled="isLoading || !form.clientId || !form.accessToken"
        >
          <span v-if="!isLoading">Connect Dhan Account</span>
          <span v-else>Connecting...</span>
        </button>
      </form>

      <!-- Help Section -->
      <div class="help-section">
        <h3>How to get your credentials?</h3>
        <ol>
          <li>Login to <a href="https://web.dhan.co" target="_blank">Dhan Web Platform</a></li>
          <li>Go to <strong>Profile → DhanHQ Trading APIs</strong></li>
          <li>Click <strong>"Request Access"</strong> (first time users)</li>
          <li>Generate your <strong>Access Token</strong></li>
          <li>Copy and paste credentials above</li>
        </ol>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';

const form = ref({
  clientId: '',
  accessToken: ''
});

const isLoading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const API_BASE = 'http://localhost:3089';

const handleLogin = async () => {
  errorMessage.value = '';
  successMessage.value = '';
  isLoading.value = true;

  try {
    const response = await axios.post(`${API_BASE}/dhan/generateToken`, {
      client_id: form.value.clientId,
      access_token: form.value.accessToken
    });

    if (response.data.success) {
      successMessage.value = 'Successfully connected to Dhan! ✓';
      form.value.accessToken = ''; // Clear sensitive data
      
      // Emit success event to parent component
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('dhanConnected', {
          detail: { clientId: form.value.clientId }
        }));
      }, 1000);
    }
  } catch (error: any) {
    errorMessage.value = error.response?.data?.message || 'Failed to connect to Dhan account';
  } finally {
    isLoading.value = false;
  }
};
</script>

<style scoped>
.dhan-login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}

.login-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
  padding: 40px;
  width: 100%;
  max-width: 500px;
}

h2 {
  margin: 0 0 10px 0;
  color: #333;
  font-size: 28px;
  font-weight: 600;
}

.subtitle {
  color: #666;
  margin: 0 0 30px 0;
  font-size: 14px;
}

.login-form {
  margin-bottom: 30px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #333;
  font-weight: 600;
  font-size: 14px;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 12px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  font-family: monospace;
  transition: border-color 0.3s;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-group input:disabled,
.form-group textarea:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
}

.form-group small {
  display: block;
  margin-top: 6px;
  color: #999;
  font-size: 12px;
}

.error-message,
.success-message {
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}

.error-message {
  background-color: #fee;
  border: 1px solid #fcc;
  color: #c33;
}

.success-message {
  background-color: #efe;
  border: 1px solid #cfc;
  color: #3c3;
}

.btn-submit {
  width: 100%;
  padding: 12px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.btn-submit:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.3);
}

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.help-section {
  background: #f9f9f9;
  padding: 20px;
  border-radius: 8px;
  border-left: 4px solid #667eea;
}

.help-section h3 {
  margin: 0 0 12px 0;
  color: #333;
  font-size: 16px;
}

.help-section ol {
  margin: 0;
  padding-left: 20px;
  color: #666;
  font-size: 14px;
  line-height: 1.8;
}

.help-section li {
  margin-bottom: 8px;
}

.help-section strong {
  color: #333;
  font-weight: 600;
}

.help-section a {
  color: #667eea;
  text-decoration: none;
}

.help-section a:hover {
  text-decoration: underline;
}
</style>
