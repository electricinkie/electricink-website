// Publishable key será injetado via script tag no HTML
const stripePublishableKey = window.STRIPE_PUBLISHABLE_KEY || '';

if (!stripePublishableKey) {
	console.error('STRIPE_PUBLISHABLE_KEY not found');
}
