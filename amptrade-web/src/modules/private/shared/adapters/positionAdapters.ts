import type { Position, ProductTypeDisplay } from '@/modules/private/shared/types/trade'
import type { Broker } from '@/modules/private/shared/types/broker'
import { mapProductType } from '@/modules/private/shared/types/trade'

interface PositionAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform(data: any): Position[]
}

// Common response interfaces
interface BasePositionData {
  tsym: string
  netqty: string
  netavgprc?: string // Net position average price
  lp: string
  prd: string
  totbuyavgprc: string
  totsellavgprc: string
  rpnl: string
  urmtom?: string
  exch: string
  instname: string
  daybuyqty: string
  daysellqty: string
  daybuyamt: string
  daysellamt: string
  token: string
  ls?: string
  ti?: string // Tick size - minimum price increment
  frzqty?: string
  dname?: string // For Flattrade
  totbuyamt?: string // For Shoonya/Infinn
  totsellamt?: string // For Shoonya/Infinn
}

interface FlattradePositionResponse {
  orderBook?: {
    stat: string
    emsg?: string
  }
  positionBook?: Array<BasePositionData & {
    dname: string
  }>
}

interface ShoonyaPositionResponse {
  orderBook?: {
    stat: string
    emsg?: string
  }
  positionBook?: Array<BasePositionData & {
    stat: string
    uid: string
    actid: string
    netavgprc: string
    totbuyamt: string
    totsellamt: string
    s_prdt_ali: string
  }>
}

interface ZebuPositionResponse {
  orderBook?: {
    stat: string
    emsg?: string
  }
  positionBook?: Array<BasePositionData>
}

interface TradesmartPositionResponse {
  orderBook?: {
    stat: string
    emsg?: string
  }
  positionBook?: Array<BasePositionData>
}

interface ZerodhaPositionResponse {
  success?: boolean
  data?: {
    status?: string
    data?: {
      day?: Array<ZerodhaPosition>
      net?: Array<ZerodhaPosition>
    }
  }
  status?: string
}

interface ZerodhaPosition {
  tradingsymbol: string
  exchange: string
  instrument_token: number
  product: string
  quantity: number
  overnight_quantity: number
  multiplier: number
  average_price: number
  close_price: number
  last_price: number
  value: number
  pnl: number
  m2m: number
  unrealised: number
  realised: number
  buy_quantity: number
  buy_price: number
  buy_value: number
  buy_m2m: number
  sell_quantity: number
  sell_price: number
  sell_value: number
  sell_m2m: number
  day_buy_quantity: number
  day_buy_price: number
  day_buy_value: number
  day_sell_quantity: number
  day_sell_price: number
  day_sell_value: number
}

interface InfinnPositionResponse {
  orderBook?: {
    stat: string
    emsg?: string
  }
  positionBook?: Array<BasePositionData & {
    stat: string
    uid: string
    actid: string
    netavgprc: string
    totbuyamt: string
    totsellamt: string
    s_prdt_ali: string
  }>
}

/**
 * Base adapter class with common logic for most brokers (except Zerodha)
 * Eliminates code duplication across similar broker adapters
 */
abstract class BasePositionAdapter implements PositionAdapter {
  /**
   * Calculate unrealized P&L - standardized across all adapters
   */
  protected calculateUnrealizedPnL(quantity: number, lastPrice: number, buyAvg: number, sellAvg: number): number {
    if (quantity === 0) return 0

    if (quantity > 0) {
      return (lastPrice - buyAvg) * quantity
    } else {
      return (sellAvg - lastPrice) * Math.abs(quantity)
    }
  }

