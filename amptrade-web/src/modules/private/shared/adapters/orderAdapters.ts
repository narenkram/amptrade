import type { Order, Trade } from '@/modules/private/shared/types/trade'
import type { Broker } from '@/modules/private/shared/types/broker'

// Add these interfaces at the top of the file
interface FlattradeOrderData {
  norenordno: string
  tsym: string
  qty: string
  fillshares: string
  prc: string
  avgprc: string
  status: string
  prctyp: string
  trantype: 'B' | 'S'
  exch: string
  prd: string
  norentm: string
  rejreason: string
}

interface FlattradeTradeData {
  norenordno: string
  tsym: string
  qty: string
  prc: string
  trantype: 'B' | 'S'
  exch: string
  prd: string
  norentm: string
  flid: string
  prctyp: string
  flprc: string
}

// Add these new interfaces for Shoonya data structures
interface ShoonyaOrderData {
  norenordno: string
  tsym: string
  qty: string
  fillshares?: string
  rqty?: string
  flprc: string
  avgprc: string
  status: string
  prctyp: string
  trantype: 'B' | 'S'
  exch: string
  prd: string
  norentm: string
  stat: string
  rejreason: string
}

interface ShoonyaTradeData {
  flid: string
  norenordno: string
  tsym: string
  flqty?: string
  qty: string
  flprc?: string
  prc: string
  trantype: 'B' | 'S'
  exch: string
  prd: string
  norentm: string
  prctyp: string
  stat: string
}

// Add Zebu interfaces
interface ZebuOrderData {
  norenordno: string
  tsym: string
  qty: string
  fillshares: string
  prc: string
  avgprc: string
  status: string
  prctyp: string
  trantype: 'B' | 'S'
  exch: string
  prd: string
  norentm: string
  rejreason: string
}

interface ZebuTradeData {
  flid: string
  norenordno: string
  tsym: string
  qty: string
  flprc: string
  trantype: 'B' | 'S'
  exch: string
  prd: string
  norentm: string
  prctyp: string
}

// Add these new interfaces for Tradesmart data structures
interface TradesmartOrderData {
  norenordno: string
  tsym: string
  qty: string
  fillshares?: string
  rqty?: string
  flprc: string
  avgprc: string
  status: string
  prctyp: string
  trantype: 'B' | 'S'
  exch: string
  prd: string
  norentm: string
  stat: string
  rejreason: string
}

interface TradesmartTradeData {
  flid: string
  norenordno: string
  tsym: string
  flqty?: string
  qty: string
  flprc?: string
  prc: string
  trantype: 'B' | 'S'
  exch: string
  prd: string
  norentm: string
  prctyp: string
  stat: string
}

// Add Zerodha interfaces
interface ZerodhaOrderData {
  order_id: string
  exchange_order_id: string
  parent_order_id: string | null
  status: string
  status_message: string | null
  order_timestamp: string
  exchange_timestamp: string
  exchange_update_timestamp?: string
  exchange: string
  tradingsymbol: string
  instrument_token: number
  transaction_type: 'BUY' | 'SELL'
  order_type: string
  price: number
  average_price: number
  filled_quantity: number
  pending_quantity: number
  cancelled_quantity: number
  disclosed_quantity: number
  trigger_price: number
  validity: string
  variety: string
  tag: string | null
  placed_by: string
  product: string
  quantity: number
  modified: boolean
}

interface ZerodhaTradeData {
  trade_id: string
  order_id: string
  exchange_order_id: string
  tradingsymbol: string
  exchange: string
  instrument_token: number
  transaction_type: 'BUY' | 'SELL'
  product: string
  average_price: number
  quantity: number
  fill_timestamp: string
  order_timestamp: string
  exchange_timestamp: string
}

// Add these new interfaces for Infinn data structures
interface InfinnOrderData {
  norenordno: string
  tsym: string
  qty: string
  fillshares?: string
  rqty?: string
  flprc: string
  avgprc: string
  status: string
  prctyp: string
  trantype: 'B' | 'S'
  exch: string
  prd: string
  norentm: string
  stat: string
  rejreason: string
}

