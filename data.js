// Data and helpers shared by the shop page and the admin page

const defaultProducts = [
  { id: 1,  category: 'Ready-to-eat',     name: 'Gas pepper gizzard', unit: 'per plate',  price: 2500, image: '', available: true },
  { id: 2,  category: 'Ready-to-eat',     name: 'Baked wings',        unit: 'per plate',  price: 3000, image: '', available: true },
  { id: 3,  category: 'Ready-to-eat',     name: 'Shawarma',           unit: 'per piece',  price: 3500, image: '', available: true },
  { id: 4,  category: 'Ready-to-eat',     name: 'Burger',             unit: 'per piece',  price: 3000, image: '', available: true },
  { id: 5,  category: 'Ready-to-eat',     name: 'Gas pepper chicken', unit: 'per plate',  price: 4000, image: '', available: true },
  { id: 6,  category: 'Ready-to-eat',     name: 'Baked chicken',      unit: 'per piece',  price: 3500, image: '', available: false },
  { id: 7,  category: 'Ready-to-eat',     name: 'Fura da nono',       unit: 'per bottle', price: 1000, image: '', available: true },
  { id: 8,  category: 'Fresh and frozen', name: 'Catfish',            unit: 'per kg',     price: 5000, image: '', available: true },
  { id: 9,  category: 'Fresh and frozen', name: 'Chicken breast',     unit: 'per kg',     price: 5500, image: '', available: true },
  { id: 10, category: 'Fresh and frozen', name: 'Mince meat',         unit: 'per kg',     price: 6500, image: '', available: true },
  { id: 11, category: 'Fresh and frozen', name: 'Sausage',            unit: 'per pack',   price: 2500, image: '', available: true },
  { id: 12, category: 'Fresh and frozen', name: 'Fresh chicken',      unit: 'per kg',     price: 4500, image: '', available: true },
  { id: 13, category: 'Fresh and frozen', name: 'Fresh fish',         unit: 'per kg',     price: 4800, image: '', available: false },
  { id: 14, category: 'Drinks',           name: 'Soft drink',         unit: 'per bottle', price: 500,  image: '', available: true }
];

const defaultSettings = {
  deliveryFee: 500,
  phone: '',
  whatsapp: '',
  address: '',
  hours: ''
};

function readData(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value === null ? fallback : value;
  } catch (e) {
    return fallback;
  }
}

function writeData(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

function formatPrice(amount) {
  return '₦' + Number(amount).toLocaleString('en-NG');
}

function loadProducts() {
  const saved = readData('madallaProducts', null);
  if (Array.isArray(saved)) return saved;
  const copy = JSON.parse(JSON.stringify(defaultProducts));
  writeData('madallaProducts', copy);
  return copy;
}

function loadSettings() {
  return Object.assign({}, defaultSettings, readData('madallaSettings', {}));
}

function loadOrders() {
  return readData('madallaOrders', []);
}