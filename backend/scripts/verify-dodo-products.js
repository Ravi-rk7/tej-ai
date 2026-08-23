import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const TEST_API_ORIGIN = 'https://test.dodopayments.com';
const EXPECTED_PRODUCTS = Object.freeze({
    starter: {
        id: process.env.DODO_PRODUCT_ID_STARTER,
        name: 'Starter',
        amount: 699,
        currency: 'USD',
    },
    growth: {
        id: process.env.DODO_PRODUCT_ID_GROWTH,
        name: 'Growth',
        amount: 1299,
        currency: 'USD',
    },
    pro: {
        id: process.env.DODO_PRODUCT_ID_PRO,
        name: 'Pro',
        amount: 1999,
        currency: 'USD',
    },
});

const required = [
    ['DODO_API_KEY', process.env.DODO_API_KEY],
    ...Object.entries(EXPECTED_PRODUCTS).map(([plan, product]) => [
        `DODO_PRODUCT_ID_${plan.toUpperCase()}`,
        product.id,
    ]),
];

const missing = required
    .filter(([, value]) => typeof value !== 'string' || !value.trim())
    .map(([name]) => name);

if (missing.length > 0) {
    throw new Error(`Missing required Dodo test configuration: ${missing.join(', ')}`);
}

const ids = Object.values(EXPECTED_PRODUCTS).map(({ id }) => id);
const productIdsAreDistinct = new Set(ids).size === ids.length;

const configuredOrigin = process.env.DODO_API_BASE_URL || TEST_API_ORIGIN;
if (configuredOrigin !== TEST_API_ORIGIN) {
    throw new Error('Product verification is restricted to the Dodo test API');
}

const normalizePrice = (product) => {
    const price = product?.price || {};
    return {
        type: String(price.type || '').toLowerCase(),
        amount: Number(price.price),
        currency: String(price.currency || '').toUpperCase(),
        interval: String(price.payment_frequency_interval || '').toLowerCase(),
        intervalCount: Number(price.payment_frequency_count),
    };
};

let failed = !productIdsAreDistinct;

if (!productIdsAreDistinct) {
    console.log(JSON.stringify({
        configuration: 'product_ids',
        distinct: false,
        valid: false,
    }));
}

for (const [plan, expected] of Object.entries(EXPECTED_PRODUCTS)) {
    try {
        const response = await axios.get(
            `${TEST_API_ORIGIN}/products/${encodeURIComponent(expected.id)}`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.DODO_API_KEY}`,
                    Accept: 'application/json',
                },
                timeout: 10_000,
                validateStatus: (status) => status >= 200 && status < 300,
            }
        );

        const price = normalizePrice(response.data);
        const checks = {
            name: String(response.data?.name || '').trim().toLowerCase()
                === expected.name.toLowerCase(),
            recurring: price.type === 'recurring_price',
            amount: price.amount === expected.amount,
            currency: price.currency === expected.currency,
            monthly: price.interval === 'month' && price.intervalCount === 1,
        };
        const valid = Object.values(checks).every(Boolean);
        failed ||= !valid;

        console.log(JSON.stringify({
            plan,
            name: response.data?.name || null,
            price,
            checks,
            valid,
        }));
    } catch (error) {
        failed = true;
        console.log(JSON.stringify({
            plan,
            valid: false,
            error: 'DODO_PRODUCT_VERIFICATION_FAILED',
            status: error.response?.status || null,
        }));
    }
}

if (failed) {
    process.exitCode = 1;
}

if (process.argv.includes('--list-safe')) {
    try {
        const response = await axios.get(`${TEST_API_ORIGIN}/products`, {
            headers: {
                Authorization: `Bearer ${process.env.DODO_API_KEY}`,
                Accept: 'application/json',
            },
            params: { page_size: 100 },
            timeout: 10_000,
        });
        const products = Array.isArray(response.data?.items)
            ? response.data.items
            : Array.isArray(response.data)
                ? response.data
                : [];

        const discoveredProducts = [];
        for (const product of products) {
            const productId = product?.product_id;
            if (!productId) continue;

            const detail = await axios.get(
                `${TEST_API_ORIGIN}/products/${encodeURIComponent(productId)}`,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.DODO_API_KEY}`,
                        Accept: 'application/json',
                    },
                    timeout: 10_000,
                }
            );
            discoveredProducts.push({
                name: detail.data?.name || product?.name || null,
                price: normalizePrice(detail.data),
            });
        }

        console.log(JSON.stringify({ discoveredProducts }));
    } catch (error) {
        console.log(JSON.stringify({
            discoveredProducts: null,
            error: 'DODO_PRODUCT_LIST_FAILED',
            status: error.response?.status || null,
        }));
        process.exitCode = 1;
    }
}
