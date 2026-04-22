import Sidebar from "@/components/layout/Sidebar";

/**
 * AppLayout — wraps authenticated app pages with the sidebar.
 * Usage:
 *   <AppLayout>
 *     <YourPageContent />
 *   </AppLayout>
 *
 * Desktop: sidebar fixed at 288px, main content offset by 288px.
 * Mobile:  sticky top bar + slide-in drawer, no offset.
 */
export default function AppLayout({ children }) {
  return (
    <div className="min-h-screen flex flex-col md:flex-row" style={{ background: "#fcf8ff" }}>
      {/* Sidebar (handles its own desktop/mobile rendering) */}
      <Sidebar />

      {/* Main content area — pushed right on desktop only */}
      <main
        className="flex-1 w-full"
        style={{
          /* On md+ screens, leave space for the 288px sidebar */
          marginLeft: 0,
        }}
      >
        {/* Desktop margin is applied via the inner wrapper so mobile has no gap */}
        <div className="md:ml-[288px] min-h-screen">
          {children}
        </div>
      </main>
    </div>
  );
}
