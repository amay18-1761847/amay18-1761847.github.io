// Default data: account types, category tree (modeled on Monarch's defaults),
// and the keyword dictionary used for auto-categorization.

export const ACCOUNT_TYPES = {
  checking:        { label: 'Checking',          group: 'Cash',        liability: false },
  savings:         { label: 'Savings',           group: 'Cash',        liability: false },
  cash:            { label: 'Cash',              group: 'Cash',        liability: false },
  credit:          { label: 'Credit card',       group: 'Credit cards', liability: true },
  brokerage:       { label: 'Brokerage',         group: 'Investments', liability: false },
  retirement:      { label: 'Retirement (401k/IRA)', group: 'Investments', liability: false },
  crypto:          { label: 'Crypto',            group: 'Investments', liability: false },
  property:        { label: 'Real estate',       group: 'Real estate', liability: false },
  vehicle:         { label: 'Vehicle',           group: 'Vehicles',    liability: false },
  other_asset:     { label: 'Other asset',       group: 'Other assets', liability: false },
  mortgage:        { label: 'Mortgage',          group: 'Loans',       liability: true },
  auto_loan:       { label: 'Auto loan',         group: 'Loans',       liability: true },
  student_loan:    { label: 'Student loan',      group: 'Loans',       liability: true },
  loan:            { label: 'Other loan',        group: 'Loans',       liability: true },
  other_liability: { label: 'Other liability',   group: 'Other liabilities', liability: true },
};
export const ACCOUNT_GROUP_ORDER = [
  'Cash', 'Credit cards', 'Investments', 'Real estate', 'Vehicles', 'Other assets', 'Loans', 'Other liabilities',
];
export const isLiability = (acct) => !!ACCOUNT_TYPES[acct?.type]?.liability;
export const isInvestment = (acct) => ACCOUNT_TYPES[acct?.type]?.group === 'Investments';

// [groupName, type, [[categoryName, icon, flexType]]]
// flexType: fixed | flexible | non_monthly  (used by Flex budgeting)
const TREE = [
  ['Income', 'income', [
    ['Paychecks', '💰', 'fixed'], ['Interest', '💸', 'fixed'], ['Business Income', '💼', 'fixed'],
    ['Other Income', '🪙', 'fixed'],
  ]],
  ['Housing', 'expense', [
    ['Mortgage', '🏠', 'fixed'], ['Rent', '🏢', 'fixed'], ['Home Improvement', '🔨', 'non_monthly'],
  ]],
  ['Bills & Utilities', 'expense', [
    ['Gas & Electric', '⚡', 'fixed'], ['Water', '💧', 'fixed'], ['Garbage', '🗑️', 'fixed'],
    ['Internet & Cable', '🌐', 'fixed'], ['Phone', '📱', 'fixed'],
  ]],
  ['Auto & Transport', 'expense', [
    ['Auto Payment', '🚗', 'fixed'], ['Gas', '⛽', 'flexible'], ['Auto Maintenance', '🔧', 'non_monthly'],
    ['Parking & Tolls', '🅿️', 'flexible'], ['Public Transit', '🚇', 'flexible'], ['Taxi & Ride Shares', '🚕', 'flexible'],
  ]],
  ['Food & Dining', 'expense', [
    ['Groceries', '🍏', 'flexible'], ['Restaurants & Bars', '🍽️', 'flexible'], ['Coffee Shops', '☕', 'flexible'],
  ]],
  ['Shopping', 'expense', [
    ['Shopping', '🛍️', 'flexible'], ['Clothing', '👕', 'flexible'], ['Furniture & Housewares', '🛋️', 'non_monthly'],
    ['Electronics', '🖥️', 'non_monthly'],
  ]],
  ['Travel & Lifestyle', 'expense', [
    ['Travel & Vacation', '🏝️', 'non_monthly'], ['Entertainment & Recreation', '🎥', 'flexible'],
    ['Personal', '💅', 'flexible'], ['Pets', '🐶', 'flexible'], ['Fun Money', '😜', 'flexible'],
    ['Subscriptions', '📺', 'fixed'],
  ]],
  ['Health & Wellness', 'expense', [
    ['Medical', '💊', 'flexible'], ['Dentist', '🦷', 'non_monthly'], ['Fitness', '💪', 'fixed'],
  ]],
  ['Children', 'expense', [
    ['Child Care', '🧸', 'fixed'], ['Child Activities', '⚽', 'flexible'],
  ]],
  ['Education', 'expense', [
    ['Student Loans', '🎓', 'fixed'], ['Education', '🏫', 'non_monthly'],
  ]],
  ['Gifts & Donations', 'expense', [
    ['Gifts', '🎁', 'non_monthly'], ['Charity', '🎗️', 'flexible'],
  ]],
  ['Financial', 'expense', [
    ['Insurance', '☂️', 'fixed'], ['Taxes', '🏛️', 'non_monthly'], ['Financial Fees', '🏦', 'flexible'],
    ['Financial & Legal Services', '⚖️', 'non_monthly'], ['Cash & ATM', '🏧', 'flexible'],
    ['Loan Repayment', '💳', 'fixed'],
  ]],
  ['Other', 'expense', [
    ['Uncategorized', '❓', 'flexible'], ['Check', '📝', 'flexible'], ['Miscellaneous', '💲', 'flexible'],
  ]],
  ['Transfers', 'transfer', [
    ['Transfer', '🔁', 'fixed'], ['Credit Card Payment', '💳', 'fixed'], ['Balance Adjustments', '⚖️', 'fixed'],
  ]],
];

