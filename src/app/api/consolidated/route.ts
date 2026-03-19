import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString())
  const month = parseInt(searchParams.get('month') || (new Date().getMonth() + 1).toString())
  const restaurant = searchParams.get('restaurant') || 'all'

  const supabase = createServerSupabaseClient()

  // Date range for the month
  const dateFrom = `${year}-${String(month).padStart(2,'0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const dateTo = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`
  const days = Array.from({length: lastDay}, (_, i) => i + 1)

  // Get all restaurants
  const { data: restaurantList } = await supabase
    .from('restaurants')
    .select('name')
    .eq('active', true)
    .order('name')

  const restaurants = restaurant === 'all'
    ? (restaurantList ?? []).map((r: any) => r.name)
    : [restaurant]

  // Fetch all data for the month
  async function fetchData(table: string, cols: string) {
    let q = supabase.from(table).select(cols).gte('date', dateFrom).lte('date', dateTo)
    if (restaurant !== 'all') q = q.eq('restaurant_name', restaurant)
    const { data } = await q
    return data ?? []
  }

  const [hourlyData, deliveryData, mealData, menuData, inventoryData] = await Promise.all([
    fetchData('hourly_sales', 'restaurant_name,date,hour,no_of_tickets,net_sales,discount,apt'),
    fetchData('delivery_sales', 'restaurant_name,date,hour,number_of_bills,net_sales'),
    fetchData('meal_count', 'restaurant_name,date,item_code,item_name,super_category,category,meal_count,total_quantity,total_price'),
    fetchData('menu_mix', 'restaurant_name,date,item_number,item_name,scategory,number_sold,net_sales'),
    fetchData('inventory', 'restaurant_name,date,item_code,item_name,category,consumption,wastage,variance,actual_consumption'),
  ])

  // Helper: get day number from date string
  const dayOf = (dateStr: string) => parseInt(dateStr.split('-')[2])

  // Helper: pivot data by day
  function pivotByDay(data: any[], keyFn: (r: any) => string, valueFn: (r: any) => number) {
    const result: Record<string, Record<number, number>> = {}
    data.forEach(r => {
      const key = keyFn(r)
      const day = dayOf(r.date)
      if (!result[key]) result[key] = {}
      result[key][day] = (result[key][day] || 0) + valueFn(r)
    })
    return result
  }

  // Build JSON response with all sections
  const HOURS = [
    '00:00 AM - 01:00 AM','01:00 AM - 02:00 AM','02:00 AM - 03:00 AM','03:00 AM - 04:00 AM',
    '04:00 AM - 05:00 AM','05:00 AM - 06:00 AM','06:00 AM - 07:00 AM','07:00 AM - 08:00 AM',
    '08:00 AM - 09:00 AM','09:00 AM - 10:00 AM','10:00 AM - 11:00 AM','11:00 AM - 12:00 PM',
    '12:00 PM - 01:00 PM','01:00 PM - 02:00 PM','02:00 PM - 03:00 PM','03:00 PM - 04:00 PM',
    '04:00 PM - 05:00 PM','05:00 PM - 06:00 PM','06:00 PM - 07:00 PM','07:00 PM - 08:00 PM',
    '08:00 PM - 09:00 PM','09:00 PM - 10:00 PM','10:00 PM - 11:00 PM','11:00 PM - 00:00 AM',
  ]

  const sections: any = {
    meta: { year, month, days, restaurants, lastDay },
  }

  // For each restaurant build sections
  for (const rest of restaurants) {
    const rHourly = hourlyData.filter((r: any) => r.restaurant_name === rest)
    const rDelivery = deliveryData.filter((r: any) => r.restaurant_name === rest)
    const rMeal = mealData.filter((r: any) => r.restaurant_name === rest)
    const rMenu = menuData.filter((r: any) => r.restaurant_name === rest)
    const rInv = inventoryData.filter((r: any) => r.restaurant_name === rest)

    // Hourly transactions pivot
    const hourlyTxn = pivotByDay(rHourly, r => r.hour, r => r.no_of_tickets || 0)
    const hourlyAmt = pivotByDay(rHourly, r => r.hour, r => r.net_sales || 0)
    const delivTxn  = pivotByDay(rDelivery, r => r.hour, r => r.number_of_bills || 0)
    const delivAmt  = pivotByDay(rDelivery, r => r.hour, r => r.net_sales || 0)

    // Product mix by item
    const pmixQty = pivotByDay(rMeal, r => `${r.item_code}||${r.item_name}`, r => r.total_quantity || 0)
    const pmixAmt = pivotByDay(rMeal, r => `${r.item_code}||${r.item_name}`, r => r.total_price || 0)
    const mealCnt = pivotByDay(rMeal, r => `${r.item_code}||${r.item_name}`, r => r.meal_count || 0)

    // Consumption / wastage / variance
    const consQty = pivotByDay(rInv, r => `${r.item_code}||${r.item_name}`, r => r.consumption || 0)
    const consAmt = pivotByDay(rInv, r => `${r.item_code}||${r.item_name}`, r => 0) // no amount in current schema
    const wasteQty = pivotByDay(rInv, r => `${r.item_code}||${r.item_name}`, r => r.wastage || 0)
    const varQty  = pivotByDay(rInv, r => `${r.item_code}||${r.item_name}`, r => r.variance || 0)

    // Get unique items
    const mealItems = [...new Set(rMeal.map((r: any) => `${r.item_code}||${r.item_name}`))]
    const invItems  = [...new Set(rInv.map((r: any) => `${r.item_code}||${r.item_name}`))]

    sections[rest] = {
      hourly_txn: HOURS.map(h => ({ hour: h, days: Object.fromEntries(days.map(d => [d, hourlyTxn[h]?.[d] || 0])) })),
      hourly_amt: HOURS.map(h => ({ hour: h, days: Object.fromEntries(days.map(d => [d, hourlyAmt[h]?.[d] || 0])) })),
      deliv_txn:  HOURS.map(h => ({ hour: h, days: Object.fromEntries(days.map(d => [d, delivTxn[h]?.[d] || 0])) })),
      deliv_amt:  HOURS.map(h => ({ hour: h, days: Object.fromEntries(days.map(d => [d, delivAmt[h]?.[d] || 0])) })),
      pmix_qty:   mealItems.map(k => ({ key: k, days: Object.fromEntries(days.map(d => [d, pmixQty[k]?.[d] || 0])) })),
      pmix_amt:   mealItems.map(k => ({ key: k, days: Object.fromEntries(days.map(d => [d, pmixAmt[k]?.[d] || 0])) })),
      meal_cnt:   mealItems.map(k => ({ key: k, days: Object.fromEntries(days.map(d => [d, mealCnt[k]?.[d] || 0])) })),
      cons_qty:   invItems.map(k  => ({ key: k, days: Object.fromEntries(days.map(d => [d, consQty[k]?.[d]  || 0])) })),
      waste_qty:  invItems.map(k  => ({ key: k, days: Object.fromEntries(days.map(d => [d, wasteQty[k]?.[d] || 0])) })),
      var_qty:    invItems.map(k  => ({ key: k, days: Object.fromEntries(days.map(d => [d, varQty[k]?.[d]   || 0])) })),
    }
  }

  return NextResponse.json(sections)
}