interface InfinnTradeData {
  flid: string
  norenordno: string
  tsym: string
  flqty?: string
  qty: string
  flprc?: string
  prc: string
  trantype: 'B' | 'S'
  exch: string
  prd: string
  norentm: string
  prctyp: string
  stat: string
}

// Add these interfaces at the top
interface OrderResponse {
  stat: 'Ok' | 'Not_Ok'
  norenordno?: string // Flattrade/Shoonya/Tradesmart order ID
  emsg?: string
}

// Add these constants at the top of the file
export const ORDER_SIDE = {
  BUY: 'BUY',
  SELL: 'SELL',
} as const

export const PRODUCT_TYPE = {
  INTRADAY: 'Intraday',
  CARRY_FORWARD: 'Carry Forward',
} as const

export const ORDER_TYPE = {
  MKT: 'Market',
  LMT: 'Limit',
} as const

// Update the OrderAdapter interface
interface OrderAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform(data: any): Array<Order | Trade>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transformOrderResponse(data: any): {
    success: boolean
    orderId?: string
    error?: string
  }
}

// Add this interface above the ZerodhaOrderAdapter class
interface ZerodhaNestedData {
  data?: {
    orderBook?: ZerodhaOrderData[]
    tradeBook?: ZerodhaTradeData[]
  }
}

class FlattradeOrderAdapter implements OrderAdapter {
  transform(data: {
    orderBook?: FlattradeOrderData[] | ShoonyaOrderData[] | ZebuOrderData[] | TradesmartOrderData[]
    tradeBook?: FlattradeTradeData[] | ShoonyaTradeData[] | ZebuTradeData[] | TradesmartTradeData[]
  }): Array<Order | Trade> {
    // console.log('FlattradeOrderAdapter.transform input:', data)

    const orders = Array.isArray(data.orderBook)
      ? this.transformOrders(data.orderBook as FlattradeOrderData[])
      : []

    const trades = Array.isArray(data.tradeBook)
      ? this.transformTrades(data.tradeBook as FlattradeTradeData[])
      : []

    // console.log('FlattradeOrderAdapter.transform output:', {
    //   orders: orders.length,
    //   trades: trades.length,
    // })

    return [...orders, ...trades]
  }

  private transformOrders(orderData: FlattradeOrderData[]): Order[] {
    if (!orderData || !Array.isArray(orderData)) {
      return []
    }

    return orderData.map((order) => ({
      orderId: order.norenordno,
      symbol: order.tsym,
      quantity: parseInt(order.qty),
      filledQuantity: order.fillshares ? parseInt(order.fillshares) : undefined,
      price: parseFloat(order.prc),
      averagePrice: parseFloat(order.avgprc) || null,
      status: order.status,
      rejectionReason: order.rejreason,
      orderType: ORDER_TYPE[order.prctyp as keyof typeof ORDER_TYPE] || order.prctyp,
      side: order.trantype === 'B' ? ORDER_SIDE.BUY : ORDER_SIDE.SELL,
      exchange: order.exch || '',
      productType: order.prd === 'M' ? PRODUCT_TYPE.CARRY_FORWARD : PRODUCT_TYPE.INTRADAY,
      brokerType: 'Flattrade' as const,
      orderTimestamp: this.parseDateTime(order.norentm),
      recordType: 'order' as const,
    }))
  }

  private transformTrades(tradeData: FlattradeTradeData[]): Trade[] {
    if (!tradeData || !Array.isArray(tradeData)) {
      return []
    }

    return tradeData.map((trade) => ({
      tradeId: trade.flid,
      orderId: trade.norenordno,
      symbol: trade.tsym,
      quantity: parseInt(trade.qty),
      price: parseFloat(trade.flprc),
      side: trade.trantype === 'B' ? ORDER_SIDE.BUY : ORDER_SIDE.SELL,
      exchange: trade.exch,
      productType: trade.prd === 'M' ? PRODUCT_TYPE.CARRY_FORWARD : PRODUCT_TYPE.INTRADAY,
      tradeTimestamp: this.parseDateTime(trade.norentm),
      brokerType: 'Flattrade' as const,
      recordType: 'trade' as const,
      orderType: ORDER_TYPE[trade.prctyp as keyof typeof ORDER_TYPE] || trade.prctyp,
    }))
  }

