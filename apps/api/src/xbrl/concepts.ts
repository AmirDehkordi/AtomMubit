import type { MetricKey } from '@desk/shared';

/**
 * XBRL concepts for each metric, in order of preference. Companies switch
 * concepts over the years (Revenues → RevenueFromContractWithCustomer…), so
 * each quarter takes the first concept that has a value for it.
 */
export const CONCEPTS: Record<MetricKey, { concepts: string[]; unit: string }> = {
  revenue: {
    concepts: [
      'Revenues',
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'RevenueFromContractWithCustomerIncludingAssessedTax',
      'SalesRevenueNet',
    ],
    unit: 'USD',
  },
  cost_of_revenue: { concepts: ['CostOfRevenue', 'CostOfGoodsAndServicesSold'], unit: 'USD' },
  gross_profit: { concepts: ['GrossProfit'], unit: 'USD' },
  research_and_development: { concepts: ['ResearchAndDevelopmentExpense'], unit: 'USD' },
  operating_income: { concepts: ['OperatingIncomeLoss'], unit: 'USD' },
  net_income: { concepts: ['NetIncomeLoss'], unit: 'USD' },
  eps_diluted: { concepts: ['EarningsPerShareDiluted'], unit: 'USD/shares' },
  eps_basic: { concepts: ['EarningsPerShareBasic'], unit: 'USD/shares' },
  diluted_shares: { concepts: ['WeightedAverageNumberOfDilutedSharesOutstanding'], unit: 'shares' },
  operating_cash_flow: { concepts: ['NetCashProvidedByUsedInOperatingActivities'], unit: 'USD' },
  capex: {
    concepts: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
    unit: 'USD',
  },
};

export const ALL_CONCEPTS = [...new Set(Object.values(CONCEPTS).flatMap((c) => c.concepts))];
