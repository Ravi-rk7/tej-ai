import { DemoPage } from '@/components/demo/DemoPages';
export default async function Page({ params }) { const { sampleId } = await params; return <DemoPage view="result" sampleId={sampleId} />; }