  private parseDateTime(dateTimeStr: string): string {
    if (!dateTimeStr) return ''
    const [time, date] = dateTimeStr.split(' ')
    const [day, month, year] = date.split('-')
    return `${year}-${month}-${day}T${time}`
  }

  transformOrderResponse(data: OrderResponse) {
    return {
      success: data.stat === 'Ok',
      orderId: data.norenordno,
      error: data.emsg,
    }
  }
}

class ShoonyaOrderAdapter implements OrderAdapter {
  transform(data: {
    orderBook?: ShoonyaOrderData[]
    tradeBook?: ShoonyaTradeData[]
  }): Array<Order | Trade> {
    // console.log('ShoonyaOrderAdapter.transform input:', data)

    let orders: Order[] = []
    let trades: Trade[] = []

    // Handle orders array directly from response
    if (Array.isArray(data.orderBook)) {
      orders = data.orderBook
        .filter((order) => order.stat === 'Ok')
        .map((order) => ({
          orderId: order.norenordno,
          symbol: order.tsym,
          quantity: parseInt(order.qty),
          filledQuantity: parseInt(order.fillshares || '0'),
          price: parseFloat(order.flprc),
          averagePrice: parseFloat(order.avgprc) || null,
          status: order.status,
          rejectionReason: order.rejreason,
          orderType: ORDER_TYPE[order.prctyp as keyof typeof ORDER_TYPE] || order.prctyp,
          side: order.trantype === 'B' ? ORDER_SIDE.BUY : ORDER_SIDE.SELL,
          exchange: order.exch || '',
          productType: order.prd === 'I' ? PRODUCT_TYPE.INTRADAY : PRODUCT_TYPE.CARRY_FORWARD,
          brokerType: 'Shoonya' as const,
          orderTimestamp: this.parseDateTime(order.norentm),
          recordType: 'order' as const,
        }))
    }

    // Handle trades - checking for tradeBook array
    if (Array.isArray(data.tradeBook)) {
      trades = data.tradeBook
        .filter((trade) => trade.stat === 'Ok')
        .map((trade) => ({
          tradeId: trade.flid,
          orderId: trade.norenordno,
          symbol: trade.tsym,
          quantity: parseInt(trade.flqty || trade.qty),
          price: parseFloat(trade.flprc || trade.prc),
          side: trade.trantype === 'B' ? ORDER_SIDE.BUY : ORDER_SIDE.SELL,
          exchange: trade.exch || '',
          productType: trade.prd === 'I' ? PRODUCT_TYPE.INTRADAY : PRODUCT_TYPE.CARRY_FORWARD,
          tradeTimestamp: this.parseDateTime(trade.norentm),
          brokerType: 'Shoonya' as const,
          recordType: 'trade' as const,
          orderType: ORDER_TYPE[trade.prctyp as keyof typeof ORDER_TYPE] || trade.prctyp,
        }))
    }

    // console.log('ShoonyaOrderAdapter.transform output:', {
    //   orders: orders.length,
    //   trades: trades.length,
    //   orderData: orders,
    //   tradeData: trades,
    // })

    return [...orders, ...trades]
  }

  private parseDateTime(dateTimeStr: string): string {
    if (!dateTimeStr) return ''
    try {
      // Handle format: "15:02:40 06-12-2024"
      const [time, datePart] = dateTimeStr.split(' ')
      const [day, month, year] = datePart.split('-')
      // Pad month and day with leading zeros if needed
      const paddedMonth = month.padStart(2, '0')
      const paddedDay = day.padStart(2, '0')
      return `${year}-${paddedMonth}-${paddedDay}T${time}`
    } catch (e) {
      console.error('Date parsing error for:', dateTimeStr, e)
      return ''
    }
  }

  transformOrderResponse(data: OrderResponse) {
    return {
      success: data.stat === 'Ok',
      orderId: data.norenordno,
      error: data.emsg,
    }
  }
}

class ZebuOrderAdapter implements OrderAdapter {
  transform(data: {
    orderBook?: ZebuOrderData[]
    tradeBook?: ZebuTradeData[]
  }): Array<Order | Trade> {
    const orders = Array.isArray(data.orderBook) ? this.transformOrders(data.orderBook) : []

    const trades = Array.isArray(data.tradeBook) ? this.transformTrades(data.tradeBook) : []

    return [...orders, ...trades]
  }