  /**
   * Transform common position data structure
   */
  protected transformPosition(pos: BasePositionData): Position {
    const quantity = parseInt(pos.netqty)
    const lastPrice = parseFloat(pos.lp)
    const buyAvg = parseFloat(pos.totbuyavgprc)
    const sellAvg = parseFloat(pos.totsellavgprc)
    // Parse net average price - this is the actual average price of the current net position
    const netAvgPrice = pos.netavgprc ? parseFloat(pos.netavgprc) : undefined

    const unrealizedPnL = this.calculateUnrealizedPnL(quantity, lastPrice, buyAvg, sellAvg)

    return {
      symbol: pos.tsym,
      quantity: quantity,
      side: quantity > 0 ? 'BUY' : 'SELL',
      stopLoss: null,
      trailingStopLoss: null,
      target: null,
      lastTradedPrice: lastPrice,
      productType: mapProductType(pos.prd),
      buyAverage: buyAvg,
      sellAverage: sellAvg,
      realizedPnL: parseFloat(pos.rpnl),
      unrealizedPnL: unrealizedPnL,
      exchange: pos.exch || '',
      instrumentName: pos.instname || '',
      displayName: this.getDisplayName(pos),
      totalBuyQty: parseInt(pos.daybuyqty),
      totalSellQty: parseInt(pos.daysellqty),
      totalBuyAmount: this.getTotalBuyAmount(pos),
      totalSellAmount: this.getTotalSellAmount(pos),
      token: pos.token || '',
      lotSize: pos.ls ? parseInt(pos.ls) : undefined,
      freezeQuantity: pos.frzqty ? parseInt(pos.frzqty) : undefined,
      tickSize: pos.ti ? parseFloat(pos.ti) : undefined,
      netAvgPrice: netAvgPrice,
    }
  }

  /**
   * Handle "no data" response - common across brokers
   */
  protected isNoDataResponse(data: unknown): boolean {
    const responseData = data as { orderBook?: { stat: string; emsg?: string } }
    return responseData?.orderBook?.stat === 'Not_Ok' && Boolean(responseData?.orderBook?.emsg?.includes('no data'))
  }

  /**
   * Get position data array from response - common logic
   */
  protected getPositionData(data: unknown): BasePositionData[] | null {
    const responseData = data as { positionBook?: BasePositionData[] }
    const positionData = responseData?.positionBook || data
    return Array.isArray(positionData) ? positionData : null
  }

  // Abstract methods for broker-specific differences
  protected abstract getDisplayName(pos: BasePositionData): string
  protected abstract getTotalBuyAmount(pos: BasePositionData): number
  protected abstract getTotalSellAmount(pos: BasePositionData): number

  abstract transform(data: unknown): Position[]
}

class FlattradePositionAdapter extends BasePositionAdapter {
  protected getDisplayName(pos: BasePositionData): string {
    return (pos as BasePositionData & { dname?: string }).dname || pos.tsym
  }

  protected getTotalBuyAmount(pos: BasePositionData): number {
    return parseFloat(pos.daybuyamt)
  }

  protected getTotalSellAmount(pos: BasePositionData): number {
    return parseFloat(pos.daysellamt)
  }

  transform(data: FlattradePositionResponse): Position[] {
    if (this.isNoDataResponse(data)) {
      return []
    }

    const positionData = this.getPositionData(data)
    if (!positionData) {
      return []
    }

    return positionData.map(pos => this.transformPosition(pos))
  }
}

class ShoonyaPositionAdapter extends BasePositionAdapter {
  protected getDisplayName(pos: BasePositionData): string {
    return pos.tsym
  }

  protected getTotalBuyAmount(pos: BasePositionData): number {
    return parseFloat((pos as BasePositionData & { totbuyamt?: string }).totbuyamt || pos.daybuyamt)
  }

  protected getTotalSellAmount(pos: BasePositionData): number {
    return parseFloat((pos as BasePositionData & { totsellamt?: string }).totsellamt || pos.daysellamt)
  }

  transform(data: ShoonyaPositionResponse): Position[] {
    if (this.isNoDataResponse(data)) {
      return []
    }

    const positionData = this.getPositionData(data)
    if (!positionData) {
      return []
    }

    return positionData.map(pos => this.transformPosition(pos))
  }
}

