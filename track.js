const STEPS = {
  delivery: [
    ['placed', 'Order placed'],
    ['preparing', 'Preparing your order'],
    ['out_for_delivery', 'Out for delivery'],
    ['completed', 'Delivered']
  ],
  pickup: [
    ['placed', 'Order placed'],
    ['preparing', 'Preparing your order'],
    ['ready_for_pickup', 'Ready for pickup'],
    ['completed', 'Picked up']
  ]
};

function formatPrice(amount) {
  return '₦' + Number(amount).toLocaleString('en-NG');
}

function addLine(parent, text) {
  const p = document.createElement('p');
  p.textContent = text;
  parent.appendChild(p);
}

document.getElementById('trackForm').addEventListener('submit', async function (event) {
  event.preventDefault();

  const result = document.getElementById('result');
  result.innerHTML = '';

  const number = document.getElementById('orderNumber').value;
  const { data: order, error } = await db.rpc('track_order', { p_number: number });

  if (error) {
    addLine(result, 'Something went wrong: ' + error.message);
    return;
  }

  if (!order) {
    addLine(result, 'We could not find that order. Check the number and try again.');
    return;
  }

  const box = document.createElement('div');
  box.className = 'order-box';

  const title = document.createElement('h3');
  title.textContent = 'Order ' + order.order_number;
  box.appendChild(title);

  addLine(box, 'Name: ' + order.customer_name);
  addLine(box, order.fulfillment_type === 'delivery'
    ? 'Delivery to: ' + order.delivery_address
    : 'Pickup at the shop');

  order.items.forEach(function (item) {
    addLine(box, item.quantity + ' × ' + item.name + ' (' + formatPrice(item.unit_price) + ' ' + item.unit + ')');
  });

  addLine(box, 'Delivery fee: ' + formatPrice(order.delivery_fee));
  addLine(box, 'Total: ' + formatPrice(order.total));
  result.appendChild(box);

  if (order.status === 'cancelled') {
    const cancelled = document.createElement('p');
    cancelled.className = 'cancelled';
    cancelled.textContent = 'This order was cancelled.';
    result.appendChild(cancelled);
    return;
  }

  const steps = STEPS[order.fulfillment_type];
  const currentIndex = steps.findIndex(function (s) { return s[0] === order.status; });

  const list = document.createElement('ol');
  list.className = 'steps';

  steps.forEach(function (step, index) {
    const li = document.createElement('li');
    li.textContent = step[1];
    if (index < currentIndex) li.className = 'done';
    if (index === currentIndex) li.className = 'done current';
    list.appendChild(li);
  });

  result.appendChild(list);
});