  private transformOrders(orderData: ZebuOrderData[]): Order[] {
    if (!orderData || !Array.isArray(orderData)) {
      return []
    }

    return orderData.map((order) => ({
      orderId: order.norenordno,
      symbol: order.tsym,
      quantity: parseInt(order.qty),
      filledQuantity: order.fillshares ? parseInt(order.fillshares) : undefined,
      price: parseFloat(order.prc),
      averagePrice: parseFloat(order.avgprc) || null,
      status: order.status,
      rejectionReason: order.rejreason,
      orderType: ORDER_TYPE[order.prctyp as keyof typeof ORDER_TYPE] || order.prctyp,
      side: order.trantype === 'B' ? ORDER_SIDE.BUY : ORDER_SIDE.SELL,
      exchange: order.exch || '',
      productType: order.prd === 'M' ? PRODUCT_TYPE.CARRY_FORWARD : PRODUCT_TYPE.INTRADAY,
      brokerType: 'Zebu' as const,
      orderTimestamp: this.parseDateTime(order.norentm),
      recordType: 'order' as const,
    }))
  }

  private transformTrades(tradeData: ZebuTradeData[]): Trade[] {
    if (!tradeData || !Array.isArray(tradeData)) {
      return []
    }

    return tradeData.map((trade) => ({
      tradeId: trade.flid,
      orderId: trade.norenordno,
      symbol: trade.tsym,
      quantity: parseInt(trade.qty),
      price: parseFloat(trade.flprc),
      side: trade.trantype === 'B' ? ORDER_SIDE.BUY : ORDER_SIDE.SELL,
      exchange: trade.exch,
      productType: trade.prd === 'M' ? PRODUCT_TYPE.CARRY_FORWARD : PRODUCT_TYPE.INTRADAY,
      tradeTimestamp: this.parseDateTime(trade.norentm),
      brokerType: 'Zebu' as const,
      recordType: 'trade' as const,
      orderType: ORDER_TYPE[trade.prctyp as keyof typeof ORDER_TYPE] || trade.prctyp,
    }))
  }

  private parseDateTime(dateTimeStr: string): string {
    if (!dateTimeStr) return ''
    const [time, date] = dateTimeStr.split(' ')
    const [day, month, year] = date.split('-')
    return `${year}-${month}-${day}T${time}`
  }

  transformOrderResponse(data: OrderResponse) {
    return {
      success: data.stat === 'Ok',
      orderId: data.norenordno,
      error: data.emsg,
    }
  }
}

class TradesmartOrderAdapter implements OrderAdapter {
  transform(data: {
    orderBook?: TradesmartOrderData[]
    tradeBook?: TradesmartTradeData[]
  }): Array<Order | Trade> {
    // console.log('TradesmartOrderAdapter.transform input:', data)

    let orders: Order[] = []
    let trades: Trade[] = []

    // Handle orders array directly from response
    if (Array.isArray(data.orderBook)) {
      orders = data.orderBook
        .filter((order) => order.stat === 'Ok')
        .map((order) => ({
          orderId: order.norenordno,
          symbol: order.tsym,
          quantity: parseInt(order.qty),
          filledQuantity: parseInt(order.fillshares || '0'),
          price: parseFloat(order.flprc),
          averagePrice: parseFloat(order.avgprc) || null,
          status: order.status,
          rejectionReason: order.rejreason,
          orderType: ORDER_TYPE[order.prctyp as keyof typeof ORDER_TYPE] || order.prctyp,
          side: order.trantype === 'B' ? ORDER_SIDE.BUY : ORDER_SIDE.SELL,
          exchange: order.exch || '',
          productType: order.prd === 'I' ? PRODUCT_TYPE.INTRADAY : PRODUCT_TYPE.CARRY_FORWARD,
          brokerType: 'Tradesmart' as const,
          orderTimestamp: this.parseDateTime(order.norentm),
          recordType: 'order' as const,
        }))
    }

    // Handle trades - checking for tradeBook array
    if (Array.isArray(data.tradeBook)) {
      trades = data.tradeBook
        .filter((trade) => trade.stat === 'Ok')
        .map((trade) => ({
          tradeId: trade.flid,
          orderId: trade.norenordno,
          symbol: trade.tsym,
          quantity: parseInt(trade.flqty || trade.qty),
          price: parseFloat(trade.flprc || trade.prc),
          side: trade.trantype === 'B' ? ORDER_SIDE.BUY : ORDER_SIDE.SELL,
          exchange: trade.exch || '',
          productType: trade.prd === 'I' ? PRODUCT_TYPE.INTRADAY : PRODUCT_TYPE.CARRY_FORWARD,
          tradeTimestamp: this.parseDateTime(trade.norentm),
          brokerType: 'Tradesmart' as const,
          recordType: 'trade' as const,
          orderType: ORDER_TYPE[trade.prctyp as keyof typeof ORDER_TYPE] || trade.prctyp,
        }))
    }

    // console.log('TradesmartOrderAdapter.transform output:', {
    //   orders: orders.length,
    //   trades: trades.length,
    //   orderData: orders,
    //   tradeData: trades,
    // })

    return [...orders, ...trades]
  }