class ZebuPositionAdapter extends BasePositionAdapter {
  protected getDisplayName(pos: BasePositionData): string {
    return pos.tsym
  }

  protected getTotalBuyAmount(pos: BasePositionData): number {
    return parseFloat(pos.daybuyamt)
  }

  protected getTotalSellAmount(pos: BasePositionData): number {
    return parseFloat(pos.daysellamt)
  }

  transform(data: ZebuPositionResponse): Position[] {
    if (this.isNoDataResponse(data)) {
      return []
    }

    const positionData = this.getPositionData(data)
    if (!positionData) {
      return []
    }

    return positionData.map(pos => this.transformPosition(pos))
  }
}

class TradesmartPositionAdapter extends BasePositionAdapter {
  protected getDisplayName(pos: BasePositionData): string {
    return pos.tsym
  }

  protected getTotalBuyAmount(pos: BasePositionData): number {
    return parseFloat(pos.daybuyamt)
  }

  protected getTotalSellAmount(pos: BasePositionData): number {
    return parseFloat(pos.daysellamt)
  }

  transform(data: TradesmartPositionResponse): Position[] {
    if (this.isNoDataResponse(data)) {
      return []
    }

    const positionData = this.getPositionData(data)
    if (!positionData) {
      return []
    }

    return positionData.map(pos => this.transformPosition(pos))
  }
}

class InfinnPositionAdapter extends BasePositionAdapter {
  protected getDisplayName(pos: BasePositionData): string {
    return pos.tsym
  }

  protected getTotalBuyAmount(pos: BasePositionData): number {
    return parseFloat((pos as BasePositionData & { totbuyamt?: string }).totbuyamt || pos.daybuyamt)
  }

  protected getTotalSellAmount(pos: BasePositionData): number {
    return parseFloat((pos as BasePositionData & { totsellamt?: string }).totsellamt || pos.daysellamt)
  }

  transform(data: InfinnPositionResponse): Position[] {
    if (this.isNoDataResponse(data)) {
      return []
    }

    const positionData = this.getPositionData(data)
    if (!positionData) {
      return []
    }

    return positionData.map(pos => this.transformPosition(pos))
  }
}

/**
 * Zerodha adapter remains separate due to different API structure
 */
class ZerodhaPositionAdapter implements PositionAdapter {
  transform(data: ZerodhaPositionResponse): Position[] {
    // Handle the case where we don't have the expected structure
    if (!data.success || !data.data || data.data.status !== 'success' || !data.data.data) {
      return []
    }

    // Get positions from either net or day arrays, with preference for net
    const positionData = data.data.data
    const positions = positionData.net || positionData.day || []

    if (!positions.length) {
      return []
    }

    return positions.map((pos: ZerodhaPosition) => {
      // Determine position side based on quantity
      const side = pos.quantity > 0 ? 'BUY' : 'SELL'

      // Buy/Sell averages
      const buyAverage = pos.buy_quantity > 0 ? pos.buy_price : 0
      const sellAverage = pos.sell_quantity > 0 ? pos.sell_price : 0

      return {
        symbol: pos.tradingsymbol,
        quantity: pos.quantity,
        side: side,
        stopLoss: null,
        trailingStopLoss: null,
        target: null,
        lastTradedPrice: pos.last_price,
        productType: this.mapZerodhaProductType(pos.product),
        buyAverage: buyAverage,
        sellAverage: sellAverage,
        realizedPnL: pos.realised,
        unrealizedPnL: pos.unrealised,
        exchange: pos.exchange,
        instrumentName: '', // Not directly available in Zerodha API
        displayName: pos.tradingsymbol,
        totalBuyQty: pos.day_buy_quantity,
        totalSellQty: pos.day_sell_quantity,
        totalBuyAmount: pos.day_buy_value,
        totalSellAmount: pos.day_sell_value,
        token: pos.instrument_token.toString(),
        lotSize: pos.multiplier, // Use Zerodha's multiplier field as lot size
        freezeQuantity: undefined, // Not provided in Zerodha API
      }
    })
  }

