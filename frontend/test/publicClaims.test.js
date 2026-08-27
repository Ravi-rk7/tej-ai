import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const PUBLIC_COPY_FILES = [
    'src/components/landing/PricingSection.js',
    'src/components/landing/HeroSection.js',
    'src/components/landing/CtaSection.js',
    'src/components/landing/HowItWorks.js',
    'src/components/paywall/PaywallModal.js',
    'src/components/layout/Footer.js',
    'src/components/layout/Sidebar.js',
    'src/app/privacy/page.js',
    'src/app/terms/page.js',
    'src/app/support/page.js',
];

test('public purchase surfaces do not advertise deferred or unsupported claims', async () => {
    const contents = await Promise.all(PUBLIC_COPY_FILES.map((path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')));
    const publicCopy = contents.join('\n');
    for (const forbidden of [
        /ingredient conflict/i,
        /scan history\s*&\s*comparisons/i,
        /priority support/i,
        /cancel anytime/i,
        /end-to-end encrypted/i,
        /no signup/i,
        /track glow score daily/i,
        /thousands of users/i,
        /2,400\+/,
        /detect skin issues/i,
        /know what(?:&apos;|')s wrong/i,
        /actually works/i,
        /clinical[- ]grade/i,
        /42 markers/i,
        /no dermatologist appointment/i,
        /never shared with third parties/i,
        /href=["']#["']/i,
        /\/community/i,
        /scientific method/i,
    ]) {
        assert.doesNotMatch(publicCopy, forbidden);
    }
});