export const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export function defaultCategories() {
  const groups = [];
  const categories = [];
  TREE.forEach(([gname, type, cats], gi) => {
    const gid = 'grp_' + slug(gname);
    groups.push({ id: gid, name: gname, type, order: gi });
    cats.forEach(([name, icon, flex], ci) => {
      categories.push({
        id: 'cat_' + slug(name), groupId: gid, name, icon, flex, order: ci, rollover: false, rolloverStart: null,
      });
    });
  });
  return { groups, categories };
}

export const UNCATEGORIZED = 'cat_uncategorized';
export const TRANSFER = 'cat_transfer';
export const CC_PAYMENT = 'cat_credit_card_payment';

// Keyword -> category id. First match wins, so more specific entries come first.
export const KEYWORDS = [
  [/payroll|direct dep|salary|paycheck|adp |gusto|paychex/, 'cat_paychecks'],
  [/interest (paid|earned|payment)|int earned|dividend/, 'cat_interest'],
  [/autopay|card payment|payment thank you|credit card pmt|epay|crd pmt|cardmember/, CC_PAYMENT],
  [/transfer|xfer|zelle to|venmo cashout|to savings|from checking/, TRANSFER],
  [/starbucks|dunkin|peet'?s|blue bottle|philz|coffee|cafe|espresso/, 'cat_coffee_shops'],
  [/whole foods|trader joe|safeway|kroger|albertsons|aldi|publix|wegmans|heb |h-e-b|sprouts|costco|sam'?s club|grocery|market|food lion|giant eagle|instacart/, 'cat_groceries'],
  [/doordash|uber eats|grubhub|postmates|chipotle|mcdonald|burger|pizza|taco|sushi|restaurant|grill|kitchen|bistro|diner|bar |pub |brewing|sweetgreen|panera|chick-fil|wendy|subway|shake shack|five guys|olive garden/, 'cat_restaurants_and_bars'],
  [/uber|lyft|taxi|cab /, 'cat_taxi_and_ride_shares'],
  [/shell|chevron|exxon|\bmobil\b|arco|76 |valero|sunoco|citgo|marathon|speedway|circle k|wawa|gas station|fuel/, 'cat_gas'],
  [/parking|toll|fastrak|ezpass|e-zpass|parkmobile|spothero/, 'cat_parking_and_tolls'],
  [/\bmetro\b|transit|\bbart\b|\bmta\b|caltrain|amtrak|clipper|ventra|septa|wmata/, 'cat_public_transit'],
  [/jiffy lube|autozone|pep boys|firestone|midas|car wash|o'reilly auto|mechanic/, 'cat_auto_maintenance'],
  [/netflix|hulu|spotify|disney\+|disney plus|hbo|max\.com|youtube premium|apple\.com\/bill|icloud|prime video|paramount|peacock|audible|patreon|substack|chatgpt|openai|claude\.ai|anthropic/, 'cat_subscriptions'],
  [/comcast|xfinity|spectrum|at&t internet|verizon fios|cox comm|frontier|google fiber|starlink/, 'cat_internet_and_cable'],
  [/t-mobile|verizon wireless|at&t wireless|mint mobile|\bvisible\b|google fi|cricket/, 'cat_phone'],
  [/pg&e|pge|con ed|coned|duke energy|edison|electric\b|power co|national grid|dominion|xcel|energy/, 'cat_gas_and_electric'],
  [/\bwater\b|utility/, 'cat_water'],
  [/waste management|republic services|recology/, 'cat_garbage'],
  [/mortgage|rocket mortgage|wells fargo home|loan servicing|mr\. cooper/, 'cat_mortgage'],
  [/\brent\b|apartment|property mgmt|avalon|equity residential/, 'cat_rent'],
  [/home depot|lowe'?s|ace hardware|menards|true value/, 'cat_home_improvement'],
  [/ikea|wayfair|crate & barrel|west elm|pottery barn|bed bath/, 'cat_furniture_and_housewares'],
  [/best buy|apple store|micro center|newegg|b&h photo/, 'cat_electronics'],
  [/\bgap\b|old navy|h&m|zara|uniqlo|nordstrom|macy'?s|nike|adidas|lululemon|j\.crew|banana republic/, 'cat_clothing'],
  [/amazon|amzn|target|walmart|etsy|ebay|shop|store/, 'cat_shopping'],
  [/airbnb|vrbo|hotel|marriott|hilton|hyatt|expedia|delta air|united air|american air|southwest|jetblue|alaska air|airline|booking\.com/, 'cat_travel_and_vacation'],
  [/amc |regal|cinema|theater|ticketmaster|stubhub|steam|playstation|xbox|nintendo|concert|museum/, 'cat_entertainment_and_recreation'],
  [/gym|fitness|equinox|peloton|planet fitness|orangetheory|crossfit|yoga|classpass/, 'cat_fitness'],
  [/dental|dentist|orthodont/, 'cat_dentist'],
  [/cvs|walgreens|pharmacy|rite aid|kaiser|medical|clinic|hospital|doctor|lab corp|quest diag/, 'cat_medical'],
  [/petco|petsmart|chewy|vet |veterinar/, 'cat_pets'],
  [/salon|barber|spa |sephora|ulta/, 'cat_personal'],
  [/daycare|child care|kindercare|bright horizons|nanny/, 'cat_child_care'],
  [/tuition|university|college|coursera|udemy|school/, 'cat_education'],
  [/navient|nelnet|great lakes|sallie mae|fedloan|mohela/, 'cat_student_loans'],
  [/geico|state farm|allstate|progressive|insurance|lemonade/, 'cat_insurance'],
  [/irs|tax payment|franchise tax|turbotax|h&r block/, 'cat_taxes'],
  [/\batm\b|cash withdrawal/, 'cat_cash_and_atm'],
  [/\bfees?\b|overdraft|service charge/, 'cat_financial_fees'],
  [/red cross|unicef|donation|charity|gofundme|wikimedia/, 'cat_charity'],
  [/check #|check \d|chk /, 'cat_check'],
];

export const TAG_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