  private parseDateTime(dateTimeStr: string): string {
    if (!dateTimeStr) return ''
    try {
      // Handle format: "15:02:40 06-12-2024"
      const [time, datePart] = dateTimeStr.split(' ')
      const [day, month, year] = datePart.split('-')
      // Pad month and day with leading zeros if needed
      const paddedMonth = month.padStart(2, '0')
      const paddedDay = day.padStart(2, '0')
      return `${year}-${paddedMonth}-${paddedDay}T${time}`
    } catch (e) {
      console.error('Date parsing error for:', dateTimeStr, e)
      return ''
    }
  }

  transformOrderResponse(data: OrderResponse) {
    return {
      success: data.stat === 'Ok',
      orderId: data.norenordno,
      error: data.emsg,
    }
  }
}

class ZerodhaOrderAdapter implements OrderAdapter {
  transform(data: {
    orderBook?: ZerodhaOrderData[]
    tradeBook?: ZerodhaTradeData[]
    data?: { [key: string]: unknown } // More specific type instead of any
  }): Array<Order | Trade> {
    // Handle websocket order update format (single order)
    if (data.data && typeof data.data === 'object' && 'order_id' in data.data) {
      // This is likely a websocket order update
      // Cast to unknown first, then to ZerodhaOrderData to satisfy TypeScript
      const orderData = data.data as unknown as ZerodhaOrderData
      return [this.transformSingleOrder(orderData)]
    }

    console.log('ZerodhaOrderAdapter.transform input:', data)

    // Handle potentially nested data structure from API response
    const orderData = Array.isArray(data.orderBook)
      ? data.orderBook
      : (data as ZerodhaNestedData).data?.orderBook || []
    const tradeData = Array.isArray(data.tradeBook)
      ? data.tradeBook
      : (data as ZerodhaNestedData).data?.tradeBook || []

    const orders = Array.isArray(orderData) ? this.transformOrders(orderData) : []
    const trades = Array.isArray(tradeData) ? this.transformTrades(tradeData) : []

    console.log(
      'ZerodhaOrderAdapter.transform output - orders:',
      orders.length,
      'trades:',
      trades.length,
    )
    return [...orders, ...trades]
  }

  // Add a new method to transform a single order (from websocket)
  private transformSingleOrder(order: ZerodhaOrderData): Order {
    return {
      orderId: order.order_id,
      symbol: order.tradingsymbol,
      quantity: order.quantity,
      filledQuantity: order.filled_quantity,
      price: order.price,
      averagePrice: order.average_price || null,
      status: this.mapOrderStatus(order.status),
      rejectionReason: order.status_message || '',
      orderType: this.mapOrderType(order.order_type),
      side: order.transaction_type,
      exchange: order.exchange || '',
      productType: this.mapProductType(order.product),
      brokerType: 'Zerodha' as const,
      orderTimestamp: this.formatZerodhaTimestamp(order.order_timestamp),
      recordType: 'order' as const,
    }
  }

  private transformOrders(orderData: ZerodhaOrderData[]): Order[] {
    if (!orderData || !Array.isArray(orderData)) {
      return []
    }

    return orderData.map((order) => this.transformSingleOrder(order))
  }

