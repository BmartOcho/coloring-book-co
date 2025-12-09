import { getUncachableStripeClient } from '../server/stripeClient';

async function createProducts() {
  const stripe = await getUncachableStripeClient();

  console.log('Checking for existing coloring book product...');
  
  const existingProducts = await stripe.products.search({ 
    query: "name:'Personalized Coloring Story Book'" 
  });
  
  if (existingProducts.data.length > 0) {
    console.log('Coloring book product already exists:', existingProducts.data[0].id);
    const prices = await stripe.prices.list({ product: existingProducts.data[0].id });
    console.log('Existing prices:', prices.data.map(p => ({ id: p.id, amount: p.unit_amount })));
    return;
  }

  console.log('Creating coloring book product...');
  
  const product = await stripe.products.create({
    name: 'Personalized Coloring Story Book',
    description: 'A custom 26-page coloring story book featuring your character in a personalized adventure. Includes cover and 25 illustrated pages with your unique story.',
    metadata: {
      type: 'coloring_book',
      pages: '26',
    },
  });

  console.log('Created product:', product.id);

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 4500,
    currency: 'usd',
    metadata: {
      display_price: '$45.00',
    },
  });

  console.log('Created price:', price.id, '- $45.00');
  console.log('Done! Product and price are now available.');
}

createProducts().catch(console.error);
