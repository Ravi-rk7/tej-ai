import DemoProvider from '@/components/demo/DemoProvider';
export const metadata = { title: 'Explore the demo · TejAi' };
export default function DemoLayout({ children }) { return <DemoProvider>{children}</DemoProvider>; }