  // Custom method to map Zerodha product types to display product types
  private mapZerodhaProductType(product: string): ProductTypeDisplay {
    switch (product) {
      case 'MIS':
        return 'Intraday'
      case 'CNC':
        return 'Carry Forward'
      case 'NRML':
        return 'Carry Forward'
      default:
        return 'Intraday'
    }
  }
}

// Factory to get the appropriate adapter
export function getPositionAdapter(broker: Broker): PositionAdapter {
  switch (broker.type.toLowerCase()) {
    case 'flattrade':
      return new FlattradePositionAdapter()
    case 'shoonya':
      return new ShoonyaPositionAdapter()
    case 'zebu':
      return new ZebuPositionAdapter()
    case 'tradesmart':
      return new TradesmartPositionAdapter()
    case 'zerodha':
      return new ZerodhaPositionAdapter()
    case 'infinn':
      return new InfinnPositionAdapter()
    case 'upstox':
      return new UpstoxPositionAdapter()
    default:
      throw new Error(`No position adapter found for broker type: ${broker.type}`)
  }
}

/**
 * Upstox position response interfaces
 */
interface UpstoxPosition {
  exchange: string
  multiplier: number
  value: number
  pnl: number
  product: string
  instrument_token: string
  average_price: number | null
  buy_value: number
  overnight_quantity: number
  day_buy_value: number
  day_buy_price: number
  overnight_buy_amount: number
  overnight_buy_quantity: number
  day_buy_quantity: number
  day_sell_value: number
  day_sell_price: number
  overnight_sell_amount: number
  overnight_sell_quantity: number
  day_sell_quantity: number
  quantity: number
  last_price: number
  unrealised: number
  realised: number
  sell_value: number
  trading_symbol: string
  tradingsymbol: string
  close_price: number
  buy_price: number
  sell_price: number
}

interface UpstoxPositionResponse {
  success?: boolean
  data?: {
    status?: string
    data?: UpstoxPosition[]
  }
}

/**
 * Upstox adapter for transforming position data
 */
class UpstoxPositionAdapter implements PositionAdapter {
  transform(data: UpstoxPositionResponse): Position[] {
    // Handle nested response from our API: { success: true, data: { status: 'success', data: [...] } }
    const positions = data?.data?.data || data?.data || []

    if (!Array.isArray(positions)) {
      return []
    }

    return (positions as UpstoxPosition[]).map((pos) => {
      const quantity = pos.quantity
      const side = quantity > 0 ? 'BUY' : 'SELL'

      // Buy/Sell averages from Upstox response
      const buyAverage = pos.buy_price || 0
      const sellAverage = pos.sell_price || 0

      return {
        symbol: pos.trading_symbol || pos.tradingsymbol,
        quantity: quantity,
        side: side,
        stopLoss: null,
        trailingStopLoss: null,
        target: null,
        lastTradedPrice: pos.last_price,
        productType: this.mapUpstoxProductType(pos.product),
        buyAverage: buyAverage,
        sellAverage: sellAverage,
        realizedPnL: pos.realised,
        unrealizedPnL: pos.unrealised,
        exchange: pos.exchange,
        instrumentName: '',
        displayName: pos.trading_symbol || pos.tradingsymbol,
        totalBuyQty: pos.day_buy_quantity,
        totalSellQty: pos.day_sell_quantity,
        totalBuyAmount: pos.day_buy_value,
        totalSellAmount: pos.day_sell_value,
        token: pos.instrument_token,
        lotSize: pos.multiplier,
        freezeQuantity: undefined,
        netAvgPrice: pos.average_price || undefined,
      }
    })
  }

  private mapUpstoxProductType(product: string): ProductTypeDisplay {
    switch (product) {
      case 'I':
        return 'Intraday'
      case 'D':
        return 'Carry Forward'
      case 'CO':
        return 'Intraday'
      case 'MTF':
        return 'Carry Forward'
      default:
        return 'Carry Forward'
    }
  }
}