  private transformTrades(tradeData: ZerodhaTradeData[]): Trade[] {
    if (!tradeData || !Array.isArray(tradeData)) {
      return []
    }

    return tradeData.map((trade) => ({
      tradeId: trade.trade_id,
      orderId: trade.order_id,
      symbol: trade.tradingsymbol,
      quantity: trade.quantity,
      price: trade.average_price,
      side: trade.transaction_type,
      exchange: trade.exchange,
      productType: this.mapProductType(trade.product),
      tradeTimestamp: this.formatZerodhaTimestamp(trade.fill_timestamp),
      brokerType: 'Zerodha' as const,
      recordType: 'trade' as const,
      orderType: 'MARKET', // Default as Zerodha doesn't provide this in trade data
    }))
  }

  private formatZerodhaTimestamp(dateTimeStr: string): string {
    if (!dateTimeStr) return ''

    // Zerodha timestamp format: "2021-05-31 09:16:39"
    // Already in ISO format, just need to replace space with 'T'
    return dateTimeStr.replace(' ', 'T')
  }

  private mapOrderStatus(status: string): string {
    const statusMap: { [key: string]: string } = {
      COMPLETE: 'COMPLETE',
      REJECTED: 'REJECTED',
      CANCELLED: 'CANCELLED',
      OPEN: 'OPEN',
      PENDING: 'PENDING',
      'MODIFY PENDING': 'PENDING',
      'MODIFY VALIDATION PENDING': 'PENDING',
      MODIFIED: 'OPEN',
      'TRIGGER PENDING': 'TRIGGER_PENDING',
      'VALIDATION PENDING': 'PENDING',
    }

    return statusMap[status] || status
  }

  private mapOrderType(orderType: string): string {
    const typeMap: { [key: string]: string } = {
      MARKET: ORDER_TYPE.MKT,
      LIMIT: ORDER_TYPE.LMT,
      SL: 'SL',
      'SL-M': 'SLM',
    }

    return typeMap[orderType] || orderType
  }

  private mapProductType(product: string): 'Intraday' | 'Carry Forward' {
    const productMap: { [key: string]: 'Intraday' | 'Carry Forward' } = {
      MIS: PRODUCT_TYPE.INTRADAY,
      CNC: PRODUCT_TYPE.CARRY_FORWARD,
      NRML: PRODUCT_TYPE.CARRY_FORWARD,
      MTF: PRODUCT_TYPE.CARRY_FORWARD,
    }

    return productMap[product] || PRODUCT_TYPE.CARRY_FORWARD
  }

  transformOrderResponse(
    data: OrderResponse | { status: string; data?: { order_id?: string }; message?: string },
  ) {
    // Zerodha has a different response format for order placement
    if ('status' in data) {
      return {
        success: data.status === 'success',
        orderId: data.data?.order_id,
        error: data.message,
      }
    }

    // Default response for OrderResponse type
    return {
      success: data.stat === 'Ok',
      orderId: (data as OrderResponse).norenordno,
      error: (data as OrderResponse).emsg,
    }
  }
}

class InfinnOrderAdapter implements OrderAdapter {
  transform(data: {
    orderBook?: InfinnOrderData[]
    tradeBook?: InfinnTradeData[]
  }): Array<Order | Trade> {
    let orders: Order[] = []
    let trades: Trade[] = []

    // Handle orders array directly from response
    if (Array.isArray(data.orderBook)) {
      orders = data.orderBook
        .filter((order) => order.stat === 'Ok')
        .map((order) => ({
          orderId: order.norenordno,
          symbol: order.tsym,
          quantity: parseInt(order.qty),
          filledQuantity: parseInt(order.fillshares || '0'),
          price: parseFloat(order.flprc),
          averagePrice: parseFloat(order.avgprc) || null,
          status: order.status,
          rejectionReason: order.rejreason,
          orderType: ORDER_TYPE[order.prctyp as keyof typeof ORDER_TYPE] || order.prctyp,
          side: order.trantype === 'B' ? ORDER_SIDE.BUY : ORDER_SIDE.SELL,
          exchange: order.exch || '',
          productType: order.prd === 'I' ? PRODUCT_TYPE.INTRADAY : PRODUCT_TYPE.CARRY_FORWARD,
          brokerType: 'Infinn' as const,
          orderTimestamp: this.parseDateTime(order.norentm),
          recordType: 'order' as const,
        }))
    }

    // Handle trades - checking for tradeBook array
    if (Array.isArray(data.tradeBook)) {
      trades = data.tradeBook
        .filter((trade) => trade.stat === 'Ok')
        .map((trade) => ({
          tradeId: trade.flid,
          orderId: trade.norenordno,
          symbol: trade.tsym,
          quantity: parseInt(trade.flqty || trade.qty),
          price: parseFloat(trade.flprc || trade.prc),
          side: trade.trantype === 'B' ? ORDER_SIDE.BUY : ORDER_SIDE.SELL,
          exchange: trade.exch || '',
          productType: trade.prd === 'I' ? PRODUCT_TYPE.INTRADAY : PRODUCT_TYPE.CARRY_FORWARD,
          tradeTimestamp: this.parseDateTime(trade.norentm),
          brokerType: 'Infinn' as const,
          recordType: 'trade' as const,
          orderType: ORDER_TYPE[trade.prctyp as keyof typeof ORDER_TYPE] || trade.prctyp,
        }))
    }

    return [...orders, ...trades]
  }

