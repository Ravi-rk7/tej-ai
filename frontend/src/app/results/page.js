import { Suspense } from 'react';
import { LiveResult } from '@/components/portfolio/LivePages';
export default function Page() { return <Suspense fallback={<p role="status">Loading result…</p>}><LiveResult /></Suspense>; }
