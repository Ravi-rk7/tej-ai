import Sidebar from "@/components/layout/Sidebar";
import { RequireAuth } from "@/components/auth/AuthProvider";

export default function AppLayout({ children }) {
  return (
    <RequireAuth>
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
        <div className="md:ml-72 min-h-screen">
          {children}
        </div>
      </main>
      </div>
    </RequireAuth>
  );
}