  private parseDateTime(dateTimeStr: string): string {
    if (!dateTimeStr) return ''
    try {
      // Handle format: "15:02:40 06-12-2024"
      const [time, datePart] = dateTimeStr.split(' ')
      const [day, month, year] = datePart.split('-')
      // Pad month and day with leading zeros if needed
      const paddedMonth = month.padStart(2, '0')
      const paddedDay = day.padStart(2, '0')
      return `${year}-${paddedMonth}-${paddedDay}T${time}`
    } catch (e) {
      console.error('Date parsing error for:', dateTimeStr, e)
      return ''
    }
  }

  transformOrderResponse(data: OrderResponse) {
    return {
      success: data.stat === 'Ok',
      orderId: data.norenordno,
      error: data.emsg,
    }
  }
}

export function getOrderAdapter(broker: Broker): OrderAdapter {
  switch (broker.type.toLowerCase()) {
    case 'flattrade':
      return new FlattradeOrderAdapter()
    case 'shoonya':
      return new ShoonyaOrderAdapter()
    case 'zebu':
      return new ZebuOrderAdapter()
    case 'tradesmart':
      return new TradesmartOrderAdapter()
    case 'zerodha':
      return new ZerodhaOrderAdapter()
    case 'infinn':
      return new InfinnOrderAdapter()
    case 'upstox':
      return new UpstoxOrderAdapter()
    default:
      throw new Error(`No order adapter found for broker type: ${broker.type}`)
  }
}

/**
 * Upstox order/trade interfaces
 */
interface UpstoxOrderData {
  exchange: string
  product: string
  price: number
  quantity: number
  status: string
  guid: string | null
  tag: string | null
  instrument_token: string
  placed_by: string
  trading_symbol: string
  tradingsymbol: string
  order_type: string
  validity: string
  trigger_price: number
  disclosed_quantity: number
  transaction_type: 'BUY' | 'SELL'
  average_price: number
  filled_quantity: number
  pending_quantity: number
  status_message: string | null
  status_message_raw: string | null
  exchange_order_id: string
  parent_order_id: string | null
  order_id: string
  variety: string
  order_timestamp: string
  exchange_timestamp: string | null
  is_amo: boolean
  order_request_id: string
  order_ref_id: string
}

interface UpstoxTradeData {
  exchange: string
  product: string
  tradingsymbol: string
  instrument_token: string
  order_type: string
  transaction_type: 'BUY' | 'SELL'
  quantity: number
  exchange_order_id: string
  order_id: string
  exchange_timestamp: string
  average_price: number
  trade_id: string
  order_ref_id: string
  order_timestamp: string
}

/**
 * Upstox adapter for transforming order/trade data
 */
