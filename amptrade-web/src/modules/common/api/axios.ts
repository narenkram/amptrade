// src/api/axios.ts
import axios from 'axios'

const api = axios.create({
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use(async (config) => {
  return config
})

export default api