class UpstoxOrderAdapter implements OrderAdapter {
  transform(data: {
    orderBook?: UpstoxOrderData[]
    tradeBook?: UpstoxTradeData[]
    success?: boolean
    data?: { orderBook?: UpstoxOrderData[]; tradeBook?: UpstoxTradeData[] }
  }): Array<Order | Trade> {
    // Handle nested response from our API: { success: true, data: { orderBook, tradeBook } }
    // Priority: check data.data first (nested API response), then direct properties
    const orderData = data.data?.orderBook || data.orderBook || []
    const tradeData = data.data?.tradeBook || data.tradeBook || []

    console.log('UpstoxOrderAdapter.transform - orderData count:', orderData.length, 'tradeData count:', tradeData.length)

    const orders = Array.isArray(orderData) ? this.transformOrders(orderData) : []
    const trades = Array.isArray(tradeData) ? this.transformTrades(tradeData) : []

    console.log('UpstoxOrderAdapter.transform - transformed orders:', orders.length, 'trades:', trades.length)

    return [...orders, ...trades]
  }

  private transformOrders(orderData: UpstoxOrderData[]): Order[] {
    if (!orderData || !Array.isArray(orderData)) {
      return []
    }

    return orderData.map((order) => ({
      orderId: order.order_id,
      symbol: order.trading_symbol || order.tradingsymbol,
      quantity: order.quantity,
      filledQuantity: order.filled_quantity,
      price: order.price,
      averagePrice: order.average_price || null,
      status: this.mapOrderStatus(order.status),
      rejectionReason: order.status_message || '',
      orderType: this.mapOrderType(order.order_type),
      side: order.transaction_type,
      exchange: order.exchange || '',
      productType: this.mapProductType(order.product),
      brokerType: 'Upstox' as const,
      orderTimestamp: this.formatTimestamp(order.order_timestamp),
      recordType: 'order' as const,
    }))
  }

  private transformTrades(tradeData: UpstoxTradeData[]): Trade[] {
    if (!tradeData || !Array.isArray(tradeData)) {
      return []
    }

    return tradeData.map((trade) => ({
      tradeId: trade.trade_id,
      orderId: trade.order_id,
      symbol: trade.tradingsymbol,
      quantity: trade.quantity,
      price: trade.average_price,
      side: trade.transaction_type,
      exchange: trade.exchange,
      productType: this.mapProductType(trade.product),
      tradeTimestamp: this.formatTimestamp(trade.exchange_timestamp),
      brokerType: 'Upstox' as const,
      recordType: 'trade' as const,
      orderType: this.mapOrderType(trade.order_type),
    }))
  }

  private formatTimestamp(dateTimeStr: string): string {
    if (!dateTimeStr) return ''
    // Upstox timestamp format: "2023-10-19 09:23:23"
    return dateTimeStr.replace(' ', 'T')
  }

  private mapOrderStatus(status: string): string {
    const statusMap: { [key: string]: string } = {
      complete: 'COMPLETE',
      rejected: 'REJECTED',
      cancelled: 'CANCELLED',
      open: 'OPEN',
      pending: 'PENDING',
      'trigger pending': 'TRIGGER_PENDING',
      'after market order req received': 'PENDING',
    }
    return statusMap[status.toLowerCase()] || status.toUpperCase()
  }

  private mapOrderType(orderType: string): string {
    const typeMap: { [key: string]: string } = {
      MARKET: ORDER_TYPE.MKT,
      LIMIT: ORDER_TYPE.LMT,
      SL: 'SL',
      'SL-M': 'SLM',
    }
    return typeMap[orderType] || orderType
  }

  private mapProductType(product: string): 'Intraday' | 'Carry Forward' {
    const productMap: { [key: string]: 'Intraday' | 'Carry Forward' } = {
      I: PRODUCT_TYPE.INTRADAY,
      D: PRODUCT_TYPE.CARRY_FORWARD,
      CO: PRODUCT_TYPE.INTRADAY,
      MTF: PRODUCT_TYPE.CARRY_FORWARD,
    }
    return productMap[product] || PRODUCT_TYPE.CARRY_FORWARD
  }

  transformOrderResponse(data: OrderResponse | { status: string; data?: { order_id?: string }; message?: string }) {
    if ('status' in data && typeof data.status === 'string') {
      return {
        success: data.status === 'success',
        orderId: data.data?.order_id,
        error: data.message,
      }
    }

    return {
      success: (data as OrderResponse).stat === 'Ok',
      orderId: (data as OrderResponse).norenordno,
      error: (data as OrderResponse).emsg,
    }
  }
}

